/**
 * Markdown report generator
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "date-fns";
import type { PersonalityProfile, ReviewCorpusStats } from "../types.js";
import { OUTPUT_DIR } from "../constants.js";

/**
 * Ensure output directory exists
 */
function ensureOutputDir(): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Generate markdown content for personality profile
 */
export function generatePersonalityMarkdown(
  profile: PersonalityProfile,
  stats: ReviewCorpusStats
): string {
  const lines: string[] = [];

  // Header
  lines.push("# Grumpy Carlos Code Reviewer - Personality Profile");
  lines.push("");
  lines.push(`> Generated on ${format(profile.generatedAt, "PPpp")}`);
  lines.push("");

  // Metadata
  lines.push("## Source Data");
  lines.push("");
  lines.push(`- **Reviewer:** ${profile.reviewer}`);
  lines.push(`- **Total Review Items:** ${stats.totalItems}`);
  lines.push(`- **PR Reviews:** ${stats.reviews}`);
  lines.push(`- **Code Comments:** ${stats.reviewComments}`);
  lines.push(`- **PR Comments:** ${stats.issueComments}`);
  lines.push(`- **Repositories Analyzed:** ${stats.repos}`);
  lines.push("");

  // Repository breakdown
  lines.push("### Repository Breakdown");
  lines.push("");
  const sortedRepos = Object.entries(stats.byRepo).sort((a, b) => b[1] - a[1]);
  for (const [repo, count] of sortedRepos) {
    lines.push(`- **${repo}:** ${count} items`);
  }
  lines.push("");

  // Separator
  lines.push("---");
  lines.push("");

  // Profile content
  lines.push(profile.text);
  lines.push("");

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(
    "*This personality profile was generated from GitHub code review activity using grumpy-carlos CLI.*"
  );

  return lines.join("\n");
}

/**
 * Write personality markdown report
 */
export function writePersonalityMarkdown(
  profile: PersonalityProfile,
  stats: ReviewCorpusStats
): string {
  ensureOutputDir();

  const content = generatePersonalityMarkdown(profile, stats);
  const filename = "grumpy-carlos-personality.md";
  const filepath = join(OUTPUT_DIR, filename);

  writeFileSync(filepath, content);

  return filepath;
}
