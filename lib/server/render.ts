import path from "node:path";
import fs from "node:fs/promises";
import { ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";

import { resolveSceneTimeline } from "@/lib/domain/scene";
import { applyKeyframesToEqualizer, clampNumber } from "@/lib/domain/timeline";
import {
  createInitialBeatPulseState,
  getNextBeatPulseState,
} from "@/lib/domain/beat-pulse";
import {
  buildCameraPunchScaleExpression,
  detectCameraPunchBeatsMs,
} from "@/lib/domain/camera-punch";
import { buildParallaxBackgroundCropExpressions } from "@/lib/domain/parallax-drift";
import {
  defaultPosterConfig,
  defaultTrackTextConfig,
} from "@/lib/domain/defaults";
import { renderWatermarkConfig } from "@/lib/server/env";
import {
  normalizeSpectrumBands,
  spectrumFrameIndexAtMs,
} from "@/lib/domain/spectrum";
import type {
  EqualizerConfig,
  TimelineKeyframeTrack,
} from "@/lib/domain/types";
import { builtInTemplates } from "@/lib/domain/templates";
import { getVisualizerBarCount } from "@/lib/domain/visualizer";
import { createId } from "@/lib/server/ids";
import {
  getAssetById,
  getAnalysisById,
  getProjectById,
  insertAsset,
  updateRenderJobById,
  getRenderJobById,
} from "@/lib/server/repository";
import {
  absolutePathFromRoot,
  getStorageDirs,
  readJson,
  relativePathFromRoot,
} from "@/lib/server/storage";
import { getVideoProfile } from "@/lib/server/video-profiles";

type StartRenderInput = {
  renderJobId: string;
};

type SpectrumSeries = {
  frameStepMs: number;
  bands: number;
  values: number[][];
};

const activeRenderProcesses = new Map<string, ChildProcess>();
const RENDER_LAYER_CACHE_VERSION =
  "2026-03-31-viz-preview-parity-beat-pulse-v6";

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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function renderTrackTextOverlay(input: {
  outputPath: string;
  width: number;
  height: number;
  artist: string;
  songName: string;
  color: string;
  x: number;
  y: number;
  size: number;
  gap: number;
  align: "left" | "center" | "right";
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkFontSize: number;
}) {
  const {
    outputPath,
    width,
    height,
    artist,
    songName,
    color,
    x,
    y,
    size,
    gap,
    align,
    watermarkEnabled,
    watermarkText,
    watermarkFontSize,
  } = input;

  const songFontSize = Math.round(clampNumber(size, 14, 120));
  const artistFontSize = Math.max(12, Math.round(songFontSize * 0.72));
  const gapPx = Math.round(clampNumber(gap, 0, 120));
  const songOffsetY = Math.round(artistFontSize * 1.05) + gapPx;
  const xPx = Math.round(width * clampNumber(x, 0, 1));
  const yPx = Math.round(height * clampNumber(y, 0, 1));
  const anchor =
    align === "center" ? "middle" : align === "right" ? "end" : "start";

  const safeArtist = escapeSvgText(artist.trim());
  const safeSongName = escapeSvgText(songName.trim());

  const safeWatermarkText = escapeSvgText(watermarkText.trim());
  const wmFontSize = Math.round(clampNumber(watermarkFontSize, 10, 72));
  const wmPaddingX = Math.max(8, Math.round(wmFontSize * 0.62));
  const wmPaddingY = Math.max(6, Math.round(wmFontSize * 0.38));
  const wmTextWidth = Math.round(safeWatermarkText.length * wmFontSize * 0.56);
  const wmBoxW = Math.min(
    Math.max(90, wmTextWidth + wmPaddingX * 2),
    Math.max(100, width - 24),
  );
  const wmBoxH = Math.max(28, Math.round(wmFontSize + wmPaddingY * 2));
  const wmX = Math.max(12, width - wmBoxW - 16);
  const wmY = Math.max(12, height - wmBoxH - 16);

  const watermarkSvg =
    watermarkEnabled && safeWatermarkText.length > 0
      ? `<g>
      <rect x="${wmX}" y="${wmY}" width="${wmBoxW}" height="${wmBoxH}" rx="8" ry="8" fill="black" fill-opacity="0.35" />
      <text x="${wmX + wmPaddingX}" y="${wmY + wmPaddingY}" dominant-baseline="hanging" font-size="${wmFontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="600" fill="white" fill-opacity="0.95">${safeWatermarkText}</text>
    </g>`
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <g text-anchor="${anchor}" fill="${color}">
    <text x="${xPx}" y="${yPx + 2}" dominant-baseline="hanging" font-size="${artistFontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="500" fill="black" fill-opacity="0.62">${safeArtist}</text>
    <text x="${xPx}" y="${yPx}" dominant-baseline="hanging" font-size="${artistFontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="500">${safeArtist}</text>
    <text x="${xPx}" y="${yPx + songOffsetY + 3}" dominant-baseline="hanging" font-size="${songFontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="black" fill-opacity="0.7">${safeSongName}</text>
    <text x="${xPx}" y="${yPx + songOffsetY}" dominant-baseline="hanging" font-size="${songFontSize}" font-family="Arial, Helvetica, sans-serif" font-weight="700">${safeSongName}</text>
  </g>
  ${watermarkSvg}
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

function getBaseLayerCacheFileName(input: {
  posterAssetId: string;
  format: string;
  quality: string;
  width: number;
  height: number;
  fps: number;
  blurStrength: number;
  backgroundDimStrength: number;
  usePreparedBackground: boolean;
  watermarkEnabled: boolean;
}) {
  const hash = createHash("sha1")
    .update(
      JSON.stringify({
        version: RENDER_LAYER_CACHE_VERSION,
        ...input,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  return `base_${hash}.mp4`;
}

function getVisualizerLayerCacheFileName(input: {
  analysisId: string;
  trackAssetId: string;
  visualizerType: string;
  visualizerBarCount: number;
  equalizerConfig: EqualizerConfig;
  keyframes: TimelineKeyframeTrack[];
  eqColor: string;
  trimInMs: number;
  trimOutMs: number;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}) {
  const hash = createHash("sha1")
    .update(
      JSON.stringify({
        version: RENDER_LAYER_CACHE_VERSION,
        ...input,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  return `viz_${hash}.mov`;
}

function getPosterLayerCacheFileName(input: {
  posterAssetId: string;
  analysisId: string;
  trimInMs: number;
  trimOutMs: number;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  basePosterWidth: number;
  basePosterHeight: number;
  barCount: number;
  beatScaleStrength: number;
  cornerRadiusPx: number;
  borderEnabled: boolean;
  borderColor: string;
  borderPx: number;
}) {
  const hash = createHash("sha1")
    .update(
      JSON.stringify({
        version: RENDER_LAYER_CACHE_VERSION,
        ...input,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  return `poster_${hash}.mov`;
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

function parseHexRgb(color: string) {
  const normalized = color.startsWith("#") ? color.slice(1) : color;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function blendPixel(
  frame: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const a = clampNumber(alpha, 0, 255);
  if (a <= 0) {
    return;
  }

  const offset = (y * width + x) * 4;
  const dstA = frame[offset + 3] ?? 0;
  const outA = Math.min(255, a + dstA);
  const srcWeight = a / 255;

  frame[offset] = Math.round(
    (frame[offset] ?? 0) * (1 - srcWeight) + r * srcWeight,
  );
  frame[offset + 1] = Math.round(
    (frame[offset + 1] ?? 0) * (1 - srcWeight) + g * srcWeight,
  );
  frame[offset + 2] = Math.round(
    (frame[offset + 2] ?? 0) * (1 - srcWeight) + b * srcWeight,
  );
  frame[offset + 3] = outA;
}

function drawFilledCircle(
  frame: Buffer,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: { r: number; g: number; b: number },
  alpha = 255,
) {
  const r = Math.max(1, Math.round(radius));

  for (let y = centerY - r; y <= centerY + r; y += 1) {
    for (let x = centerX - r; x <= centerX + r; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > r * r) {
        continue;
      }

      blendPixel(frame, width, height, x, y, color.r, color.g, color.b, alpha);
    }
  }
}

function drawRoundedBar(
  frame: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  barWidth: number,
  barHeight: number,
  color: { r: number; g: number; b: number },
  alpha = 240,
  roundAt: "top" | "bottom" = "top",
) {
  const w = Math.max(1, Math.round(barWidth));
  const h = Math.max(1, Math.round(barHeight));
  const radius = Math.min(Math.floor(w / 2), 6, h);

  if (roundAt === "top") {
    const bodyTop = y + radius;
    for (let py = bodyTop; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        blendPixel(
          frame,
          width,
          height,
          px,
          py,
          color.r,
          color.g,
          color.b,
          alpha,
        );
      }
    }

    if (radius <= 0) {
      return;
    }

    const leftCenterX = x + radius;
    const rightCenterX = x + w - radius - 1;
    const centerY = y + radius;

    for (let py = y; py < y + radius; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        const isMiddle = px >= leftCenterX && px <= rightCenterX;
        if (isMiddle) {
          blendPixel(
            frame,
            width,
            height,
            px,
            py,
            color.r,
            color.g,
            color.b,
            alpha,
          );
          continue;
        }

        const cx = px < leftCenterX ? leftCenterX : rightCenterX;
        const dx = px - cx;
        const dy = py - centerY;
        if (dx * dx + dy * dy <= radius * radius) {
          blendPixel(
            frame,
            width,
            height,
            px,
            py,
            color.r,
            color.g,
            color.b,
            alpha,
          );
        }
      }
    }

    return;
  }

  const bodyBottom = y + h - radius;
  for (let py = y; py < bodyBottom; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      blendPixel(
        frame,
        width,
        height,
        px,
        py,
        color.r,
        color.g,
        color.b,
        alpha,
      );
    }
  }

  if (radius <= 0) {
    return;
  }

  const leftCenterX = x + radius;
  const rightCenterX = x + w - radius - 1;
  const centerY = y + h - radius - 1;

  for (let py = bodyBottom; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const isMiddle = px >= leftCenterX && px <= rightCenterX;
      if (isMiddle) {
        blendPixel(
          frame,
          width,
          height,
          px,
          py,
          color.r,
          color.g,
          color.b,
          alpha,
        );
        continue;
      }

      const cx = px < leftCenterX ? leftCenterX : rightCenterX;
      const dx = px - cx;
      const dy = py - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(
          frame,
          width,
          height,
          px,
          py,
          color.r,
          color.g,
          color.b,
          alpha,
        );
      }
    }
  }
}

function drawLine(
  frame: Buffer,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: { r: number; g: number; b: number },
  thickness = 2,
  alpha = 245,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const x = Math.round(x1 + dx * t);
    const y = Math.round(y1 + dy * t);

    for (let oy = -thickness; oy <= thickness; oy += 1) {
      for (let ox = -thickness; ox <= thickness; ox += 1) {
        if (ox * ox + oy * oy > thickness * thickness) {
          continue;
        }

        blendPixel(
          frame,
          width,
          height,
          x + ox,
          y + oy,
          color.r,
          color.g,
          color.b,
          alpha,
        );
      }
    }
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function toEven(value: number, min = 2) {
  const rounded = Math.max(min, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function toFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildResponsiveSpectrumFrame(input: {
  frames: number[][];
  absoluteMs: number;
  frameStepMs: number;
  barCount: number;
}) {
  const { frames, absoluteMs, frameStepMs, barCount } = input;

  if (frames.length === 0) {
    return Array.from({ length: barCount }).map(() => 0.07);
  }

  const safeStepMs = Math.max(1, frameStepMs);
  const baseIndex = spectrumFrameIndexAtMs(
    absoluteMs,
    safeStepMs,
    frames.length,
  );
  const nextIndex = Math.min(frames.length - 1, baseIndex + 1);
  const prevIndex = Math.max(0, baseIndex - 1);
  const localT = clampNumber((absoluteMs % safeStepMs) / safeStepMs, 0, 1);

  const current = frames[baseIndex] ?? [];
  const next = frames[nextIndex] ?? current;
  const prev = frames[prevIndex] ?? current;

  return Array.from({ length: barCount }).map((_, index) => {
    const currentRaw = current[index];
    const nextRaw = next[index];
    const prevRaw = prev[index];

    const from = clampNumber(
      Number.isFinite(currentRaw) ? (currentRaw as number) : 0,
      0,
      1,
    );
    const to = clampNumber(
      Number.isFinite(nextRaw) ? (nextRaw as number) : from,
      0,
      1,
    );
    const previous = clampNumber(
      Number.isFinite(prevRaw) ? (prevRaw as number) : from,
      0,
      1,
    );

    const interpolated = lerp(from, to, localT);
    const transient = Math.max(0, from - previous) * 0.4;
    const emphasized = Math.pow(
      clampNumber(interpolated + transient, 0, 1),
      0.82,
    );

    return clampNumber(emphasized, 0.015, 1);
  });
}

async function renderPosterPulseLayer(input: {
  renderJobId: string;
  ffmpegBinary: string;
  outputPath: string;
  posterPath: string;
  width: number;
  height: number;
  fps: number;
  timeline: ReturnType<typeof resolveSceneTimeline>;
  spectrumFrameStepMs: number;
  spectrumValues: number[][];
  barCount: number;
  basePosterWidth: number;
  basePosterHeight: number;
  beatScaleStrength: number;
  cornerRadiusPx: number;
  borderEnabled: boolean;
  borderColor: string;
  borderPx: number;
}) {
  const {
    renderJobId,
    ffmpegBinary,
    outputPath,
    posterPath,
    width,
    height,
    fps,
    timeline,
    spectrumFrameStepMs,
    spectrumValues,
    barCount,
    basePosterWidth,
    basePosterHeight,
    beatScaleStrength,
    cornerRadiusPx,
    borderEnabled,
    borderColor,
    borderPx,
  } = input;

  const posterSource = await fs.readFile(posterPath);
  const normalizedFrames = spectrumValues.map((row) =>
    normalizeSpectrumBands(row ?? [], barCount),
  );
  const frameCount = Math.max(1, Math.round(timeline.clipDurationSec * fps));
  let pulseState = createInitialBeatPulseState();

  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "-",
    "-an",
    "-c:v",
    "qtrle",
    "-pix_fmt",
    "argb",
    "-t",
    String(timeline.clipDurationSec),
    outputPath,
  ];

  const ffmpeg = spawn(ffmpegBinary, args, {
    stdio: ["pipe", "ignore", "pipe"],
  });
  activeRenderProcesses.set(renderJobId, ffmpeg);

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const roundedCache = new Map<string, Buffer>();
  const maxCacheEntries = 64;

  const getRoundedPoster = async (posterW: number, posterH: number) => {
    const cacheKey = `${posterW}x${posterH}`;
    const cached = roundedCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const posterRadius = Math.min(
      Math.max(0, Math.round(cornerRadiusPx)),
      Math.floor(Math.min(posterW, posterH) / 2),
    );
    const radiusForStroke = Math.max(
      0,
      posterRadius - Math.floor(borderPx / 2),
    );
    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${posterW}" height="${posterH}"><rect x="0" y="0" width="${posterW}" height="${posterH}" rx="${posterRadius}" ry="${posterRadius}" fill="white" /></svg>`;
    const strokeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${posterW}" height="${posterH}"><rect x="${borderPx / 2}" y="${borderPx / 2}" width="${Math.max(1, posterW - borderPx)}" height="${Math.max(1, posterH - borderPx)}" rx="${radiusForStroke}" ry="${radiusForStroke}" fill="none" stroke="${borderColor}" stroke-width="${borderPx}" /></svg>`;

    const composites: sharp.OverlayOptions[] = [
      {
        input: Buffer.from(maskSvg),
        blend: "dest-in",
      },
    ];

    if (borderEnabled && borderPx > 0) {
      composites.push({
        input: Buffer.from(strokeSvg),
        blend: "over",
      });
    }

    const rendered = await sharp(posterSource)
      .resize(posterW, posterH, {
        fit: "cover",
      })
      .ensureAlpha()
      .composite(composites)
      .png()
      .toBuffer();

    roundedCache.set(cacheKey, rendered);
    if (roundedCache.size > maxCacheEntries) {
      const oldestKey = roundedCache.keys().next().value;
      if (typeof oldestKey === "string") {
        roundedCache.delete(oldestKey);
      }
    }

    return rendered;
  };

  const writeFrame = async (frame: Buffer) => {
    if (!ffmpeg.stdin.write(frame)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg.stdin.once("drain", resolve);
        ffmpeg.stdin.once("error", reject);
      });
    }
  };

  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const absoluteMs = timeline.trimInMs + (frameIndex * 1000) / fps;
      const values = buildResponsiveSpectrumFrame({
        frames: normalizedFrames,
        absoluteMs,
        frameStepMs: spectrumFrameStepMs,
        barCount,
      });

      pulseState = getNextBeatPulseState(pulseState, values, {
        strength: 1,
      });
      const pulseStrength = clampNumber(
        toFiniteNumber(beatScaleStrength, 1),
        0,
        5,
      );
      const safePulse = toFiniteNumber(pulseState.scale, 1);
      const safeScale = clampNumber(
        1 + (safePulse - 1) * pulseStrength,
        1,
        1.25,
      );
      const scaledW = toEven(basePosterWidth * safeScale, 16);
      const scaledH = toEven(basePosterHeight * safeScale, 16);

      if (!Number.isFinite(scaledW) || !Number.isFinite(scaledH)) {
        continue;
      }

      const posterBuffer = await getRoundedPoster(scaledW, scaledH);
      const left = Math.floor((width - scaledW) / 2);
      const top = Math.floor((height - scaledH) / 2);
      const frame = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0,
          },
        },
      })
        .composite([
          {
            input: posterBuffer,
            left,
            top,
          },
        ])
        .raw()
        .toBuffer();

      await writeFrame(frame);

      if (frameIndex % Math.max(1, Math.round(fps * 2)) === 0) {
        const normalized = frameIndex / Math.max(1, frameCount - 1);
        const nextProgress = Math.max(
          50,
          Math.min(64, Math.round(50 + normalized * 14)),
        );
        void updateRenderJobById(renderJobId, {
          progress: nextProgress,
        });
      }
    }

    ffmpeg.stdin.end();

    await new Promise<void>((resolve, reject) => {
      ffmpeg.on("error", reject);
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
  } catch (error) {
    activeRenderProcesses.delete(renderJobId);
    ffmpeg.kill("SIGKILL");
    throw error;
  }
}

async function renderSpectrumVisualizerLayer(input: {
  renderJobId: string;
  ffmpegBinary: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  colorHex: string;
  visualizerType: string;
  visualizerBarCount: number;
  timeline: ReturnType<typeof resolveSceneTimeline>;
  equalizerConfig: EqualizerConfig;
  keyframes: TimelineKeyframeTrack[];
  spectrumFrameStepMs: number;
  spectrumValues: number[][];
}) {
  const {
    renderJobId,
    ffmpegBinary,
    outputPath,
    width,
    height,
    fps,
    colorHex,
    visualizerType,
    visualizerBarCount,
    timeline,
    equalizerConfig,
    keyframes,
    spectrumFrameStepMs,
    spectrumValues,
  } = input;

  const normalizedFrames = spectrumValues.map((row) =>
    normalizeSpectrumBands(row ?? [], visualizerBarCount),
  );
  let smoothedValues = Array.from({ length: visualizerBarCount }).map(
    () => 0.06,
  );
  const frameCount = Math.max(1, Math.round(timeline.clipDurationSec * fps));
  const color = parseHexRgb(colorHex);

  const args = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-r",
    String(fps),
    "-i",
    "-",
    "-an",
    "-c:v",
    "qtrle",
    "-pix_fmt",
    "argb",
    "-t",
    String(timeline.clipDurationSec),
    outputPath,
  ];

  const ffmpeg = spawn(ffmpegBinary, args, {
    stdio: ["pipe", "ignore", "pipe"],
  });
  activeRenderProcesses.set(renderJobId, ffmpeg);

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const frame = Buffer.alloc(width * height * 4);
  const writeFrame = async () => {
    if (!ffmpeg.stdin.write(frame)) {
      await new Promise<void>((resolve, reject) => {
        ffmpeg.stdin.once("drain", resolve);
        ffmpeg.stdin.once("error", reject);
      });
    }
  };

  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      frame.fill(0);

      const absoluteMs = timeline.trimInMs + (frameIndex * 1000) / fps;
      const eqConfig = applyKeyframesToEqualizer(
        equalizerConfig,
        keyframes,
        absoluteMs,
      );

      const eqW = Math.max(80, Math.round(width * eqConfig.width));
      const eqH = Math.max(32, Math.round(height * eqConfig.height));
      const eqX = Math.max(0, Math.round((width - eqW) * eqConfig.x));
      const eqYCenter = Math.round(height * eqConfig.y);
      const eqY = Math.min(
        height - eqH,
        Math.max(0, eqYCenter - Math.floor(eqH / 2)),
      );

      const targetValues = buildResponsiveSpectrumFrame({
        frames: normalizedFrames,
        absoluteMs,
        frameStepMs: spectrumFrameStepMs,
        barCount: visualizerBarCount,
      });

      const attack = 0.68;
      const release = 0.42;
      const values = targetValues.map((target, index) => {
        const prev = smoothedValues[index] ?? 0.06;
        const mix = target >= prev ? attack : release;
        return clampNumber(prev + (target - prev) * mix, 0.01, 1);
      });
      smoothedValues = values;

      const gap = 2;
      const barWidth = Math.max(
        2,
        Math.floor(
          (eqW - Math.max(0, values.length - 1) * gap) /
            Math.max(1, values.length),
        ),
      );
      const totalWidth =
        barWidth * values.length + Math.max(0, values.length - 1) * gap;
      const startX = eqX + Math.max(0, Math.floor((eqW - totalWidth) / 2));

      const mode = visualizerType.trim().toLowerCase();

      if (mode === "line") {
        const points = values.map((value, index) => ({
          x: eqX + Math.round((index / Math.max(1, values.length - 1)) * eqW),
          y: eqY + eqH - Math.round(clampNumber(value, 0.02, 1) * (eqH * 0.92)),
        }));

        for (let index = 0; index < points.length - 1; index += 1) {
          const from = points[index];
          const to = points[index + 1];
          drawLine(
            frame,
            width,
            height,
            from.x,
            from.y,
            to.x,
            to.y,
            color,
            2,
            245,
          );
        }

        for (const point of points) {
          drawFilledCircle(
            frame,
            width,
            height,
            point.x,
            point.y,
            2,
            color,
            230,
          );
        }
      } else if (
        mode === "symmetricbars" ||
        mode === "symmetric_bars" ||
        mode === "symmetric-bars"
      ) {
        const half = Math.max(4, Math.floor(eqH / 2));
        for (let index = 0; index < values.length; index += 1) {
          const value = clampNumber(values[index], 0.015, 1);
          const h = Math.max(2, Math.round(value * (half - 2)));
          const x = startX + index * (barWidth + gap);
          const yTop = eqY + half - h;
          const yBottom = eqY + half + 2;
          drawRoundedBar(
            frame,
            width,
            height,
            x,
            yTop,
            barWidth,
            h,
            color,
            235,
          );
          drawRoundedBar(
            frame,
            width,
            height,
            x,
            yBottom,
            barWidth,
            h,
            color,
            235,
            "bottom",
          );
        }
      } else if (mode === "dots") {
        const radius = Math.max(2, Math.floor(barWidth * 0.45));
        for (let index = 0; index < values.length; index += 1) {
          const value = clampNumber(values[index], 0.015, 1);
          const x =
            startX + index * (barWidth + gap) + Math.floor(barWidth / 2);
          const y = eqY + eqH - Math.round(value * eqH);
          drawFilledCircle(frame, width, height, x, y, radius, color, 240);
        }
      } else {
        for (let index = 0; index < values.length; index += 1) {
          const value = clampNumber(values[index], 0.015, 1);
          const x = startX + index * (barWidth + gap);
          const h = Math.max(3, Math.round(value * eqH));
          const y = eqY + eqH - h;
          drawRoundedBar(frame, width, height, x, y, barWidth, h, color, 238);
        }
      }

      await writeFrame();

      if (frameIndex % Math.max(1, Math.round(fps * 2)) === 0) {
        const normalized = frameIndex / Math.max(1, frameCount - 1);
        const nextProgress = Math.max(
          26,
          Math.min(50, Math.round(26 + normalized * 24)),
        );
        void updateRenderJobById(renderJobId, {
          progress: nextProgress,
        });
      }
    }

    ffmpeg.stdin.end();

    await new Promise<void>((resolve, reject) => {
      ffmpeg.on("error", reject);
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
  } catch (error) {
    activeRenderProcesses.delete(renderJobId);
    ffmpeg.kill("SIGKILL");
    throw error;
  }
}

async function runFfmpeg(
  renderJobId: string,
  ffmpegBinary: string,
  args: string[],
  durationSec: number,
  progressStart = 12,
  progressEnd = 96,
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
        progressStart,
        Math.min(
          progressEnd,
          Math.round(
            progressStart + normalized * (progressEnd - progressStart),
          ),
        ),
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

async function hasUsableCacheFile(filePath: string, minSizeBytes = 4096) {
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats) {
    return false;
  }

  return stats.size >= minSizeBytes;
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

  const [
    posterAsset,
    trackAsset,
    analysis,
    backgroundAsset,
    renderBackgroundAsset,
  ] = await Promise.all([
    getAssetById(project.posterAssetId),
    getAssetById(project.trackAssetId),
    getAnalysisById(project.analysisId),
    typeof project.backgroundAssetId === "string" &&
    project.backgroundAssetId.length > 0
      ? getAssetById(project.backgroundAssetId)
      : Promise.resolve(null),
    typeof project.renderBackgroundAssetId === "string" &&
    project.renderBackgroundAssetId.length > 0
      ? getAssetById(project.renderBackgroundAssetId)
      : Promise.resolve(null),
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

  if (!analysis || analysis.status !== "done" || !analysis.spectrumSeriesPath) {
    await updateRenderJobById(renderJobId, {
      status: "failed",
      progress: 100,
      errorCode: "ANALYSIS_NOT_READY",
      errorMessage: "Audio analysis spectrum is missing or not ready",
      finishedAt: new Date().toISOString(),
    });
    return;
  }

  const watermarkEnabled =
    project.watermarkEnabled && renderWatermarkConfig.enabled;

  const preparedBackgroundAsset =
    renderBackgroundAsset && renderBackgroundAsset.kind === "poster"
      ? renderBackgroundAsset
      : null;

  const sceneBackgroundAsset =
    preparedBackgroundAsset ??
    (backgroundAsset && backgroundAsset.kind === "poster"
      ? backgroundAsset
      : posterAsset);

  const usePreparedBackground = preparedBackgroundAsset !== null;

  const spectrum = await readJson<SpectrumSeries>(
    absolutePathFromRoot(analysis.spectrumSeriesPath),
    {
      frameStepMs: analysis.frameStepMs,
      bands: analysis.bands,
      values: [],
    },
  );

  await updateRenderJobById(renderJobId, {
    status: "processing",
    startedAt: new Date().toISOString(),
    progress: 10,
    watermarkApplied: watermarkEnabled,
  });

  await sleep(200);
  await updateRenderJobById(renderJobId, { progress: 12 });

  const { width, height, fps } = getVideoProfile(
    project.format,
    project.quality,
  );
  const trackAssetFilePath = trackAsset.filePath;
  const trackDurationSec = trackAsset.durationSec ?? 120;
  const sceneTimeline = resolveSceneTimeline({
    trackDurationSec,
    timeline: project.timeline,
  });
  const eqColor = parseHexForFfmpeg(project.equalizerConfig.color);
  const visualizerType = project.equalizerConfig.visualizerType ?? "bars";
  const templateCategory =
    builtInTemplates.find((item) => item.id === project.templateId)?.category ??
    "";
  const visualizerBarCount = getVisualizerBarCount(
    project.particleConfig?.preset ?? "neon",
    templateCategory,
  );
  const resolvedBarCount = clampNumber(
    Math.round(project.equalizerConfig.barCount ?? visualizerBarCount),
    8,
    96,
  );
  const posterScaleFactor = clampNumber(
    project.posterConfig.bannerScale ?? defaultPosterConfig.bannerScale ?? 0.56,
    0.2,
    0.8,
  );
  const posterW = Math.round(width * posterScaleFactor);
  const posterAspectRatio =
    typeof posterAsset.width === "number" &&
    typeof posterAsset.height === "number" &&
    posterAsset.width > 0 &&
    posterAsset.height > 0
      ? posterAsset.height / posterAsset.width
      : 1;
  const posterH = Math.max(32, toEven(posterW * posterAspectRatio, 16));
  const posterBackgroundDimStrength = clampNumber(
    project.posterConfig.backgroundDimStrength ??
      defaultPosterConfig.backgroundDimStrength,
    0,
    0.85,
  );
  const posterBeatScaleStrength = clampNumber(
    project.posterConfig.beatScaleStrength ??
      defaultPosterConfig.beatScaleStrength ??
      1,
    0,
    5,
  );
  const cameraPunchStrength = clampNumber(
    project.posterConfig.cameraPunchStrength ??
      defaultPosterConfig.cameraPunchStrength ??
      0,
    0,
    3,
  );
  const parallaxDriftStrength = clampNumber(
    project.posterConfig.parallaxDriftStrength ??
      defaultPosterConfig.parallaxDriftStrength ??
      0,
    0,
    3,
  );
  const cameraPunchBeatsMs = detectCameraPunchBeatsMs({
    spectrumValues: spectrum.values ?? [],
    frameStepMs: spectrum.frameStepMs,
    barCount: resolvedBarCount,
  });
  const clipStartMs = Math.max(
    0,
    Math.round(sceneTimeline.clipStartSec * 1000),
  );
  const clipEndMs =
    clipStartMs + Math.round(sceneTimeline.clipDurationSec * 1000);
  const cameraPunchBeatsForClipMs = cameraPunchBeatsMs
    .filter((value) => value >= clipStartMs && value <= clipEndMs)
    .map((value) => value - clipStartMs);
  const cameraPunchScaleExpr = buildCameraPunchScaleExpression({
    beatTimesMs: cameraPunchBeatsForClipMs,
    strength: cameraPunchStrength,
  });
  const baseLayerPath = path.join(
    getStorageDirs().renders,
    getBaseLayerCacheFileName({
      posterAssetId: sceneBackgroundAsset.id,
      format: project.format,
      quality: project.quality,
      width,
      height,
      fps,
      blurStrength: project.posterConfig.blurStrength,
      backgroundDimStrength: posterBackgroundDimStrength,
      usePreparedBackground,
      watermarkEnabled,
    }),
  );
  const visualizerLayerPath = path.join(
    getStorageDirs().renders,
    getVisualizerLayerCacheFileName({
      analysisId: analysis.id,
      trackAssetId: trackAsset.id,
      visualizerType,
      visualizerBarCount: resolvedBarCount,
      equalizerConfig: project.equalizerConfig,
      keyframes: project.keyframes ?? [],
      eqColor,
      trimInMs: sceneTimeline.trimInMs,
      trimOutMs: sceneTimeline.trimOutMs,
      width,
      height,
      fps,
      durationSec: sceneTimeline.clipDurationSec,
    }),
  );
  const posterCornerRadiusPx = Math.max(
    0,
    Math.min(180, Math.round(project.posterConfig.cornerRadius)),
  );
  const posterBorderEnabled =
    project.posterConfig.bannerBorderEnabled ??
    defaultPosterConfig.bannerBorderEnabled ??
    true;
  const posterBorderColor =
    project.posterConfig.bannerBorderColor ??
    defaultPosterConfig.bannerBorderColor ??
    "#dceaff";
  const posterBorderPx = Math.max(
    0,
    Math.round(
      clampNumber(
        project.posterConfig.bannerBorderWidth ??
          defaultPosterConfig.bannerBorderWidth ??
          2,
        0,
        12,
      ),
    ),
  );
  const posterLayerPath = path.join(
    getStorageDirs().renders,
    getPosterLayerCacheFileName({
      posterAssetId: posterAsset.id,
      analysisId: analysis.id,
      trimInMs: sceneTimeline.trimInMs,
      trimOutMs: sceneTimeline.trimOutMs,
      width,
      height,
      fps,
      durationSec: sceneTimeline.clipDurationSec,
      basePosterWidth: toEven(posterW, 16),
      basePosterHeight: posterH,
      barCount: resolvedBarCount,
      beatScaleStrength: posterBeatScaleStrength,
      cornerRadiusPx: posterCornerRadiusPx,
      borderEnabled: posterBorderEnabled,
      borderColor: posterBorderColor,
      borderPx: posterBorderPx,
    }),
  );
  const baseLayerFilterGraph = usePreparedBackground
    ? `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[vout]`
    : `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},gblur=sigma=${Math.max(6, project.posterConfig.blurStrength * 0.95)}:steps=3,drawbox=x=0:y=0:w=iw:h=ih:color=black@${posterBackgroundDimStrength.toFixed(3)}:t=fill,eq=saturation=1.08[vout]`;

  const baseLayerArgs = [
    "-y",
    "-loop",
    "1",
    "-i",
    sceneBackgroundAsset.filePath,
    "-filter_complex",
    baseLayerFilterGraph,
    "-map",
    "[vout]",
    "-an",
    "-r",
    String(fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-t",
    String(sceneTimeline.clipDurationSec),
    "-movflags",
    "+faststart",
    baseLayerPath,
  ];

  const outputAssetId = createId("ast_render");
  const outputPath = path.join(
    getStorageDirs().renders,
    `${outputAssetId}.mp4`,
  );
  const textOverlayPath = path.join(
    getStorageDirs().renders,
    `${outputAssetId}_text_overlay.png`,
  );

  const trackTextConfig = {
    ...defaultTrackTextConfig,
    ...(project.trackTextConfig ?? {}),
  };

  await renderTrackTextOverlay({
    outputPath: textOverlayPath,
    width,
    height,
    artist: trackTextConfig.artist || defaultTrackTextConfig.artist,
    songName: trackTextConfig.songName || defaultTrackTextConfig.songName,
    color: trackTextConfig.color || defaultTrackTextConfig.color,
    x: trackTextConfig.x,
    y: trackTextConfig.y,
    size: trackTextConfig.size,
    gap: trackTextConfig.gap,
    align: trackTextConfig.align,
    watermarkEnabled,
    watermarkText: renderWatermarkConfig.text,
    watermarkFontSize: renderWatermarkConfig.fontSize,
  });

  function buildCompositeFilterComplex(scaleExpr: string) {
    const bgParallax = buildParallaxBackgroundCropExpressions({
      strength: parallaxDriftStrength,
      baseWidthPx: width,
      baseHeightPx: height,
    });
    const zoomedW = Math.max(
      width + 4,
      Math.round(width * bgParallax.zoomScale),
    );
    const zoomedH = Math.max(
      height + 4,
      Math.round(height * bgParallax.zoomScale),
    );

    const filterGraph = [
      `[0:v]scale=${zoomedW}:${zoomedH}:flags=lanczos[baseZoomed]`,
      `[baseZoomed]crop=${width}:${height}:x='${bgParallax.x}':y='${bgParallax.y}'[base]`,
      `[2:v]format=rgba,scale='trunc(iw*${scaleExpr}/2)*2':'trunc(ih*${scaleExpr}/2)*2'[vizKeyed]`,
      `[3:v]format=rgba,scale='trunc(iw*${scaleExpr}/2)*2':'trunc(ih*${scaleExpr}/2)*2'[posterTop]`,
      `[4:v]format=rgba,scale='trunc(iw*${scaleExpr}/2)*2':'trunc(ih*${scaleExpr}/2)*2'[textOverlay]`,
    ];

    filterGraph.push(
      `[base][vizKeyed]overlay=(W-w)/2:(H-h)/2:format=auto[scene1]`,
      `[scene1][posterTop]overlay=(W-w)/2:(H-h)/2:format=auto[scene2]`,
      `[scene2][textOverlay]overlay=(W-w)/2:(H-h)/2:format=auto[vout]`,
    );

    return filterGraph.join(";");
  }

  function buildCompositeFfmpegArgs(filterComplex: string) {
    return [
      "-y",
      "-i",
      baseLayerPath,
      "-ss",
      String(sceneTimeline.clipStartSec),
      "-t",
      String(sceneTimeline.clipDurationSec),
      "-i",
      trackAssetFilePath,
      "-i",
      visualizerLayerPath,
      "-i",
      posterLayerPath,
      "-loop",
      "1",
      "-t",
      String(sceneTimeline.clipDurationSec),
      "-i",
      textOverlayPath,
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
  }

  const ffmpegArgs = buildCompositeFfmpegArgs(
    buildCompositeFilterComplex(cameraPunchScaleExpr),
  );
  const fallbackFfmpegArgs = buildCompositeFfmpegArgs(
    buildCompositeFilterComplex("1"),
  );

  await updateRenderJobById(renderJobId, { progress: 14 });

  const hasCachedBaseLayer = await hasUsableCacheFile(baseLayerPath);
  const hasCachedVisualizerLayer =
    await hasUsableCacheFile(visualizerLayerPath);
  const hasCachedPosterLayer = await hasUsableCacheFile(posterLayerPath);

  console.info("[render] layer cache", {
    renderJobId,
    base: hasCachedBaseLayer ? "hit" : "miss",
    visualizer: hasCachedVisualizerLayer ? "hit" : "miss",
    poster: hasCachedPosterLayer ? "hit" : "miss",
  });

  try {
    if (!hasCachedBaseLayer) {
      await runFfmpeg(
        renderJobId,
        ffmpegBinary,
        baseLayerArgs,
        sceneTimeline.clipDurationSec,
        14,
        24,
      );
    }

    await updateRenderJobById(renderJobId, { progress: 26 });

    if (!hasCachedVisualizerLayer) {
      await renderSpectrumVisualizerLayer({
        renderJobId,
        ffmpegBinary,
        outputPath: visualizerLayerPath,
        width,
        height,
        fps,
        colorHex: project.equalizerConfig.color,
        visualizerType,
        visualizerBarCount: resolvedBarCount,
        timeline: sceneTimeline,
        equalizerConfig: project.equalizerConfig,
        keyframes: project.keyframes ?? [],
        spectrumFrameStepMs: spectrum.frameStepMs,
        spectrumValues: spectrum.values ?? [],
      });
    }

    await updateRenderJobById(renderJobId, { progress: 50 });

    if (!hasCachedPosterLayer) {
      await renderPosterPulseLayer({
        renderJobId,
        ffmpegBinary,
        outputPath: posterLayerPath,
        posterPath: posterAsset.filePath,
        width,
        height,
        fps,
        timeline: sceneTimeline,
        spectrumFrameStepMs: spectrum.frameStepMs,
        spectrumValues: spectrum.values ?? [],
        barCount: resolvedBarCount,
        basePosterWidth: toEven(posterW, 16),
        basePosterHeight: posterH,
        beatScaleStrength: posterBeatScaleStrength,
        cornerRadiusPx: posterCornerRadiusPx,
        borderEnabled: posterBorderEnabled,
        borderColor: posterBorderColor,
        borderPx: posterBorderPx,
      });
    }

    await updateRenderJobById(renderJobId, { progress: 64 });

    try {
      await runFfmpeg(
        renderJobId,
        ffmpegBinary,
        ffmpegArgs,
        sceneTimeline.clipDurationSec,
        64,
        96,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isFilterInitError =
        message.includes("Error initializing filters") ||
        message.includes("Invalid argument");

      if (!isFilterInitError || cameraPunchStrength <= 0) {
        throw error;
      }

      console.warn("[render] retry without camera punch", {
        renderJobId,
        reason: "filter_init_error",
      });

      await runFfmpeg(
        renderJobId,
        ffmpegBinary,
        fallbackFfmpegArgs,
        sceneTimeline.clipDurationSec,
        64,
        96,
      );
    }
  } catch (error) {
    const latest = await getRenderJobById(renderJobId);
    if (latest?.status === "canceled") {
      console.info("[render] canceled by user", { renderJobId });
      if (!hasCachedVisualizerLayer) {
        await fs.unlink(visualizerLayerPath).catch(() => null);
      }
      if (!hasCachedPosterLayer) {
        await fs.unlink(posterLayerPath).catch(() => null);
      }
      await fs.unlink(textOverlayPath).catch(() => null);
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
    if (!hasCachedVisualizerLayer) {
      await fs.unlink(visualizerLayerPath).catch(() => null);
    }
    if (!hasCachedPosterLayer) {
      await fs.unlink(posterLayerPath).catch(() => null);
    }
    await fs.unlink(textOverlayPath).catch(() => null);
    return;
  }

  await updateRenderJobById(renderJobId, { progress: 97 });
  const latest = await getRenderJobById(renderJobId);
  if (latest?.status === "canceled") {
    await fs.unlink(outputPath).catch(() => null);
    await fs.unlink(textOverlayPath).catch(() => null);
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
    await fs.unlink(textOverlayPath).catch(() => null);
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

  await fs.unlink(textOverlayPath).catch(() => null);

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
