/**
 * Fetch PR reviews, review comments, and issue comments for a reviewer
 */

import type { Octokit } from "octokit";
import type {
  RepoIdentifier,
  DateRange,
  ReviewCorpusItem,
  RepoReviewData,
} from "../types.js";

/**
 * Check if a date is within the given range
 */
export function isWithinRange(date: Date, range: DateRange): boolean {
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

/**
 * List all PRs in a repo (paginated)
 */
export async function listRepoPullRequests(
  octokit: Octokit,
  repo: RepoIdentifier,
  range: DateRange
): Promise<Array<{ number: number; title: string; url: string }>> {
  const prs: Array<{ number: number; title: string; url: string }> = [];

  const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner: repo.owner,
    repo: repo.repo,
    state: "all",
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  for await (const { data } of iterator) {
    for (const pr of data) {
      const updatedAt = new Date(pr.updated_at);
      const createdAt = new Date(pr.created_at);

      // If range has start and PR was last updated before start, skip rest
      if (range.start && updatedAt < range.start) {
        return prs;
      }

      // Include PR if it was created or updated within range
      if (isWithinRange(createdAt, range) || isWithinRange(updatedAt, range)) {
        prs.push({
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
        });
      }
    }
  }

  return prs;
}

/**
 * Fetch reviews for a specific PR
 */
async function fetchPRReviews(
  octokit: Octokit,
  repo: RepoIdentifier,
  prNumber: number,
  prTitle: string,
  prUrl: string,
  reviewerLogin: string,
  range: DateRange
): Promise<ReviewCorpusItem[]> {
  const items: ReviewCorpusItem[] = [];

  try {
    const { data: reviews } = await octokit.rest.pulls.listReviews({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: prNumber,
      per_page: 100,
    });

    for (const review of reviews) {
      if (review.user?.login?.toLowerCase() !== reviewerLogin.toLowerCase()) {
        continue;
      }

      // submitted_at may be null for pending reviews
      if (!review.submitted_at) continue;
      const createdAt = new Date(review.submitted_at);
      if (!isWithinRange(createdAt, range)) continue;

      if (review.body && review.body.trim()) {
        items.push({
          repo,
          prNumber,
          prTitle,
          prUrl,
          type: "review",
          body: review.body,
          createdAt,
          author: review.user?.login ?? null,
          url: review.html_url,
          state: review.state,
        });
      }
    }
  } catch {
    // PR may have been deleted or inaccessible
  }

  return items;
}

/**
 * Fetch review comments for a repo (inline code comments)
 */
async function fetchRepoReviewComments(
  octokit: Octokit,
  repo: RepoIdentifier,
  reviewerLogin: string,
  range: DateRange,
  prMap: Map<number, { title: string; url: string }>
): Promise<ReviewCorpusItem[]> {
  const items: ReviewCorpusItem[] = [];

  const iterator = octokit.paginate.iterator(
    octokit.rest.pulls.listReviewCommentsForRepo,
    {
      owner: repo.owner,
      repo: repo.repo,
      sort: "created",
      direction: "desc",
      per_page: 100,
      since: range.start?.toISOString(),
    }
  );

  for await (const { data } of iterator) {
    for (const comment of data) {
      if (comment.user?.login?.toLowerCase() !== reviewerLogin.toLowerCase()) {
        continue;
      }

      const createdAt = new Date(comment.created_at);
      if (!isWithinRange(createdAt, range)) continue;

      const prNumber =
        comment.pull_request_url?.split("/").pop() ?? "0";
      const prNum = parseInt(prNumber, 10);

      const prInfo = prMap.get(prNum) || {
        title: `PR #${prNum}`,
        url: comment.pull_request_url || "",
      };

      if (comment.body && comment.body.trim()) {
        items.push({
          repo,
          prNumber: prNum,
          prTitle: prInfo.title,
          prUrl: prInfo.url,
          type: "review_comment",
          body: comment.body,
          createdAt,
          author: comment.user?.login ?? null,
          url: comment.html_url,
          path: comment.path,
          line: comment.line ?? comment.original_line ?? null,
        });
      }
    }

    // Stop early if we're past the range
    const lastComment = data[data.length - 1];
    if (lastComment && range.start) {
      const lastDate = new Date(lastComment.created_at);
      if (lastDate < range.start) break;
    }
  }

  return items;
}

/**
 * Fetch issue comments on PRs for a repo
 */
async function fetchRepoIssueComments(
  octokit: Octokit,
  repo: RepoIdentifier,
  reviewerLogin: string,
  range: DateRange,
  prNumbers: Set<number>
): Promise<ReviewCorpusItem[]> {
  const items: ReviewCorpusItem[] = [];

  const iterator = octokit.paginate.iterator(
    octokit.rest.issues.listCommentsForRepo,
    {
      owner: repo.owner,
      repo: repo.repo,
      sort: "created",
      direction: "desc",
      per_page: 100,
      since: range.start?.toISOString(),
    }
  );

  for await (const { data } of iterator) {
    for (const comment of data) {
      if (comment.user?.login?.toLowerCase() !== reviewerLogin.toLowerCase()) {
        continue;
      }

      const createdAt = new Date(comment.created_at);
      if (!isWithinRange(createdAt, range)) continue;

      // Extract issue/PR number from URL
      const issueUrl = comment.issue_url || "";
      const issueNumStr = issueUrl.split("/").pop() || "0";
      const issueNum = parseInt(issueNumStr, 10);

      // Only include if it's a PR (in our PR set)
      if (!prNumbers.has(issueNum)) continue;

      if (comment.body && comment.body.trim()) {
        items.push({
          repo,
          prNumber: issueNum,
          prTitle: `PR #${issueNum}`,
          prUrl: comment.html_url.replace(/#.*$/, ""),
          type: "issue_comment",
          body: comment.body,
          createdAt,
          author: comment.user?.login ?? null,
          url: comment.html_url,
        });
      }
    }

    // Stop early if we're past the range
    const lastComment = data[data.length - 1];
    if (lastComment && range.start) {
      const lastDate = new Date(lastComment.created_at);
      if (lastDate < range.start) break;
    }
  }

  return items;
}

/**
 * Fetch all reviews for a repo by a specific reviewer
 */
export async function fetchRepoReviews(
  octokit: Octokit,
  repo: RepoIdentifier,
  reviewerLogin: string,
  range: DateRange,
  onProgress?: (message: string) => void
): Promise<RepoReviewData> {
  const allItems: ReviewCorpusItem[] = [];

  onProgress?.(`Listing PRs for ${repo.fullName}...`);
  const prs = await listRepoPullRequests(octokit, repo, range);

  const prMap = new Map<number, { title: string; url: string }>();
  const prNumbers = new Set<number>();
  for (const pr of prs) {
    prMap.set(pr.number, { title: pr.title, url: pr.url });
    prNumbers.add(pr.number);
  }

  onProgress?.(`Found ${prs.length} PRs, fetching reviews...`);

  // Fetch PR reviews (the formal review submissions)
  for (const pr of prs) {
    const reviews = await fetchPRReviews(
      octokit,
      repo,
      pr.number,
      pr.title,
      pr.url,
      reviewerLogin,
      range
    );
    allItems.push(...reviews);
  }

  onProgress?.(`Fetching review comments...`);
  const reviewComments = await fetchRepoReviewComments(
    octokit,
    repo,
    reviewerLogin,
    range,
    prMap
  );
  allItems.push(...reviewComments);

  onProgress?.(`Fetching issue comments on PRs...`);
  const issueComments = await fetchRepoIssueComments(
    octokit,
    repo,
    reviewerLogin,
    range,
    prNumbers
  );
  allItems.push(...issueComments);

  // Sort by date ascending
  allItems.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    repo,
    rangeLabel: range.label,
    fetchedAt: new Date(),
    items: allItems,
  };
}
