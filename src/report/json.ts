/**
 * JSON report generator
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ReviewCorpusItem,
  ReviewCorpusStats,
  ReviewCorpusReportJSON,
  ReviewCorpusItemJSON,
} from "../types.js";
import { OUTPUT_DIR } from "../constants.js";
import { ensureDir } from "../utils/fs.js";

/**
 * Convert ReviewCorpusItem to JSON-serializable format
 */
function itemToJSON(item: ReviewCorpusItem): ReviewCorpusItemJSON {
  return {
    repo: item.repo.fullName,
    prNumber: item.prNumber,
    prTitle: item.prTitle,
    prUrl: item.prUrl,
    type: item.type,
    body: item.body,
    createdAt: item.createdAt.toISOString(),
    author: item.author,
    url: item.url,
    state: item.state,
    path: item.path,
    line: item.line,
  };
}

/**
 * Calculate corpus statistics
 */
export function calculateStats(items: ReviewCorpusItem[]): ReviewCorpusStats {
  const byRepo: Record<string, number> = {};
  let reviews = 0;
  let reviewComments = 0;
  let issueComments = 0;

  for (const item of items) {
    byRepo[item.repo.fullName] = (byRepo[item.repo.fullName] || 0) + 1;

    if (item.type === "review") reviews++;
    else if (item.type === "review_comment") reviewComments++;
    else if (item.type === "issue_comment") issueComments++;
  }

  return {
    totalItems: items.length,
    reviews,
    reviewComments,
    issueComments,
    repos: Object.keys(byRepo).length,
    byRepo,
  };
}

/**
 * Write corpus JSON report
 */
export function writeCorpusJSON(
  items: ReviewCorpusItem[],
  reviewer: string,
  rangeLabel: string
): string {
  ensureDir(OUTPUT_DIR);

  const stats = calculateStats(items);
  const report: ReviewCorpusReportJSON = {
    generatedAt: new Date().toISOString(),
    reviewer,
    rangeLabel,
    stats,
    items: items.map(itemToJSON),
  };

  const filename = "grumpy-carlos-corpus.json";
  const filepath = join(OUTPUT_DIR, filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2));

  return filepath;
}
