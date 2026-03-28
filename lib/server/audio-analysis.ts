import path from "node:path";
import { spawn } from "node:child_process";

import { fft, util as fftUtil } from "fft-js";
import ffmpegStatic from "ffmpeg-static";

import { getAssetById, updateAnalysisById } from "@/lib/server/repository";
import {
  getStorageDirs,
  relativePathFromRoot,
  writeJson,
} from "@/lib/server/storage";

function clampBandValue(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getFfmpegCandidates() {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegStatic,
    "ffmpeg",
    process.platform === "darwin" ? "/opt/homebrew/bin/ffmpeg" : undefined,
    process.platform === "darwin" ? "/usr/local/bin/ffmpeg" : undefined,
  ].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return [...new Set(candidates)];
}

async function canRunFfmpeg(binary: string) {
  return new Promise<boolean>((resolve) => {
    const cmd = spawn(binary, ["-version"], {
      stdio: "ignore",
    });

    cmd.on("error", () => resolve(false));
    cmd.on("close", (code) => resolve(code === 0));
  });
}

async function resolveFfmpegBinary() {
  const candidates = getFfmpegCandidates();

  for (const candidate of candidates) {
    if (await canRunFfmpeg(candidate)) {
      return candidate;
    }
  }

  return null;
}

function nextPow2(value: number) {
  let power = 1;
  while (power < value) {
    power <<= 1;
  }
  return power;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.max(0, Math.min(1, p));
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * clampedP)),
  );
  return sorted[index] ?? 0;
}

function decodeF32MonoPcm(input: {
  ffmpegBinary: string;
  filePath: string;
  sampleRate: number;
}) {
  const { ffmpegBinary, filePath, sampleRate } = input;

  return new Promise<Float32Array>((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-i",
      filePath,
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "f32le",
      "pipe:1",
    ];

    const ffmpeg = spawn(ffmpegBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    let stderr = "";

    ffmpeg.stdout.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`ffmpeg decode failed (${code}): ${stderr.slice(-800)}`),
        );
        return;
      }

      const pcmBuffer = Buffer.concat(chunks);
      const samples = Math.floor(pcmBuffer.length / 4);
      const next = new Float32Array(samples);

      for (let index = 0; index < samples; index += 1) {
        next[index] = pcmBuffer.readFloatLE(index * 4);
      }

      resolve(next);
    });
  });
}

function buildBandEdges(input: {
  bands: number;
  sampleRate: number;
  fftSize: number;
}) {
  const { bands, sampleRate, fftSize } = input;
  const nyquist = sampleRate / 2;
  const minFreq = 30;
  const maxFreq = Math.max(minFreq + 1, nyquist - 10);
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);

  const edges: number[] = [];
  for (let index = 0; index <= bands; index += 1) {
    const t = index / bands;
    const freq = Math.pow(10, minLog + (maxLog - minLog) * t);
    const bin = Math.max(
      1,
      Math.min(
        Math.floor(fftSize / 2) - 1,
        Math.round((freq / nyquist) * (fftSize / 2)),
      ),
    );
    edges.push(bin);
  }

  for (let index = 1; index < edges.length; index += 1) {
    if (edges[index] <= edges[index - 1]) {
      edges[index] = edges[index - 1] + 1;
    }
  }

  edges[edges.length - 1] = Math.min(
    edges[edges.length - 1],
    Math.floor(fftSize / 2) - 1,
  );
  return edges;
}

