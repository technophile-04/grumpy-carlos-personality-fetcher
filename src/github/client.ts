/**
 * Octokit client wrapper
 */

import { Octokit } from "octokit";
import type { Config } from "../types.js";

/**
 * Create a new Octokit instance.
 * We intentionally create a new instance each time to avoid hidden state
 * and make testing easier.
 */
export function createOctokit(config: Config): Octokit {
  return new Octokit({
    auth: config.githubToken,
  });
}

export async function checkRateLimit(octokit: Octokit): Promise<{
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  const { data } = await octokit.rest.rateLimit.get();
  return {
    remaining: data.rate.remaining,
    limit: data.rate.limit,
    resetAt: new Date(data.rate.reset * 1000),
  };
}
