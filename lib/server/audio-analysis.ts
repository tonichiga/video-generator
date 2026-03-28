import path from "node:path";

import { getAssetById, updateAnalysisById } from "@/lib/server/repository";
import {
  getStorageDirs,
  relativePathFromRoot,
  writeJson,
} from "@/lib/server/storage";

function clampBandValue(value: number) {
  return Math.max(0, Math.min(1, value));
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

  const durationSec = asset.durationSec ?? 120;
  const synthetic = createSyntheticSeries(
    durationSec,
    analysis.bands,
    analysis.frameStepMs,
  );

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
    values: synthetic.spectrum,
  });

  await writeJson(envelopePath, {
    analysisId,
    frameStepMs: analysis.frameStepMs,
    values: synthetic.envelope,
  });

  await updateAnalysisById(analysisId, {
    status: "done",
    spectrumSeriesPath: relativePathFromRoot(spectrumPath),
    envelopeSeriesPath: relativePathFromRoot(envelopePath),
  });
}
