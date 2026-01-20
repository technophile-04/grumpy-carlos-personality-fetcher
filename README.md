# Grumpy Carlos Personality Fetcher

A CLI tool that analyzes a GitHub user's code review activity and generates a detailed personality profile using LLMs. This profile can be used to create an AI sub-agent that reviews code in the same style.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)
![License](https://img.shields.io/badge/License-ISC-lightgrey)

## Table of Contents

- [Grumpy Carlos Personality Fetcher](#grumpy-carlos-personality-fetcher)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Architecture](#architecture)
  - [Complete Pipeline Flow](#complete-pipeline-flow)
    - [Phase 1: Configuration \& Initialization](#phase-1-configuration--initialization)
    - [Phase 2: Repository Parsing](#phase-2-repository-parsing)
    - [Phase 3: GitHub Data Fetching](#phase-3-github-data-fetching)
      - [Step 3.1: Initialize Octokit Client](#step-31-initialize-octokit-client)
      - [Step 3.2: Check Rate Limits](#step-32-check-rate-limits)
      - [Step 3.3: Fetch All PR Numbers](#step-33-fetch-all-pr-numbers)
      - [Step 3.4: Fetch PR Reviews (Formal Submissions)](#step-34-fetch-pr-reviews-formal-submissions)
      - [Step 3.5: Fetch Review Comments (Inline Code Comments)](#step-35-fetch-review-comments-inline-code-comments)
      - [Step 3.6: Fetch Issue Comments (General PR Discussion)](#step-36-fetch-issue-comments-general-pr-discussion)
    - [Phase 4: Caching Layer](#phase-4-caching-layer)
    - [Phase 5: Chunking for LLM Processing](#phase-5-chunking-for-llm-processing)
    - [Phase 6: LLM Summarization Pipeline](#phase-6-llm-summarization-pipeline)
      - [Phase 6.1: Chunk Analysis](#phase-61-chunk-analysis)
      - [Phase 6.2: Consolidation](#phase-62-consolidation)
    - [Phase 7: Output Generation](#phase-7-output-generation)
      - [Output 1: Corpus JSON](#output-1-corpus-json)
      - [Output 2: Personality Markdown](#output-2-personality-markdown)
  - [Project Structure](#project-structure)
  - [Setup \& Usage](#setup--usage)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Configuration](#configuration)
    - [Run](#run)
    - [Output](#output)
  - [Configuration](#configuration-1)
    - [Environment Variables](#environment-variables)
    - [Constants (`src/constants.ts`)](#constants-srcconstantsts)
  - [Output Files](#output-files)
    - [Corpus JSON Schema](#corpus-json-schema)
    - [Personality Profile Structure](#personality-profile-structure)
  - [License](#license)

---

## Overview

The Grumpy Carlos Personality Fetcher extracts personality traits and review patterns from a developer's GitHub code review history. It processes:

- **PR Reviews** - Formal review submissions (APPROVE, REQUEST_CHANGES, COMMENT)
- **Review Comments** - Inline code comments on specific lines
- **Issue Comments** - General discussion comments on PRs

The tool then uses LLMs (OpenAI or Anthropic) to analyze this corpus and generate a comprehensive personality profile.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  .env (credentials)    repos.json (repository list)    constants.ts         │
└─────────────────┬───────────────────┬─────────────────────┬─────────────────┘
                  │                   │                     │
                  ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONFIGURATION                                      │
│  buildConfig() → validates env vars, sets LLM provider/model                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GITHUB FETCHING LAYER                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────────────┐         │
│  │ List PRs    │───▶│ Fetch PR Reviews │───▶│ Fetch Review       │         │
│  │ (paginated) │    │ (per PR)         │    │ Comments (inline)  │         │
│  └─────────────┘    └──────────────────┘    └────────────────────┘         │
│                                                       │                     │
│                                                       ▼                     │
│                                              ┌────────────────────┐         │
│                                              │ Fetch Issue        │         │
│                                              │ Comments (general) │         │
│                                              └────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CACHING LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  .cache/{owner}-{repo}-{reviewer}-{dateRange}.json                          │
│                                                                              │
│  ✓ Checks cache before fetching                                             │
│  ✓ Writes fetched data to cache                                             │
│  ✓ Restores Date objects from ISO strings                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CORPUS AGGREGATION                                  │
│  All ReviewCorpusItem[] from all repos → sorted by date                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHUNKING LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Items split into chunks of 30 (CHUNK_SIZE)                                 │
│                                                                              │
│  [Item 1-30] [Item 31-60] [Item 61-90] ... [Item N-M]                       │
│      │            │            │              │                              │
│   Chunk 1      Chunk 2      Chunk 3    ...  Chunk N                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LLM SUMMARIZATION PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    PHASE 1: CHUNK ANALYSIS                          │    │
│  │                                                                      │    │
│  │   Chunk 1 ──▶ [LLM] ──▶ Observations 1                              │    │
│  │   Chunk 2 ──▶ [LLM] ──▶ Observations 2                              │    │
│  │   Chunk 3 ──▶ [LLM] ──▶ Observations 3                              │    │
│  │      ...         ...         ...                                     │    │
│  │   Chunk N ──▶ [LLM] ──▶ Observations N                              │    │
│  │                                                                      │    │
│  │   System Prompt: Extract personality traits, review patterns,       │    │
│  │                  communication style from review comments           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                   PHASE 2: CONSOLIDATION                            │    │
│  │                                                                      │    │
│  │   [Observations 1, 2, 3, ..., N] ──▶ [LLM] ──▶ Personality Profile  │    │
│  │                                                                      │    │
│  │   Generates structured profile with:                                │    │
│  │   - Core Philosophy                                                 │    │
│  │   - Communication Style                                             │    │
│  │   - Technical Standards                                             │    │
│  │   - Review Patterns                                                 │    │
│  │   - Common Phrases                                                  │    │
│  │   - What They Praise/Criticize                                      │    │
│  │   - Areas of Expertise                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OUTPUT LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  output/grumpy-carlos-corpus.json     output/grumpy-carlos-personality.md   │
│  ├── generatedAt                      ├── Metadata & Stats                  │
│  ├── reviewer                         ├── Repository Breakdown               │
│  ├── stats                            └── Full Personality Profile          │
│  │   ├── totalItems                                                          │
│  │   ├── reviews                                                             │
│  │   ├── reviewComments                                                      │
│  │   ├── issueComments                                                       │
│  │   └── byRepo                                                              │
│  └── items[]                                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete Pipeline Flow

### Phase 1: Configuration & Initialization

**Files:** `src/config.ts`, `src/constants.ts`

The pipeline begins by loading and validating configuration:

```
┌────────────────────┐
│   .env file        │
│                    │
│ GITHUB_TOKEN       │
│ OPENAI_API_KEY     │──▶ loadEnvConfig() ──▶ buildConfig() ──▶ Config object
│ ANTHROPIC_API_KEY  │         │
│ LLM_PROVIDER       │    Zod validation
│ LLM_MODEL          │
└────────────────────┘
```

**What happens:**
1. `dotenv` loads environment variables from `.env`
2. `zod` schema validates required fields (`GITHUB_TOKEN` is mandatory)
3. `buildConfig()` determines LLM provider and model (defaults: OpenAI + gpt-4o-mini)
4. Returns a `Config` object with all credentials and settings

**Constants defined in `constants.ts`:**
- `REVIEWER_LOGIN` = "carletex" (the GitHub user to analyze)
- `REPOS_FILE` = "repos.json" (list of repos to scan)
- `EXTENDED_HISTORY_REPOS` - repos that get 2022-2025 date range
- `RANGE_START/END` - default 2025 date range

---

### Phase 2: Repository Parsing

**Files:** `src/github/parse-url.ts`, `repos.json`

The tool reads repositories from `repos.json`:

```json
{
  "repos": [
    "BuidlGuidl/SpeedRunEthereum-v2",
    "scaffold-eth/scaffold-eth-2",
    "github.com/owner/repo",
    ...
  ]
}
```

**Parsing process:**
```
Input strings ──▶ parseGitHubUrls() ──▶ dedupeRepos() ──▶ RepoIdentifier[]
```

Supports formats:
- Short form: `owner/repo`
- Full URL: `https://github.com/owner/repo`
- URL with `.git`: `https://github.com/owner/repo.git`

Each repo becomes a `RepoIdentifier`:
```typescript
{
  owner: "scaffold-eth",
  repo: "scaffold-eth-2",
  fullName: "scaffold-eth/scaffold-eth-2"
}
```

---

### Phase 3: GitHub Data Fetching

**Files:** `src/github/client.ts`, `src/github/reviews.ts`

For each repository, the tool fetches three types of data:

#### Step 3.1: Initialize Octokit Client
```typescript
const octokit = getOctokit(config); // Singleton pattern
```

#### Step 3.2: Check Rate Limits
```typescript
const rateLimit = await checkRateLimit(octokit);
// Shows: "GitHub API rate limit: 4532/5000"
```

#### Step 3.3: Fetch All PR Numbers
```
listRepoPullRequests(octokit, repo, dateRange)
```
- Paginates through all PRs (100 per page)
- Filters by date range (created or updated within range)
- Returns: `{ number, title, url }[]`

#### Step 3.4: Fetch PR Reviews (Formal Submissions)
For each PR:
```
fetchPRReviews(octokit, repo, prNumber, reviewerLogin, dateRange)
```
- Fetches reviews from `octokit.rest.pulls.listReviews`
- Filters by reviewer login (case-insensitive)
- Captures: body, state (APPROVED/CHANGES_REQUESTED/COMMENTED), date

#### Step 3.5: Fetch Review Comments (Inline Code Comments)
```
fetchRepoReviewComments(octokit, repo, reviewerLogin, dateRange, prMap)
```
- Fetches from `octokit.rest.pulls.listReviewCommentsForRepo`
- These are comments on specific code lines
- Captures: body, path, line number

#### Step 3.6: Fetch Issue Comments (General PR Discussion)
```
fetchRepoIssueComments(octokit, repo, reviewerLogin, dateRange, prNumbers)
```
- Fetches from `octokit.rest.issues.listCommentsForRepo`
- Only includes comments on PRs (not issues)
- Captures: body, url

**Data Structure - ReviewCorpusItem:**
```typescript
{
  repo: RepoIdentifier,
  prNumber: number,
  prTitle: string,
  prUrl: string,
  type: "review" | "review_comment" | "issue_comment",
  body: string,
  createdAt: Date,
  author: string | null,
  url: string,
  state?: string,      // For reviews: APPROVED, CHANGES_REQUESTED, etc.
  path?: string | null, // For inline comments: file path
  line?: number | null  // For inline comments: line number
}
```

---

### Phase 4: Caching Layer

**Files:** `src/utils/cache.ts`

The caching layer prevents redundant API calls and speeds up development iterations.

**Cache Location:** `.cache/` directory

**Cache Filename Format:**
```
{owner}-{repo}-{reviewer}-{dateRange}.json

Example: scaffold-eth-scaffold-eth-2-carletex-2022-2025.json
```

**Cache Flow:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                        For Each Repository                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────┐         ┌─────────────────────────────────┐  │
│   │ Generate cache   │         │ Check: Does cache file exist?   │  │
│   │ filename         │────────▶│                                 │  │
│   └──────────────────┘         └───────────────┬─────────────────┘  │
│                                                │                     │
│                              ┌─────────────────┴─────────────────┐  │
│                              │                                    │  │
│                           YES │                                NO │  │
│                              ▼                                    ▼  │
│              ┌──────────────────────────┐    ┌───────────────────────┐
│              │ readCacheFile()          │    │ Fetch from GitHub API │
│              │ → Parse JSON             │    │ → Process responses   │
│              │ → Restore Date objects   │    │ → Build corpus items  │
│              │ → Return items           │    └───────────┬───────────┘
│              └──────────────────────────┘                │           │
│                              │                           ▼           │
│                              │            ┌──────────────────────────┐
│                              │            │ writeCacheFile()         │
│                              │            │ → Serialize to JSON      │
│                              │            │ → Store in .cache/       │
│                              │            └──────────────────────────┘
│                              │                           │           │
│                              └───────────┬───────────────┘           │
│                                          ▼                           │
│                              ┌──────────────────────────┐            │
│                              │ Add to allItems[]        │            │
│                              └──────────────────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Cache Data Structure:**
```typescript
{
  repo: RepoIdentifier,
  rangeLabel: "2022-2025" | "2025",
  fetchedAt: "2025-01-20T...",  // ISO string
  items: [
    {
      ...reviewCorpusItem,
      createdAt: "2024-06-15T..."  // Dates stored as ISO strings
    }
  ]
}
```

**Cache Restoration:**
When loading from cache, `restoreCachedItems()` converts ISO date strings back to `Date` objects.

---

### Phase 5: Chunking for LLM Processing

**Files:** `src/summarize/summarize.ts`

After collecting all review items from all repositories, the corpus is too large to send to an LLM in one request. The chunking layer breaks it into manageable pieces.

**Chunk Configuration:**
```typescript
const CHUNK_SIZE = 30; // Items per chunk
```

**Chunking Process:**
```
Total Items: 1,200 review items
                │
                ▼
        chunkItems(items, 30)
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Chunk 1     Chunk 2     Chunk 3     ...     Chunk 40          │
│  [1-30]      [31-60]     [61-90]             [1171-1200]        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Why Chunking?**
1. **Token limits** - LLMs have context window limits
2. **Cost efficiency** - Process in batches, fail gracefully
3. **Quality** - Focused analysis on smaller sets produces better observations

---

### Phase 6: LLM Summarization Pipeline

**Files:** `src/summarize/summarize.ts`, `src/summarize/prompt.ts`, `src/summarize/provider.ts`

The summarization happens in two phases:

#### Phase 6.1: Chunk Analysis

Each chunk is processed independently by the LLM to extract personality observations.

**Prompt Preparation (`formatChunkForPrompt`):**
```
[2024-06-15] Code Comment - scaffold-eth/scaffold-eth-2 PR#423 on packages/nextjs/app/page.tsx
Great catch! Let's add that type annotation...

---

[2024-06-16] PR Review [APPROVED] - scaffold-eth/scaffold-eth-2 PR#425
LGTM! Nice refactor 🎉

---

[2024-06-17] Code Comment - scaffold-eth/scaffold-eth-2 PR#428 on packages/hardhat/contracts/YourContract.sol
nit: we usually prefer using `mapping` here instead of arrays for gas efficiency...
```

**System Prompt (CHUNK_SYSTEM_PROMPT):**
```
You are analyzing code review comments to extract personality traits...

Your task is to identify:
1. Communication style and tone
2. Technical preferences and standards
3. Common phrases or expressions
4. What they praise and what they criticize
5. Areas of expertise they demonstrate
6. How they balance strictness with helpfulness
```

**LLM Call:**
```typescript
const result = await generateText({
  model: getLanguageModel(config),  // OpenAI or Anthropic
  system: CHUNK_SYSTEM_PROMPT,
  prompt: generateChunkPrompt(...),
  temperature: 0.3,  // Low temperature for consistent analysis
});
```

**Output:** Bullet-point observations for each chunk
```
- Uses positive language ("Great catch!", "LGTM!")
- Focuses on gas efficiency in Solidity code
- Prefers explicit type annotations
- Often uses "nit:" prefix for minor suggestions
- Approves PRs quickly when code meets standards
...
```

#### Phase 6.2: Consolidation

All chunk observations are merged into a final personality profile.

**Flow:**
```
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Observations  │ │ Observations  │ │ Observations  │
│   Chunk 1     │ │   Chunk 2     │ │   Chunk N     │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        └────────────────┬┘─────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Consolidation LLM   │
              │  Temperature: 0.4    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Personality Profile │
              │                      │
              │  ## Core Philosophy  │
              │  ## Communication    │
              │  ## Technical Stds   │
              │  ## Review Patterns  │
              │  ## Common Phrases   │
              │  ## What They Praise │
              │  ## What They Crit   │
              │  ## Expertise Areas  │
              │  ## Review Process   │
              └──────────────────────┘
```

**System Prompt (CONSOLIDATE_SYSTEM_PROMPT):**
```
You are creating a detailed personality profile for a code reviewer 
to be used as a sub-agent specification. This profile will guide an 
AI assistant to review code in the same style and with the same 
standards as this developer.
```

**Output Structure:**
The final profile is a structured markdown document covering:
- Core Philosophy
- Communication Style  
- Technical Standards
- Review Patterns
- Common Phrases and Expressions
- What They Praise
- What They Criticize
- Areas of Expertise
- Review Process

---

### Phase 7: Output Generation

**Files:** `src/report/json.ts`, `src/report/markdown.ts`

Two output files are generated:

#### Output 1: Corpus JSON

**File:** `output/grumpy-carlos-corpus.json`

Contains the complete raw data:
```json
{
  "generatedAt": "2025-01-20T12:00:00.000Z",
  "reviewer": "carletex",
  "rangeLabel": "Mixed",
  "stats": {
    "totalItems": 1247,
    "reviews": 312,
    "reviewComments": 823,
    "issueComments": 112,
    "repos": 16,
    "byRepo": {
      "scaffold-eth/scaffold-eth-2": 542,
      "BuidlGuidl/SpeedRunEthereum-v2": 234,
      ...
    }
  },
  "items": [
    {
      "repo": "scaffold-eth/scaffold-eth-2",
      "prNumber": 423,
      "prTitle": "feat: add new component",
      "prUrl": "https://github.com/...",
      "type": "review_comment",
      "body": "Great catch! Let's add that type annotation...",
      "createdAt": "2024-06-15T10:30:00Z",
      "author": "carletex",
      "url": "https://github.com/...",
      "path": "packages/nextjs/app/page.tsx",
      "line": 42
    },
    ...
  ]
}
```

#### Output 2: Personality Markdown

**File:** `output/grumpy-carlos-personality.md`

Human-readable personality profile:
```markdown
# Grumpy Carlos Code Reviewer - Personality Profile

> Generated on January 20, 2025 at 12:00 PM

## Source Data

- **Reviewer:** carletex
- **Total Review Items:** 1247
- **PR Reviews:** 312
- **Code Comments:** 823
- **PR Comments:** 112
- **Repositories Analyzed:** 16

### Repository Breakdown

- **scaffold-eth/scaffold-eth-2:** 542 items
- **BuidlGuidl/SpeedRunEthereum-v2:** 234 items
...

---

## Core Philosophy
[LLM-generated content about coding beliefs]

## Communication Style
[LLM-generated content about how they communicate]

## Technical Standards
[LLM-generated content about what standards they enforce]

...
```

---

## Project Structure

```
grumpy-carlos-personality-fetcher/
├── src/
│   ├── cli.ts                 # Main entry point & orchestration
│   ├── config.ts              # Environment config loading (Zod)
│   ├── constants.ts           # Constants (reviewer, date ranges)
│   ├── types.ts               # TypeScript interfaces
│   │
│   ├── github/
│   │   ├── index.ts           # Module exports
│   │   ├── client.ts          # Octokit singleton & rate limiting
│   │   ├── parse-url.ts       # GitHub URL parsing
│   │   └── reviews.ts         # PR/Review/Comment fetching
│   │
│   ├── summarize/
│   │   ├── index.ts           # Module exports
│   │   ├── provider.ts        # OpenAI/Anthropic setup
│   │   ├── prompt.ts          # Prompt templates
│   │   └── summarize.ts       # Chunking & LLM orchestration
│   │
│   ├── report/
│   │   ├── index.ts           # Module exports
│   │   ├── json.ts            # Corpus JSON generation
│   │   └── markdown.ts        # Personality MD generation
│   │
│   └── utils/
│       ├── cache.ts           # File-based caching
│       └── progress.ts        # Spinner/logging utilities
│
├── .cache/                    # Cached GitHub API responses
├── output/                    # Generated reports
│   ├── grumpy-carlos-corpus.json
│   └── grumpy-carlos-personality.md
│
├── repos.json                 # Repository list to analyze
├── .env                       # Credentials (not committed)
├── env.example                # Example environment file
├── package.json
└── tsconfig.json
```

---

## Setup & Usage

### Prerequisites

- Node.js 18+
- pnpm (or npm/yarn)
- GitHub Personal Access Token
- OpenAI API key or Anthropic API key

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd grumpy-carlos-personality-fetcher

# Install dependencies
pnpm install

# Copy environment example
cp env.example .env
```

### Configuration

Edit `.env`:
```env
# Required
GITHUB_TOKEN=ghp_xxxx

# Required: At least one
OPENAI_API_KEY=sk-xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx

# Optional: Override defaults
LLM_PROVIDER=openai          # or "anthropic"
LLM_MODEL=gpt-4o-mini        # or any supported model
```

Edit `repos.json`:
```json
{
  "repos": [
    "owner/repo-1",
    "owner/repo-2",
    "https://github.com/owner/repo-3"
  ]
}
```

### Run

```bash
# Development mode
pnpm dev

# Or using generate script
pnpm generate
```

### Output

After running, check:
- `output/grumpy-carlos-corpus.json` - Raw review data
- `output/grumpy-carlos-personality.md` - Personality profile

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | - | GitHub Personal Access Token |
| `OPENAI_API_KEY` | Conditional | - | Required if using OpenAI |
| `ANTHROPIC_API_KEY` | Conditional | - | Required if using Anthropic |
| `LLM_PROVIDER` | No | `openai` | LLM provider: `openai` or `anthropic` |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model to use |

### Constants (`src/constants.ts`)

| Constant | Value | Description |
|----------|-------|-------------|
| `REVIEWER_LOGIN` | `carletex` | GitHub username to analyze |
| `CHUNK_SIZE` | `30` | Review items per LLM chunk |
| `RANGE_START` | `2025-01-01` | Default date range start |
| `RANGE_END` | `2025-12-31` | Default date range end |
| `EXTENDED_RANGE_START` | `2022-01-01` | Extended history start |

---

## Output Files

### Corpus JSON Schema

```typescript
interface ReviewCorpusReportJSON {
  generatedAt: string;           // ISO timestamp
  reviewer: string;              // GitHub username
  rangeLabel: string;            // Date range description
  stats: {
    totalItems: number;
    reviews: number;             // PR review count
    reviewComments: number;      // Inline code comments
    issueComments: number;       // General PR comments
    repos: number;               // Repository count
    byRepo: Record<string, number>;
  };
  items: ReviewCorpusItemJSON[]; // All review items
}
```

### Personality Profile Structure

The markdown profile contains these sections:
- **Core Philosophy** - Fundamental beliefs about code quality
- **Communication Style** - Tone and feedback delivery
- **Technical Standards** - Enforced coding standards
- **Review Patterns** - Common focus areas
- **Common Phrases** - Actual expressions used
- **What They Praise** - Positive triggers
- **What They Criticize** - Negative triggers
- **Areas of Expertise** - Technical domains
- **Review Process** - Systematic approach

---

## License

ISC
