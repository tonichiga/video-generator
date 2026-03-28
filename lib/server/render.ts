import path from "node:path";
import fs from "node:fs/promises";
import { ChildProcess, spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

import { createId } from "@/lib/server/ids";
import {
  getAssetById,
  getProjectById,
  insertAsset,
  updateRenderJobById,
  getRenderJobById,
} from "@/lib/server/repository";
import { getStorageDirs, relativePathFromRoot } from "@/lib/server/storage";
import { getVideoProfile } from "@/lib/server/video-profiles";

type StartRenderInput = {
  renderJobId: string;
};

const activeRenderProcesses = new Map<string, ChildProcess>();

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function parseHexForFfmpeg(color: string) {
  return color.startsWith("#") ? `0x${color.slice(1)}` : "0xFFFFFF";
}

function buildParticleLayerFilter(
  preset: string,
  density: number,
  speed: number,
) {
  const normalizedDensity = Math.min(1, Math.max(0, density));
  const normalizedSpeed = Math.min(1, Math.max(0.1, speed));

  if (preset === "off") {
    return {
      inputLabel: "bg",
      filter: null,
    };
  }

  if (preset === "geometric") {
    const driftA = Math.max(28, Math.round(120 * normalizedSpeed));
    const driftB = Math.max(24, Math.round(98 * normalizedSpeed));
    const point = Math.max(3, Math.round(2 + normalizedDensity * 4));

    return {
      inputLabel: "bgfx",
      filter: [
        `[bg]drawbox=x='mod(t*${driftA}\\,iw)':y='mod(t*${driftB}+ih*0.2\\,ih)':w=${point}:h=${point}:color=0x79C6FF@0.52:t=fill`,
        `drawbox=x='mod(t*${driftB}+iw*0.46\\,iw)':y='mod(t*${driftA}+ih*0.68\\,ih)':w=${point + 1}:h=${point + 1}:color=0xCDE7FF@0.36:t=fill`,
        `drawbox=x='mod(t*${driftA + 22}+iw*0.18\\,iw)':y='mod(t*${driftB + 14}+ih*0.44\\,ih)':w=${point}:h=${point}:color=0x4AA8FF@0.28:t=fill[bgfx]`,
      ].join(","),
    };
  }

  if (preset === "fire") {
    const speedA = Math.max(36, Math.round(130 * normalizedSpeed));
    const speedB = Math.max(30, Math.round(110 * normalizedSpeed));
    const sparkSize = Math.max(3, Math.round(3 + normalizedDensity * 5));

    return {
      inputLabel: "bgfx",
      filter: [
        `[bg]drawbox=x='mod(t*${speedA}\\,iw)':y='ih*0.84+sin(t*2.4)*ih*0.1':w=${sparkSize}:h=${sparkSize}:color=0xFF7A2D@0.8:t=fill`,
        `drawbox=x='mod(t*${speedB}+iw*0.31\\,iw)':y='ih*0.76+cos(t*1.7)*ih*0.12':w=${sparkSize + 1}:h=${sparkSize + 1}:color=0xFFD08A@0.56:t=fill`,
        `drawbox=x='mod(t*${speedA + 42}+iw*0.68\\,iw)':y='ih*0.81+sin(t*2.1+0.7)*ih*0.09':w=${sparkSize}:h=${sparkSize}:color=0xFFB84E@0.5:t=fill[bgfx]`,
      ].join(","),
    };
  }

  if (
    preset === "neon" ||
    preset === "pulse" ||
    preset === "dust" ||
    preset === "stardust" ||
    preset === "retro"
  ) {
    const speedA = Math.max(32, Math.round(118 * normalizedSpeed));
    const speedB = Math.max(26, Math.round(96 * normalizedSpeed));
    const size = Math.max(2, Math.round(2 + normalizedDensity * 3));

    const colorA =
      preset === "retro"
        ? "0xFFB866"
        : preset === "dust"
          ? "0xD7E6FF"
          : "0x67E6FF";
    const colorB =
      preset === "retro"
        ? "0xFF6C5F"
        : preset === "stardust"
          ? "0xB7C6FF"
          : "0x53A8FF";

    return {
      inputLabel: "bgfx",
      filter: [
        `[bg]drawbox=x='mod(t*${speedA}\\,iw)':y='mod(t*${speedB}+ih*0.24\\,ih)':w=${size}:h=${size}:color=${colorA}@0.52:t=fill`,
        `drawbox=x='mod(t*${speedB}+iw*0.31\\,iw)':y='mod(t*${speedA}+ih*0.62\\,ih)':w=${size + 1}:h=${size + 1}:color=${colorB}@0.42:t=fill`,
        `drawbox=x='mod(t*${speedA + 18}+iw*0.57\\,iw)':y='mod(t*${speedB + 11}+ih*0.43\\,ih)':w=${size}:h=${size}:color=${colorA}@0.34:t=fill[bgfx]`,
      ].join(","),
    };
  }

  const noiseStrength = Math.max(2, Math.round(4 + normalizedDensity * 6));
  return {
    inputLabel: "bgfx",
    filter: `[bg]noise=alls=${noiseStrength}:allf=t+u,eq=contrast=1.04:saturation=1.08[bgfx]`,
  };
}

function parseTimestampToSeconds(value: string) {
  const parts = value.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  const ss = Number(parts[2]);
  if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(ss)) {
    return null;
  }

  return hh * 3600 + mm * 60 + ss;
}

