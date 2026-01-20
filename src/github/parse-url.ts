/**
 * Parse GitHub URLs to extract owner/repo
 */

import type { RepoIdentifier } from "../types.js";

const GITHUB_URL_REGEX = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/;
const SHORTHAND_REGEX = /^([^/]+)\/([^/]+)$/;

export function parseGitHubUrl(input: string): RepoIdentifier {
  const trimmed = input.trim();

  const urlMatch = trimmed.match(GITHUB_URL_REGEX);
  if (urlMatch) {
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace(/\.git$/, "");
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
    };
  }

  const shorthandMatch = trimmed.match(SHORTHAND_REGEX);
  if (shorthandMatch) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2].replace(/\.git$/, "");
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
    };
  }

  throw new Error(
    `Invalid GitHub repository format: "${input}". Expected URL or owner/repo format.`
  );
}

export function parseGitHubUrls(inputs: string[]): RepoIdentifier[] {
  return inputs.map(parseGitHubUrl);
}

export function dedupeRepos(repos: RepoIdentifier[]): RepoIdentifier[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    const key = repo.fullName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
