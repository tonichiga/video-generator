import fs from "node:fs/promises";
import path from "node:path";

import { getStorageDirs } from "@/lib/server/storage";

type CleanupResult = {
  deletedFiles: number;
  freedBytes: number;
};

async function walk(dirPath: string): Promise<string[]> {
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(absolute);
      files.push(...nested);
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

export async function cleanupOldArtifacts(
  retentionHours: number,
): Promise<CleanupResult> {
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  const dirs = getStorageDirs();
  const roots = [
    dirs.analysis,
    dirs.renders,
    dirs.uploadsTrack,
    dirs.uploadsPoster,
  ];

  let deletedFiles = 0;
  let freedBytes = 0;

  for (const root of roots) {
    const files = await walk(root);
    for (const filePath of files) {
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats || stats.mtimeMs > cutoff) {
        continue;
      }

      await fs.unlink(filePath).catch(() => null);
      deletedFiles += 1;
      freedBytes += stats.size;
    }
  }

  return {
    deletedFiles,
    freedBytes,
  };
}
