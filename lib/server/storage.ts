import fs from "node:fs/promises";
import path from "node:path";

import { localStorageRoot } from "@/lib/server/env";

const directories = {
  uploadsTrack: path.join(localStorageRoot, "uploads", "tracks"),
  uploadsPoster: path.join(localStorageRoot, "uploads", "posters"),
  analysis: path.join(localStorageRoot, "analysis"),
  renders: path.join(localStorageRoot, "renders"),
  db: path.join(localStorageRoot, "db"),
};

export async function ensureStorageReady() {
  await Promise.all(
    Object.values(directories).map((dir) => fs.mkdir(dir, { recursive: true })),
  );
}

export function getStorageDirs() {
  return directories;
}

export async function writeJson<T>(filePath: string, value: T) {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeBuffer(filePath: string, value: Buffer) {
  await fs.writeFile(filePath, value);
}

export function relativePathFromRoot(absolutePath: string): string {
  return path.relative(localStorageRoot, absolutePath).replaceAll("\\", "/");
}

export function absolutePathFromRoot(relativePath: string): string {
  return path.join(localStorageRoot, relativePath);
}
