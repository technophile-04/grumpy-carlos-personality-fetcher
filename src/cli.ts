#!/usr/bin/env node

/**
 * Grumpy Carlos Personality Fetcher CLI
 * Generate a personality profile from GitHub code review activity
 */

import { Command } from "commander";
import { readFileSync, existsSync } from "node:fs";
import chalk from "chalk";

import { buildConfig } from "./config.js";
import type { RepoIdentifier, DateRange, ReviewCorpusItem } from "./types.js";
import {
  REVIEWER_LOGIN,
  REPOS_FILE,
  EXTENDED_HISTORY_REPOS,
  EXTENDED_RANGE_START,
  RANGE_START,
  RANGE_END,
} from "./constants.js";
import {
  getOctokit,
  checkRateLimit,
  fetchRepoReviews,
  parseGitHubUrls,
  dedupeRepos,
} from "./github/index.js";
import { readCacheFile, writeCacheFile } from "./utils/cache.js";
import {
  startSpinner,
  succeedSpinner,
  failSpinner,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  updateSpinner,
} from "./utils/progress.js";
import {
  generatePersonalityProfile,
  getProviderDisplayName,
} from "./summarize/index.js";
import { writeCorpusJSON, calculateStats } from "./report/index.js";
import { writePersonalityMarkdown } from "./report/index.js";

/**
 * Load repos from repos.json file
 */
function loadReposFromFile(): string[] {
  if (!existsSync(REPOS_FILE)) {
    return [];
  }

  try {
    const content = readFileSync(REPOS_FILE, "utf-8");
    const data = JSON.parse(content);
    return data.repos || [];
  } catch {
    logWarning(`Failed to parse ${REPOS_FILE}, using empty repo list`);
    return [];
  }
}

/**
 * Get date range for a repo
 */
function getDateRangeForRepo(repo: RepoIdentifier): DateRange {
  if (EXTENDED_HISTORY_REPOS.has(repo.fullName)) {
    return {
      start: EXTENDED_RANGE_START,
      end: RANGE_END,
      label: "2022-2025",
      key: "2022-2025",
    };
  }

  return {
    start: RANGE_START,
    end: RANGE_END,
    label: "2025",
    key: "2025",
  };
}

/**
 * Get cache filename for a repo
 */
function getCacheFilename(repo: RepoIdentifier, range: DateRange): string {
  const safeRepoName = repo.fullName.replace("/", "-");
  return `${safeRepoName}-${REVIEWER_LOGIN}-${range.key}.json`;
}

interface CachedRepoData {
  repo: RepoIdentifier;
  rangeLabel: string;
  fetchedAt: string;
  items: Array<{
    repo: { owner: string; repo: string; fullName: string };
    prNumber: number;
    prTitle: string;
    prUrl: string;
    type: string;
    body: string;
    createdAt: string;
    author: string | null;
    url: string;
    state?: string;
    path?: string | null;
    line?: number | null;
  }>;
}

/**
 * Convert cached data back to ReviewCorpusItem[]
 */
function restoreCachedItems(cached: CachedRepoData): ReviewCorpusItem[] {
  return cached.items.map((item) => ({
    repo: item.repo,
    prNumber: item.prNumber,
    prTitle: item.prTitle,
    prUrl: item.prUrl,
    type: item.type as ReviewCorpusItem["type"],
    body: item.body,
    createdAt: new Date(item.createdAt),
    author: item.author,
    url: item.url,
    state: item.state,
    path: item.path,
    line: item.line,
  }));
}

/**
 * Main CLI logic
 */
