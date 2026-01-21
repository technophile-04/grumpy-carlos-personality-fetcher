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
import { cachedRepoDataSchema, type CachedRepoData } from "./schemas.js";
import {
  DEFAULT_REVIEWER_LOGIN,
  DEFAULT_REVIEWER_NAME,
  REPOS_FILE,
  EXTENDED_HISTORY_REPOS,
  EXTENDED_RANGE_START,
  RANGE_START,
  RANGE_END,
} from "./constants.js";
import {
  createOctokit,
  checkRateLimit,
  fetchRepoReviews,
  parseGitHubUrls,
  dedupeRepos,
} from "./github/index.js";
import { readCacheFile, writeCacheFile } from "./utils/cache.js";
import { getErrorMessage } from "./utils/errors.js";
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
  dryRunProfile,
  getProviderDisplayName,
} from "./summarize/index.js";
import { writeCorpusJSON, calculateStats } from "./report/index.js";
import { writePersonalityMarkdown } from "./report/index.js";

interface CLIOptions {
  reviewer: string;
  reviewerName: string;
  reposFile: string;
  dryRun: boolean;
}

/**
 * Load repos from repos.json file
 */
function loadReposFromFile(reposFile: string): string[] {
  if (!existsSync(reposFile)) {
    return [];
  }

  try {
    const content = readFileSync(reposFile, "utf-8");
    const data = JSON.parse(content);
    return data.repos || [];
  } catch {
    logWarning(`Failed to parse ${reposFile}, using empty repo list`);
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
function getCacheFilename(repo: RepoIdentifier, range: DateRange, reviewerLogin: string): string {
  const safeRepoName = repo.fullName.replace("/", "-");
  return `${safeRepoName}-${reviewerLogin}-${range.key}.json`;
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
    type: item.type,
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
async function main(options: CLIOptions): Promise<void> {
  console.log(chalk.bold.cyan("\n=== Grumpy Carlos Personality Fetcher ===\n"));

  const { reviewer: reviewerLogin, reviewerName, reposFile, dryRun } = options;

  // Build config from env
  let config;
  try {
    config = buildConfig();
  } catch (error) {
    logError(getErrorMessage(error));
    process.exit(1);
  }

  // Load repos
  const repoStrings = loadReposFromFile(reposFile);
  if (repoStrings.length === 0) {
    logError(`No repositories found in ${reposFile}`);
    process.exit(1);
  }

  // Parse and dedupe repos
  let repos: RepoIdentifier[];
  try {
    repos = dedupeRepos(parseGitHubUrls(repoStrings));
  } catch (error) {
    logError(getErrorMessage(error));
    process.exit(1);
  }

  // Show config summary
  logInfo(`Reviewer: ${reviewerLogin} (${reviewerName})`);
  logInfo(`Repositories: ${repos.length}`);
  logInfo(
    `LLM Provider: ${getProviderDisplayName(config.llmProvider)} (${config.llmModel})`
  );
  if (dryRun) {
    logInfo("Mode: DRY RUN (no LLM calls will be made)");
  }
  console.log();

  // Initialize GitHub client
  const octokit = createOctokit(config);

  // Check rate limit
  const rateLimit = await checkRateLimit(octokit);
  logInfo(`GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
  console.log();

  // Fetch reviews from all repos
  const allItems: ReviewCorpusItem[] = [];
  let processedRepos = 0;

  for (const repo of repos) {
    const range = getDateRangeForRepo(repo);
    const cacheFilename = getCacheFilename(repo, range, reviewerLogin);

    console.log(chalk.bold(`\n[${++processedRepos}/${repos.length}] ${repo.fullName}`));
    logInfo(`Date range: ${range.label}`);

    // Check cache first (with schema validation)
    const cached = readCacheFile(cacheFilename, cachedRepoDataSchema);
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
        reviewerLogin,
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
      failSpinner(`Failed: ${getErrorMessage(error)}`);
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

  // Dry run mode - show stats without calling LLM
  if (dryRun) {
    console.log(chalk.bold.cyan("\n=== Dry Run Summary ===\n"));
    const dryRunStats = dryRunProfile(allItems);
    logInfo(`Items to process: ${dryRunStats.itemCount}`);
    logInfo(`Chunks: ${dryRunStats.chunkCount}`);
    logInfo(`Would call LLM: ${dryRunStats.wouldCallLLM ? "Yes" : "No"}`);
    console.log(chalk.bold.cyan("\n=== Done (dry run) ===\n"));
    return;
  }

  // Write corpus JSON
  console.log(chalk.bold.cyan("\n=== Writing Output ===\n"));
  const jsonPath = writeCorpusJSON(allItems, reviewerLogin, "Mixed");
  logSuccess(`Corpus JSON: ${jsonPath}`);

  // Generate personality profile using LLM
  startSpinner("Generating personality profile...");
  try {
    const profile = await generatePersonalityProfile(
      config,
      allItems,
      reviewerLogin,
      reviewerName,
      (msg) => updateSpinner(msg)
    );

    succeedSpinner("Personality profile generated");

    // Write markdown
    const mdPath = writePersonalityMarkdown(profile, stats);
    logSuccess(`Personality Markdown: ${mdPath}`);
  } catch (error) {
    failSpinner(`LLM failed: ${getErrorMessage(error)}`);
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n=== Done! ===\n"));
}

// CLI setup with Commander
const program = new Command();

program
  .name("grumpy-carlos")
  .description("Generate a code review personality profile from GitHub activity")
  .version("1.0.0")
  .option(
    "-r, --reviewer <login>",
    "GitHub username of the reviewer",
    DEFAULT_REVIEWER_LOGIN
  )
  .option(
    "-n, --reviewer-name <name>",
    "Display name of the reviewer",
    DEFAULT_REVIEWER_NAME
  )
  .option(
    "-f, --repos-file <path>",
    "Path to repos.json file",
    REPOS_FILE
  )
  .option(
    "--dry-run",
    "Show what would be done without making LLM calls",
    false
  )
  .action(async (opts) => {
    try {
      await main({
        reviewer: opts.reviewer,
        reviewerName: opts.reviewerName,
        reposFile: opts.reposFile,
        dryRun: opts.dryRun,
      });
    } catch (error) {
      logError(`Unexpected error: ${getErrorMessage(error)}`);
      process.exit(1);
    }
  });

program.parse();
