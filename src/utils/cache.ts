/**
 * File-based cache helpers
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CACHE_DIR } from "../constants.js";

export function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function writeCacheFile<T>(name: string, data: T): string {
  ensureCacheDir();
  const filepath = join(CACHE_DIR, name);
  const dir = dirname(filepath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

export function readCacheFile<T>(name: string): T | null {
  const filepath = join(CACHE_DIR, name);
  if (!existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
