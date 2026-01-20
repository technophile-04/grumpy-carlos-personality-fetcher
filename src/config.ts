/**
 * Configuration loading and validation using Zod
 */

import { config as dotenvConfig } from "dotenv";
import { z } from "zod";
import type { Config, LLMProvider } from "./types.js";

// Load .env file
dotenvConfig();

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).optional(),
  LLM_MODEL: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20241022",
};

/**
 * Load and validate environment variables
 */
export function loadEnvConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((e) => `  - ${String(e.path.join("."))}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}

/**
 * Build final config from env
 */
export function buildConfig(): Config {
  const env = loadEnvConfig();

  const provider: LLMProvider = env.LLM_PROVIDER ?? "openai";
  const model = env.LLM_MODEL ?? DEFAULT_MODELS[provider];

  if (provider === "openai" && !env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when using OpenAI provider");
  }
  if (provider === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required when using Anthropic provider");
  }

  return {
    githubToken: env.GITHUB_TOKEN,
    llmProvider: provider,
    llmModel: model,
    openaiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
  };
}
