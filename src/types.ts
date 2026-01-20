/**
 * Shared TypeScript types for the Grumpy Carlos personality CLI
 */

export interface RepoIdentifier {
  owner: string;
  repo: string;
  fullName: string;
}

export type LLMProvider = "openai" | "anthropic";

export interface Config {
  githubToken: string;
  llmProvider: LLMProvider;
  llmModel: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
}

export interface DateRange {
  start?: Date;
  end?: Date;
  label: string;
  key: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  url: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ReviewItemType = "review" | "review_comment" | "issue_comment";

export interface ReviewCorpusItem {
  repo: RepoIdentifier;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  type: ReviewItemType;
  body: string;
  createdAt: Date;
  author: string | null;
  url: string;
  state?: string;
  path?: string | null;
  line?: number | null;
}

export interface RepoReviewData {
  repo: RepoIdentifier;
  rangeLabel: string;
  fetchedAt: Date;
  items: ReviewCorpusItem[];
}

export interface ReviewCorpusStats {
  totalItems: number;
  reviews: number;
  reviewComments: number;
  issueComments: number;
  repos: number;
  byRepo: Record<string, number>;
}

export interface ReviewCorpusReport {
  generatedAt: Date;
  reviewer: string;
  rangeLabel: string;
  stats: ReviewCorpusStats;
  items: ReviewCorpusItem[];
}

export interface ReviewCorpusItemJSON {
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  type: ReviewItemType;
  body: string;
  createdAt: string;
  author: string | null;
  url: string;
  state?: string;
  path?: string | null;
  line?: number | null;
}

export interface RepoReviewDataJSON {
  repo: RepoIdentifier;
  rangeLabel: string;
  fetchedAt: string;
  items: ReviewCorpusItemJSON[];
}

export interface ReviewCorpusReportJSON {
  generatedAt: string;
  reviewer: string;
  rangeLabel: string;
  stats: ReviewCorpusStats;
  items: ReviewCorpusItemJSON[];
}

export interface PersonalityProfile {
  generatedAt: Date;
  reviewer: string;
  sourceItemCount: number;
  noteCount: number;
  text: string;
}
