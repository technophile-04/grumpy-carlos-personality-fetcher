/**
 * Core summarization logic for personality extraction
 */

import { generateText } from "ai";
import type { Config, ReviewCorpusItem, PersonalityProfile } from "../types.js";
import { getLanguageModel } from "./provider.js";
import {
  generateChunkSystemPrompt,
  CONSOLIDATE_SYSTEM_PROMPT,
  formatChunkForPrompt,
  generateChunkPrompt,
  generateConsolidatePrompt,
} from "./prompt.js";

const CHUNK_SIZE = 30; // Number of review items per chunk

/**
 * Split items into chunks for processing
 */
function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process a single chunk to extract persona notes
 */
async function processChunk(
  config: Config,
  items: ReviewCorpusItem[],
  chunkIndex: number,
  totalChunks: number,
  reviewerName: string,
  reviewerLogin: string
): Promise<string> {
  const model = getLanguageModel(config);
  const formattedItems = formatChunkForPrompt(items);
  const prompt = generateChunkPrompt(
    reviewerName,
    chunkIndex,
    totalChunks,
    formattedItems
  );

  const result = await generateText({
    model,
    system: generateChunkSystemPrompt(reviewerName, reviewerLogin),
    prompt,
    temperature: 0.3,
  });

  return result.text;
}

/**
 * Consolidate chunk notes into final personality profile
 */
async function consolidateNotes(
  config: Config,
  chunkNotes: string[],
  reviewerName: string,
  reviewerLogin: string,
  totalItems: number
): Promise<string> {
  const model = getLanguageModel(config);
  const prompt = generateConsolidatePrompt(
    reviewerName,
    reviewerLogin,
    totalItems,
    chunkNotes
  );

  const result = await generateText({
    model,
    system: CONSOLIDATE_SYSTEM_PROMPT,
    prompt,
    temperature: 0.4,
  });

  return result.text;
}

/**
 * Generate personality profile from review items
 */
export async function generatePersonalityProfile(
  config: Config,
  items: ReviewCorpusItem[],
  reviewerLogin: string,
  reviewerName: string,
  onProgress?: (message: string) => void
): Promise<PersonalityProfile> {

  // Sort items by date
  const sortedItems = [...items].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // Split into chunks
  const chunks = chunkItems(sortedItems, CHUNK_SIZE);
  const totalChunks = chunks.length;

  onProgress?.(`Processing ${totalChunks} chunks of review data...`);

  // Process each chunk
  const chunkNotes: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Analyzing chunk ${i + 1}/${totalChunks}...`);
    const notes = await processChunk(
      config,
      chunks[i],
      i,
      totalChunks,
      reviewerName,
      reviewerLogin
    );
    chunkNotes.push(notes);
  }

  // Consolidate into final profile
  onProgress?.(`Consolidating into final personality profile...`);
  const profileText = await consolidateNotes(
    config,
    chunkNotes,
    reviewerName,
    reviewerLogin,
    items.length
  );

  return {
    generatedAt: new Date(),
    reviewer: reviewerLogin,
    sourceItemCount: items.length,
    noteCount: chunkNotes.length,
    text: profileText,
  };
}

/**
 * Dry run - return stats without calling LLM
 */
export function dryRunProfile(items: ReviewCorpusItem[]): {
  itemCount: number;
  chunkCount: number;
  wouldCallLLM: boolean;
} {
  const chunks = chunkItems(items, CHUNK_SIZE);
  return {
    itemCount: items.length,
    chunkCount: chunks.length,
    wouldCallLLM: items.length > 0,
  };
}
