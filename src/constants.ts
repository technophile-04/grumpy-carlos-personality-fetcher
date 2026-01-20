/**
 * CLI constants
 */

export const REVIEWER_LOGIN = "carletex";
export const REPOS_FILE = "repos.json";
export const OUTPUT_DIR = "output";
export const CACHE_DIR = ".cache";

// Repos that should use extended history (from 2022) instead of just 2025
export const EXTENDED_HISTORY_REPOS = new Set([
  "scaffold-eth/scaffold-eth-2",
  "BuidlGuidl/SpeedRunEthereum-v2",
]);

// Extended history range (for key repos with more history)
export const EXTENDED_RANGE_START = new Date("2022-01-01T00:00:00Z");

// Default range for other repos
export const RANGE_START = new Date("2025-01-01T00:00:00Z");
export const RANGE_END = new Date("2025-12-31T23:59:59Z");
