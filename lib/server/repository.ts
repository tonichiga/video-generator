import path from "node:path";

import type {
  Asset,
  AudioAnalysis,
  Project,
  RenderJob,
} from "@/lib/domain/types";
import { getStorageDirs, readJson, writeJson } from "@/lib/server/storage";

type DbState = {
  assets: Asset[];
  analyses: AudioAnalysis[];
  projects: Project[];
  renderJobs: RenderJob[];
};

const emptyState: DbState = {
  assets: [],
  analyses: [],
  projects: [],
  renderJobs: [],
};

function dbFilePath() {
  return path.join(getStorageDirs().db, "state.json");
}

async function loadState(): Promise<DbState> {
  return readJson(dbFilePath(), emptyState);
}

async function saveState(state: DbState) {
  await writeJson(dbFilePath(), state);
}

export async function insertAsset(asset: Asset) {
  const state = await loadState();
  state.assets.push(asset);
  await saveState(state);
}

export async function getAssetById(id: string) {
  const state = await loadState();
  return state.assets.find((item) => item.id === id) ?? null;
}

export async function insertAnalysis(analysis: AudioAnalysis) {
  const state = await loadState();
  state.analyses.push(analysis);
  await saveState(state);
}

export async function getAnalysisById(id: string) {
  const state = await loadState();
  return state.analyses.find((item) => item.id === id) ?? null;
}

export async function updateAnalysisById(
  id: string,
  patch: Partial<AudioAnalysis>,
) {
  const state = await loadState();
  const index = state.analyses.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }
  state.analyses[index] = { ...state.analyses[index], ...patch };
  await saveState(state);
  return state.analyses[index];
}

export async function insertProject(project: Project) {
  const state = await loadState();
  state.projects.push(project);
  await saveState(state);
}

export async function getProjectById(id: string) {
  const state = await loadState();
  return state.projects.find((item) => item.id === id) ?? null;
}

export async function updateProjectById(id: string, patch: Partial<Project>) {
  const state = await loadState();
  const index = state.projects.findIndex((item) => item.id === id);
  if (index < 0) {
    return null;
  }

  state.projects[index] = {
    ...state.projects[index],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await saveState(state);
  return state.projects[index];
}

export async function insertRenderJob(renderJob: RenderJob) {
  const state = await loadState();
  state.renderJobs.push(renderJob);
  await saveState(state);
}

export async function getRenderJobById(id: string) {
  const state = await loadState();
  return state.renderJobs.find((item) => item.id === id) ?? null;
}

export async function updateRenderJobById(id: string, patch: Partial<RenderJob>) {
  const state = await loadState();
  const index = state.renderJobs.findIndex((item) => item.id === id);

  if (index < 0) {
    return null;
  }

  state.renderJobs[index] = {
    ...state.renderJobs[index],
    ...patch,
  };

  await saveState(state);
  return state.renderJobs[index];
}

export async function getLatestActiveRenderJobByProjectId(projectId: string) {
  const state = await loadState();
  const active = state.renderJobs
    .filter(
      (item) =>
        item.projectId === projectId &&
        (item.status === "queued" || item.status === "processing"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return active[0] ?? null;
}