async function main(): Promise<void> {
  console.log(chalk.bold.cyan("\n=== Grumpy Carlos Personality Fetcher ===\n"));

  // Build config from env
  let config;
  try {
    config = buildConfig();
  } catch (error) {
    logError((error as Error).message);
    process.exit(1);
  }

  // Load repos
  const repoStrings = loadReposFromFile();
  if (repoStrings.length === 0) {
    logError(`No repositories found in ${REPOS_FILE}`);
    process.exit(1);
  }

  // Parse and dedupe repos
  let repos: RepoIdentifier[];
  try {
    repos = dedupeRepos(parseGitHubUrls(repoStrings));
  } catch (error) {
    logError((error as Error).message);
    process.exit(1);
  }

  // Show config summary
  logInfo(`Reviewer: ${REVIEWER_LOGIN}`);
  logInfo(`Repositories: ${repos.length}`);
  logInfo(
    `LLM Provider: ${getProviderDisplayName(config.llmProvider)} (${config.llmModel})`
  );
  console.log();

  // Initialize GitHub client
  const octokit = getOctokit(config);

  // Check rate limit
  const rateLimit = await checkRateLimit(octokit);
  logInfo(`GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
  console.log();

  // Fetch reviews from all repos
  const allItems: ReviewCorpusItem[] = [];
  let processedRepos = 0;

  for (const repo of repos) {
    const range = getDateRangeForRepo(repo);
    const cacheFilename = getCacheFilename(repo, range);

    console.log(chalk.bold(`\n[${++processedRepos}/${repos.length}] ${repo.fullName}`));
    logInfo(`Date range: ${range.label}`);

    // Check cache first
    const cached = readCacheFile<CachedRepoData>(cacheFilename);
    if (cached) {
      const items = restoreCachedItems(cached);
      allItems.push(...items);
      logSuccess(`Loaded ${items.length} items from cache`);
      continue;
    }

    // Fetch from GitHub
    startSpinner(`Fetching reviews...`);
    try {
      const repoData = await fetchRepoReviews(
        octokit,
        repo,
        REVIEWER_LOGIN,
        range,
        (msg) => updateSpinner(msg)
      );

      // Cache the results
      const cacheData: CachedRepoData = {
        repo: repoData.repo,
        rangeLabel: repoData.rangeLabel,
        fetchedAt: repoData.fetchedAt.toISOString(),
        items: repoData.items.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      };
      writeCacheFile(cacheFilename, cacheData);

      allItems.push(...repoData.items);
      succeedSpinner(`Found ${repoData.items.length} review items`);
    } catch (error) {
      failSpinner(`Failed: ${(error as Error).message}`);
    }
  }

  // Summary
  console.log(chalk.bold.cyan("\n=== Collected Data ===\n"));
  const stats = calculateStats(allItems);
  logInfo(`Total review items: ${stats.totalItems}`);
  logInfo(`PR Reviews: ${stats.reviews}`);
  logInfo(`Code Comments: ${stats.reviewComments}`);
  logInfo(`PR Comments: ${stats.issueComments}`);

  if (allItems.length === 0) {
    logWarning("No review items found. Cannot generate personality profile.");
    process.exit(0);
  }

  // Write corpus JSON
  console.log(chalk.bold.cyan("\n=== Writing Output ===\n"));
  const jsonPath = writeCorpusJSON(allItems, REVIEWER_LOGIN, "Mixed");
  logSuccess(`Corpus JSON: ${jsonPath}`);

  // Generate personality profile using LLM
  startSpinner("Generating personality profile...");
  try {
    const profile = await generatePersonalityProfile(
      config,
      allItems,
      REVIEWER_LOGIN,
      (msg) => updateSpinner(msg)
    );

    succeedSpinner("Personality profile generated");

    // Write markdown
    const mdPath = writePersonalityMarkdown(profile, stats);
    logSuccess(`Personality Markdown: ${mdPath}`);
  } catch (error) {
    failSpinner(`LLM failed: ${(error as Error).message}`);
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n=== Done! ===\n"));
}

// CLI setup
const program = new Command();

program
  .name("grumpy-carlos")
  .description("Generate a Grumpy Carlos code review personality profile")
  .version("1.0.0")
  .action(async () => {
    try {
      await main();
    } catch (error) {
      logError(`Unexpected error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
