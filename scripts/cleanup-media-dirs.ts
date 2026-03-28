import fs from "node:fs/promises";
import path from "node:path";

import { ensureStorageReady, getStorageDirs } from "@/lib/server/storage";

type DirCleanupStat = {
  dirPath: string;
  fileCount: number;
  totalBytes: number;
};

async function collectStats(dirPath: string): Promise<DirCleanupStat> {
  const entries = await fs
    .readdir(dirPath, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  let fileCount = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const absolute = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectStats(absolute);
      fileCount += nested.fileCount;
      totalBytes += nested.totalBytes;
      continue;
    }

    if (entry.isFile()) {
      const stats = await fs.stat(absolute).catch(() => null);
      if (!stats) {
        continue;
      }

      fileCount += 1;
      totalBytes += stats.size;
    }
  }

  return {
    dirPath,
    fileCount,
    totalBytes,
  };
}

async function recreateDir(dirPath: string) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  await ensureStorageReady();

  const dirs = getStorageDirs();
  const targets = [dirs.uploadsPoster, dirs.uploadsTrack, dirs.renders];

  const beforeStats = await Promise.all(
    targets.map((target) => collectStats(target)),
  );
  await Promise.all(targets.map((target) => recreateDir(target)));

  const totalFiles = beforeStats.reduce((acc, item) => acc + item.fileCount, 0);
  const totalBytes = beforeStats.reduce(
    (acc, item) => acc + item.totalBytes,
    0,
  );
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);

  console.info("[cleanup:media] directories cleared:");
  for (const stat of beforeStats) {
    const mb = (stat.totalBytes / (1024 * 1024)).toFixed(2);
    console.info(`  - ${stat.dirPath}: files=${stat.fileCount} freed=${mb}MB`);
  }

  console.info(`[cleanup:media] total files=${totalFiles} freed=${totalMb}MB`);
}

void main();
