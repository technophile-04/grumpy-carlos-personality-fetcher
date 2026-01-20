/**
 * Prompt templates for personality extraction
 */

import type { ReviewCorpusItem } from "../types.js";

const MAX_BODY_LENGTH = 500;

/**
 * Truncate text to a maximum length
 */
function truncate(text: string, maxLength: number): string {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 3) + "...";
}

/**
 * Format a single review item for the prompt
 */
function formatReviewItem(item: ReviewCorpusItem): string {
  const date = item.createdAt.toISOString().split("T")[0];
  const typeLabel =
    item.type === "review"
      ? "PR Review"
      : item.type === "review_comment"
      ? "Code Comment"
      : "PR Comment";

  const pathInfo = item.path ? ` on ${item.path}` : "";
  const stateInfo = item.state ? ` [${item.state}]` : "";

  return `[${date}] ${typeLabel}${stateInfo} - ${item.repo.fullName} PR#${item.prNumber}${pathInfo}
${truncate(item.body, MAX_BODY_LENGTH)}`;
}

/**
 * Format a chunk of review items for the prompt
 */
export function formatChunkForPrompt(items: ReviewCorpusItem[]): string {
  return items.map(formatReviewItem).join("\n\n---\n\n");
}

/**
 * System prompt for extracting persona notes from a chunk
 */
export const CHUNK_SYSTEM_PROMPT = `You are analyzing code review comments to extract personality traits and review patterns of a developer named Carlos (GitHub: carletex).

Your task is to identify:
1. Communication style and tone
2. Technical preferences and standards
3. Common phrases or expressions
4. What they praise and what they criticize
5. Areas of expertise they demonstrate
6. How they balance strictness with helpfulness

Output your observations as bullet points. Be specific and quote actual phrases when relevant.`;

/**
 * Generate user prompt for chunk analysis
 */
export function generateChunkPrompt(
  reviewerName: string,
  chunkIndex: number,
  totalChunks: number,
  formattedItems: string
): string {
  return `Analyze these code review comments from ${reviewerName} (chunk ${chunkIndex + 1} of ${totalChunks}).

Extract personality traits, review patterns, and communication style:

${formattedItems}

Provide bullet-point observations about their reviewing personality.`;
}

/**
 * System prompt for consolidating chunk notes into final personality
 */
export const CONSOLIDATE_SYSTEM_PROMPT = `You are creating a detailed personality profile for a code reviewer to be used as a sub-agent specification. This profile will guide an AI assistant to review code in the same style and with the same standards as this developer.

The profile should be comprehensive, actionable, and capture both technical preferences and communication style.`;

/**
 * Generate user prompt for consolidation
 */
export function generateConsolidatePrompt(
  reviewerName: string,
  reviewerLogin: string,
  totalItems: number,
  chunkNotes: string[]
): string {
  const notesText = chunkNotes
    .map((note, i) => `### Observations Set ${i + 1}\n${note}`)
    .join("\n\n");

  return `Based on the following observations extracted from ${totalItems} code review comments by ${reviewerName} (${reviewerLogin}), create a comprehensive personality profile.

${notesText}

---

Create a detailed personality profile that includes:

## Core Philosophy
What are their fundamental beliefs about code quality?

## Communication Style
How do they communicate feedback? What tone do they use?

## Technical Standards
What specific technical standards do they enforce?

## Review Patterns
What do they typically focus on? What patterns emerge?

## Common Phrases and Expressions
Actual phrases or expressions they tend to use.

## What They Praise
What earns positive feedback?

## What They Criticize
What triggers negative feedback?

## Areas of Expertise
Technical domains where they show deep knowledge.

## Review Process
How do they approach reviewing code systematically?

Format the output as a well-structured markdown document suitable for use as an AI sub-agent specification.`;
}