async function runFfmpeg(
  renderJobId: string,
  ffmpegBinary: string,
  args: string[],
  durationSec: number,
) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(ffmpegBinary, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    activeRenderProcesses.set(renderJobId, ffmpeg);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;

      const match = /time=(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(text);
      if (!match) {
        return;
      }

      const elapsed = parseTimestampToSeconds(match[1]);
      if (elapsed === null || durationSec <= 0) {
        return;
      }

      const normalized = Math.min(1, elapsed / durationSec);
      const nextProgress = Math.max(
        12,
        Math.min(96, Math.round(12 + normalized * 84)),
      );
      void updateRenderJobById(renderJobId, {
        progress: nextProgress,
      });
    });

    ffmpeg.on("error", (error) => reject(error));
    ffmpeg.on("close", (code) => {
      activeRenderProcesses.delete(renderJobId);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1200)}`),
      );
    });
  });
}

export async function runRenderJob({ renderJobId }: StartRenderInput) {
  console.info("[render] job started", { renderJobId });
  const current = await getRenderJobById(renderJobId);
  if (!current) {
    console.warn("[render] job missing", { renderJobId });
    return;
  }

  const project = await getProjectById(current.projectId);
  if (!project) {
    console.error("[render] project missing", {
      renderJobId,
      projectId: current.projectId,
    });
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "PROJECT_NOT_FOUND",
      errorMessage: "Project not found for render job",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  const ffmpegBinary = await resolveFfmpegBinary();
  if (!ffmpegBinary) {
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "FFMPEG_NOT_AVAILABLE",
      errorMessage: "ffmpeg is not installed or not executable",
      finishedAt: new Date().toISOString(),
    });
    console.error("[render] ffmpeg unavailable", {
      renderJobId,
      candidates: getFfmpegCandidates(),
    });
    return;
  }

  console.info("[render] ffmpeg selected", { renderJobId, ffmpegBinary });

  const [posterAsset, trackAsset] = await Promise.all([
    getAssetById(project.posterAssetId),
    getAssetById(project.trackAssetId),
  ]);

  if (!posterAsset || posterAsset.kind !== "poster") {
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "POSTER_NOT_FOUND",
      errorMessage: "Poster asset not found for render",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  if (!trackAsset || trackAsset.kind !== "track") {
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "TRACK_NOT_FOUND",
      errorMessage: "Track asset not found for render",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  await updateRenderJobById(renderJobId, {
    status: "processing",
    startedAt: new Date().toISOString(),
    progress: 10,
    watermarkApplied: project.watermarkEnabled,
  });

  await sleep(200);
  await updateRenderJobById(renderJobId, { progress: 12 });

  const { width, height, fps } = getVideoProfile(
    project.format,
    project.quality,
  );
  const eqHeightPx = Math.max(
    32,
    Math.round(height * project.equalizerConfig.height),
  );
  const eqWidthPx = Math.max(
    80,
    Math.round(width * project.equalizerConfig.width),
  );
  const eqX = Math.max(
    0,
    Math.round((width - eqWidthPx) * project.equalizerConfig.x),
  );
  const eqYCenter = Math.round(height * project.equalizerConfig.y);
  const eqY = Math.min(
    height - eqHeightPx,
    Math.max(0, eqYCenter - Math.floor(eqHeightPx / 2)),
  );
  const eqColor = parseHexForFfmpeg(project.equalizerConfig.color);
  const visualizerType = project.equalizerConfig.visualizerType ?? "bars";
  const particleLayer = buildParticleLayerFilter(
    project.particleConfig?.preset ?? "neon",
    project.particleConfig?.density ?? 0.55,
    project.particleConfig?.speed ?? 0.5,
  );

  const posterScaleFactor = 0.48;
  const posterW = Math.round(width * posterScaleFactor);

  const watermarkFilter = project.watermarkEnabled
    ? ",drawbox=x=iw-240:y=ih-84:w=220:h=44:color=black@0.35:t=fill"
    : "";

  const filterGraph = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=${Math.max(4, project.posterConfig.blurStrength * 0.65)}:steps=2[bg]`,
    `[0:v]scale=${posterW}:-2[poster]`,
  ];

  if (visualizerType === "symmetricBars") {
    const halfEqHeight = Math.max(16, Math.floor(eqHeightPx / 2));
    filterGraph.push(
      `[1:a]aformat=channel_layouts=mono,showfreqs=s=${eqWidthPx}x${halfEqHeight}:mode=bar:fscale=log:ascale=sqrt:colors=${eqColor}[eqhalf_src]`,
      `[eqhalf_src]split=2[eqhalf_top][eqhalf_bottom_src]`,
      `[eqhalf_bottom_src]vflip[eqhalf_bottom]`,
      `[eqhalf_top][eqhalf_bottom]vstack[eq]`,
    );
  } else if (visualizerType === "bars") {
    filterGraph.push(
      `[1:a]aformat=channel_layouts=mono,showfreqs=s=${eqWidthPx}x${eqHeightPx}:mode=bar:fscale=log:ascale=sqrt:colors=${eqColor}[eq]`,
    );
  } else if (visualizerType === "dots") {
    filterGraph.push(
      `[1:a]aformat=channel_layouts=mono,showfreqs=s=${eqWidthPx}x${eqHeightPx}:mode=dot:fscale=log:ascale=sqrt:colors=${eqColor}[eq]`,
    );
  } else {
    filterGraph.push(
      `[1:a]showwaves=s=${eqWidthPx}x${eqHeightPx}:mode=cline:colors=${eqColor}[eq]`,
    );
  }

  if (particleLayer.filter) {
    filterGraph.push(particleLayer.filter);
  }

  filterGraph.push(
    `[${particleLayer.inputLabel}][eq]overlay=${eqX}:${eqY}[scene1]`,
    `[scene1][poster]overlay=(W-w)/2:(H-h)/2${watermarkFilter}[vout]`,
  );

  const filterComplex = filterGraph.join(";");

  const outputAssetId = createId("ast_render");
  const outputPath = path.join(
    getStorageDirs().renders,
    `${outputAssetId}.mp4`,
  );
  const ffmpegArgs = [
    "-y",
    "-loop",
    "1",
    "-i",
    posterAsset.filePath,
    "-i",
    trackAsset.filePath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "1:a:0",
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await updateRenderJobById(renderJobId, { progress: 18 });

  try {
    await runFfmpeg(
      renderJobId,
      ffmpegBinary,
      ffmpegArgs,
      trackAsset.durationSec ?? 120,
    );
  } catch (error) {
    const latest = await getRenderJobById(renderJobId);
    if (latest?.status === "canceled") {
      console.info("[render] canceled by user", { renderJobId });
      return;
    }

    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "RENDER_FFMPEG_FAILED",
      errorMessage:
        error instanceof Error ? error.message : "ffmpeg render failed",
      finishedAt: new Date().toISOString(),
    });
    console.error("[render] ffmpeg failed", { renderJobId, error });
    return;
  }

  await updateRenderJobById(renderJobId, { progress: 97 });
  const latest = await getRenderJobById(renderJobId);
  if (latest?.status === "canceled") {
    await fs.unlink(outputPath).catch(() => null);
    console.info("[render] output removed after cancel", { renderJobId });
    return;
  }

  const fileStats = await fs.stat(outputPath).catch(() => null);
  if (!fileStats) {
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "RENDER_OUTPUT_MISSING",
      errorMessage: "Rendered output file is missing after ffmpeg run",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  await insertAsset({
    id: outputAssetId,
    kind: "render",
    filePath: outputPath,
    mimeType: "video/mp4",
    size: fileStats.size,
    durationSec: null,
    width,
    height,
    checksum: `${project.id}:${Date.now()}`,
    createdAt: new Date().toISOString(),
  });

  await updateRenderJobById(renderJobId, {
    status: "done",
    progress: 100,
    outputAssetId,
    outputPath: relativePathFromRoot(outputPath),
    finishedAt: new Date().toISOString(),
  });

  console.info("[render] job completed", { renderJobId, outputAssetId });
}

export async function cancelRenderJob(renderJobId: string) {
  const job = await getRenderJobById(renderJobId);
  if (!job) {
    return { found: false, finished: false };
  }

  if (
    job.status === "done" ||
    job.status === "failed" ||
    job.status === "canceled"
  ) {
    return { found: true, finished: true };
  }

  const processRef = activeRenderProcesses.get(renderJobId);
  if (processRef) {
    processRef.kill("SIGTERM");
    setTimeout(() => {
      if (!processRef.killed) {
        processRef.kill("SIGKILL");
      }
    }, 1200);
  }

  await updateRenderJobById(renderJobId, {
    status: "canceled",
    errorCode: "RENDER_CANCELED",
    errorMessage: "Render canceled by user",
    finishedAt: new Date().toISOString(),
  });

  return { found: true, finished: false };
}
