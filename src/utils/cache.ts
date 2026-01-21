/**
 * File-based cache helpers with schema validation
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ZodSchema } from "zod";
import { CACHE_DIR } from "../constants.js";
import { ensureDir } from "./fs.js";

/**
 * Write data to a cache file.
 */
export function writeCacheFile<T>(name: string, data: T): string {
  ensureDir(CACHE_DIR);
  const filepath = join(CACHE_DIR, name);
  const dir = dirname(filepath);
  ensureDir(dir);
  writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * Read and validate a cache file using a Zod schema.
 * Returns null if file doesn't exist or validation fails.
 */
export function readCacheFile<T>(name: string, schema: ZodSchema<T>): T | null {
  const filepath = join(CACHE_DIR, name);
  if (!existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = schema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.warn(`Cache validation failed for ${name}: ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
