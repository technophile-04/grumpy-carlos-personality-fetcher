/**
 * Zod schemas for runtime validation
 */

import { z } from "zod";

export const repoIdentifierSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  fullName: z.string(),
});

const cachedItemSchema = z.object({
  repo: z.object({
    owner: z.string(),
    repo: z.string(),
    fullName: z.string(),
  }),
  prNumber: z.number(),
  prTitle: z.string(),
  prUrl: z.string(),
  type: z.enum(["review", "review_comment", "issue_comment"]),
  body: z.string(),
  createdAt: z.string(),
  author: z.string().nullable(),
  url: z.string(),
  state: z.string().optional(),
  path: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
});

export const cachedRepoDataSchema = z.object({
  repo: repoIdentifierSchema,
  rangeLabel: z.string(),
  fetchedAt: z.string(),
  items: z.array(cachedItemSchema),
});

export type CachedRepoData = z.infer<typeof cachedRepoDataSchema>;
export type CachedItem = z.infer<typeof cachedItemSchema>;
