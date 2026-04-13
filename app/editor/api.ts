import type {
  CreateProjectPayload,
  LoadProjectResponse,
  ProjectPersistencePayload,
  SpectrumResponse,
  TemplateItem,
  WaveformResponse,
} from "@/app/editor/types";

async function parseJson<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  if (!response.ok) {
    let detail = "";

    try {
      const parsed = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      const code = parsed?.error?.code;
      const message = parsed?.error?.message;
      if (code || message) {
        detail = [code, message].filter(Boolean).join(": ");
      }
    } catch {
      const text = await response.text().catch(() => "");
      detail = text.trim().slice(0, 220);
    }

    const suffix = detail
      ? ` [${response.status}] ${detail}`
      : ` [${response.status}]`;
    throw new Error(`${fallbackMessage}${suffix}`);
  }

  return (await response.json()) as T;
}

export async function getTemplates() {
  const response = await fetch("/api/templates");
  return parseJson<{ items: TemplateItem[] }>(
    response,
    "Failed to load templates",
  );
}

export async function getFeatureFlags() {
  const response = await fetch("/api/system/features");
  return parseJson<{ flags?: { preview_timeline_v1?: boolean } }>(
    response,
    "Feature flags are unavailable",
  );
}

export async function postPreviewMetric(payload: Record<string, unknown>) {
  await fetch("/api/system/preview-metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function uploadTrackAsset(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/upload/track", {
    method: "POST",
    body: formData,
  });

  return parseJson<{ assetId: string }>(response, "Track upload failed");
}

export async function uploadPosterAsset(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/upload/poster", {
    method: "POST",
    body: formData,
  });

  return parseJson<{ assetId: string }>(response, "Poster upload failed");
}

export async function startTrackAnalysis(trackAssetId: string) {
  const response = await fetch("/api/audio/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trackAssetId,
      bands: 64,
      frameStepMs: 33,
    }),
  });

  return parseJson<{ analysisId: string; status: string }>(
    response,
    "Analyze request failed",
  );
}

export async function getAnalysisStatus(analysisId: string) {
  const response = await fetch(`/api/audio/analyze/${analysisId}`);
  return parseJson<{ status: string }>(response, "poll error");
}

export async function getWaveform(analysisId: string) {
  const response = await fetch(
    `/api/audio/analyze/${analysisId}/waveform?bins=900`,
  );
  return parseJson<WaveformResponse>(response, "waveform unavailable");
}

export async function getSpectrum(analysisId: string, barCount: number) {
  const response = await fetch(
    `/api/audio/analyze/${analysisId}/spectrum?bars=${barCount}&maxFrames=9600`,
  );
  return parseJson<SpectrumResponse>(response, "spectrum unavailable");
}

export async function createProject(payload: CreateProjectPayload) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseJson<{ projectId: string }>(response, "Save project failed");
}

export async function getProject(projectId: string, clientToken: string) {
  const response = await fetch(
    `/api/projects/${projectId}?clientToken=${encodeURIComponent(clientToken)}`,
  );

  return parseJson<LoadProjectResponse>(response, "Load project failed");
}

export async function patchProject(
  projectId: string,
  payload: Partial<ProjectPersistencePayload> & { clientToken: string },
) {
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await parseJson<Record<string, unknown>>(response, "Project sync failed");
}

export async function startRenderJob(projectId: string, clientToken: string) {
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      clientToken,
      forceRestart: true,
    }),
  });

  return parseJson<{ renderJobId: string; status: string; reused?: boolean }>(
    response,
    "Render start failed",
  );
}

export async function getRenderStatus(renderJobId: string) {
  const response = await fetch(`/api/render/${renderJobId}/status`);
  return parseJson<{ status: string; progress: number }>(
    response,
    "render poll error",
  );
}

export async function cancelRenderJob(
  renderJobId: string,
  clientToken: string,
) {
  const response = await fetch(`/api/render/${renderJobId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientToken }),
  });

  await parseJson<Record<string, unknown>>(response, "Cancel render failed");
}

export async function retryRenderJob(renderJobId: string, clientToken: string) {
  const response = await fetch(`/api/render/${renderJobId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientToken }),
  });

  return parseJson<{ renderJobId: string; status: string }>(
    response,
    "Retry render failed",
  );
}