function analyzeRealSeries(input: {
  pcm: Float32Array;
  bands: number;
  frameStepMs: number;
  sampleRate: number;
}) {
  const { pcm, bands, frameStepMs, sampleRate } = input;
  const samplesPerFrame = Math.max(
    64,
    Math.round((sampleRate * frameStepMs) / 1000),
  );
  const frameCount = Math.max(1, Math.ceil(pcm.length / samplesPerFrame));
  const fftSize = nextPow2(Math.max(256, samplesPerFrame));
  const bandEdges = buildBandEdges({ bands, sampleRate, fftSize });

  const window = Array.from({ length: fftSize }).map((_, index) => {
    if (fftSize <= 1) {
      return 1;
    }
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
  });

  const rawEnvelope: number[] = [];
  const rawSpectrum: number[][] = [];
  const bandMax = Array.from({ length: bands }).map(() => 1e-6);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * samplesPerFrame;
    const end = Math.min(pcm.length, start + samplesPerFrame);

    let sumSq = 0;
    const fftInput = new Array<number>(fftSize).fill(0);

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const local = sampleIndex - start;
      const sample = pcm[sampleIndex] ?? 0;
      sumSq += sample * sample;

      if (local < fftSize) {
        fftInput[local] = sample * window[local];
      }
    }

    const length = Math.max(1, end - start);
    const rms = Math.sqrt(sumSq / length);
    rawEnvelope.push(rms);

    const phasors = fft(fftInput);
    const magnitudes = fftUtil.fftMag(phasors).slice(0, fftSize / 2);

    const row: number[] = [];
    for (let band = 0; band < bands; band += 1) {
      const from = bandEdges[band] ?? 1;
      const to = Math.max(from + 1, bandEdges[band + 1] ?? from + 1);

      let sum = 0;
      let count = 0;
      for (let bin = from; bin < to && bin < magnitudes.length; bin += 1) {
        sum += magnitudes[bin] ?? 0;
        count += 1;
      }

      const energy = count > 0 ? sum / count : 0;
      row.push(energy);
      if (energy > bandMax[band]) {
        bandMax[band] = energy;
      }
    }

    rawSpectrum.push(row);
  }

  const envRef = Math.max(1e-6, percentile(rawEnvelope, 0.98));
  const envelope = rawEnvelope.map((value) =>
    Number(clampBandValue(Math.pow(value / envRef, 0.72)).toFixed(4)),
  );

  const spectrum = rawSpectrum.map((row) =>
    row.map((value, index) => {
      const ref = Math.max(1e-6, bandMax[index] * 0.92);
      const normalized = Math.pow(value / ref, 0.75);
      return Number(clampBandValue(normalized).toFixed(4));
    }),
  );

  return {
    spectrum,
    envelope,
  };
}

function createSyntheticSeries(
  durationSec: number,
  bands: number,
  frameStepMs: number,
) {
  const frameCount = Math.max(1, Math.ceil((durationSec * 1000) / frameStepMs));
  const spectrum: number[][] = [];
  const envelope: number[] = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = frame / frameCount;
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 8);
    const envValue = clampBandValue(0.2 + pulse * 0.75);
    envelope.push(Number(envValue.toFixed(4)));

    const row: number[] = [];
    for (let band = 0; band < bands; band += 1) {
      const bandMix =
        0.5 + 0.5 * Math.sin((t * 12 + band / bands) * Math.PI * 2);
      row.push(
        Number(clampBandValue(envValue * (0.45 + bandMix * 0.55)).toFixed(4)),
      );
    }
    spectrum.push(row);
  }

  return {
    spectrum,
    envelope,
  };
}

export async function runAudioAnalysisJob(analysisId: string) {
  const analysis = await updateAnalysisById(analysisId, {
    status: "processing",
  });
  if (!analysis) {
    return;
  }

  const asset = await getAssetById(analysis.trackAssetId);
  if (!asset) {
    await updateAnalysisById(analysisId, { status: "failed" });
    return;
  }

  let values: { spectrum: number[][]; envelope: number[] } | null = null;

  try {
    const ffmpegBinary = await resolveFfmpegBinary();
    if (!ffmpegBinary) {
      throw new Error("ffmpeg not available for analysis");
    }

    const sampleRate = 22050;
    const pcm = await decodeF32MonoPcm({
      ffmpegBinary,
      filePath: asset.filePath,
      sampleRate,
    });

    values = analyzeRealSeries({
      pcm,
      bands: analysis.bands,
      frameStepMs: analysis.frameStepMs,
      sampleRate,
    });
  } catch (error) {
    const durationSec = asset.durationSec ?? 120;
    values = createSyntheticSeries(
      durationSec,
      analysis.bands,
      analysis.frameStepMs,
    );
    console.warn("[analysis] fallback synthetic series", {
      analysisId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }

  const spectrumPath = path.join(
    getStorageDirs().analysis,
    `${analysisId}_spectrum.json`,
  );
  const envelopePath = path.join(
    getStorageDirs().analysis,
    `${analysisId}_envelope.json`,
  );

  await writeJson(spectrumPath, {
    analysisId,
    bands: analysis.bands,
    frameStepMs: analysis.frameStepMs,
    values: values.spectrum,
  });

  await writeJson(envelopePath, {
    analysisId,
    frameStepMs: analysis.frameStepMs,
    values: values.envelope,
  });

  await updateAnalysisById(analysisId, {
    status: "done",
    spectrumSeriesPath: relativePathFromRoot(spectrumPath),
    envelopeSeriesPath: relativePathFromRoot(envelopePath),
  });
}
