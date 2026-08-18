#!/usr/bin/env node
// research/firecrawl/crawl.mjs — scrape one page (or crawl a site) through the
// Firecrawl v1 API and write the results to research/output/.
//
// Usage:
//   node research/firecrawl/crawl.mjs <url> [--crawl] [--limit N] [--tag name]
//   npm run research -- <url> [--crawl] [--limit N] [--tag name]
//
// Node 20+, ESM, zero new dependencies: global fetch, plus dotenv (already a
// devDependency) for .env loading. Mirrors the shape of the Python pipeline in
// grantdozier/DozierTechOperatorBot (discovery/firecrawl_client.py) and the
// Node precedent in grantdozier/consent-archaeology (api/src/routes/sweep.js).
//
// Output is research only. Never republish scraped content.

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.firecrawl.dev/v1";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 10 * 60 * 1_000; // give up on a crawl job after 10 minutes
const MAX_NEXT_PAGES = 50; // safety cap on paginated crawl results

// Outputs land in research/output/ regardless of the caller's cwd.
const OUTPUT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "output"
);

let apiKey = null;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    "Usage: node research/firecrawl/crawl.mjs <url> [--crawl] [--limit N] [--tag name]",
    "",
    "  <url>       Page to scrape (or site to crawl with --crawl).",
    "  --crawl     Crawl the site starting at <url> instead of scraping one page.",
    "  --limit N   Max pages for --crawl (default 10). Keep it small.",
    "  --tag name  Output folder name (default: the URL's hostname).",
    "",
    "Results: research/output/<tag-or-hostname>/<timestamp>.json and .md",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { url: null, crawl: false, limit: 10, tag: null };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--crawl") {
      args.crawl = true;
      i += 1;
    } else if (arg === "--limit") {
      const raw = argv[i + 1];
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) {
        fail(`--limit needs a positive integer, got "${raw ?? ""}".\n\n${usage()}`);
      }
      args.limit = n;
      i += 2;
    } else if (arg === "--tag") {
      const raw = argv[i + 1];
      if (!raw || raw.startsWith("--")) {
        fail(`--tag needs a name.\n\n${usage()}`);
      }
      args.tag = raw;
      i += 2;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith("--")) {
      fail(`Unknown flag "${arg}".\n\n${usage()}`);
    } else if (!args.url) {
      args.url = arg;
      i += 1;
    } else {
      fail(`Unexpected argument "${arg}".\n\n${usage()}`);
    }
  }
  if (!args.url) fail(usage());

  let parsed;
  try {
    parsed = new URL(args.url);
  } catch {
    fail(`"${args.url}" is not a valid URL. Include the scheme, e.g. https://example.com`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`Only http(s) URLs are supported, got "${parsed.protocol}//".`);
  }
  args.hostname = parsed.hostname;
  return args;
}

function requireApiKey() {
  apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    fail(
      [
        "FIRECRAWL_API_KEY is not set.",
        "",
        "Local:     copy .env.example to .env and set FIRECRAWL_API_KEY.",
        "Canonical: the key lives in Azure Key Vault — see infra/azure/README.md",
        "           (repos hold pointers, never values).",
        "",
        "Never commit .env. Never paste a key into chat.",
      ].join("\n")
    );
  }
}

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || "untagged";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One place for HTTP: auth header, JSON parsing, readable non-200 errors.
async function api(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (err) {
    fail(`Network error calling ${url}: ${err.message}`);
  }

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // non-JSON body; keep the raw text for the error message
  }

  if (!res.ok) {
    const hints = {
      401: "The API key was rejected. Check FIRECRAWL_API_KEY in .env against Key Vault.",
      402: "Firecrawl credits are exhausted. Top up the account before retrying.",
      429: "Rate-limited. Wait a minute, lower --limit, and try again.",
    };
    const detail =
      (body && (body.error || body.message)) || text.slice(0, 500) || "(empty response body)";
    const hint = hints[res.status] ? `\n${hints[res.status]}` : "";
    fail(`Firecrawl returned ${res.status} ${res.statusText} for ${url}\n${detail}${hint}`);
  }

  return body ?? {};
}

// POST /v1/scrape — one page, markdown + links.
async function scrapePage(url) {
  const result = await api("/scrape", {
    method: "POST",
    body: JSON.stringify({ url, formats: ["markdown", "links"] }),
  });
  if (!result.success || !result.data) {
    fail(`Firecrawl scrape did not return data for ${url}: ${JSON.stringify(result).slice(0, 500)}`);
  }
  return [result.data];
}

// POST /v1/crawl — starts a job, then polls the returned job URL until it
// completes, fails, or the MAX_POLL_MS deadline passes.
async function crawlSite(url, limit) {
  const started = await api("/crawl", {
    method: "POST",
    body: JSON.stringify({
      url,
      limit,
      scrapeOptions: { formats: ["markdown", "links"] },
    }),
  });

  const jobUrl = started.url || (started.id ? `${API_BASE}/crawl/${started.id}` : null);
  if (!started.success || !jobUrl) {
    fail(`Firecrawl accepted the crawl but returned no job URL: ${JSON.stringify(started).slice(0, 500)}`);
  }

  console.log(`Crawl job started: ${jobUrl}`);
  const deadline = Date.now() + MAX_POLL_MS;
  let status;

  for (;;) {
    if (Date.now() > deadline) {
      fail(
        `Crawl job did not finish within ${MAX_POLL_MS / 60_000} minutes.\n` +
          `It may still be running server-side. Check it later:\n  ${jobUrl}`
      );
    }
    await sleep(POLL_INTERVAL_MS);
    status = await api(jobUrl);
    if (status.status === "completed") break;
    if (status.status === "failed") {
      fail(`Crawl job failed: ${status.error || "no error detail from Firecrawl"}`);
    }
    console.log(`  ...${status.status || "working"} (${status.completed ?? "?"}/${status.total ?? "?"} pages)`);
  }

  // Completed jobs can paginate results via a `next` URL.
  let pages = Array.isArray(status.data) ? status.data : [];
  let next = status.next;
  let hops = 0;
  while (next && hops < MAX_NEXT_PAGES) {
    const more = await api(next);
    pages = pages.concat(Array.isArray(more.data) ? more.data : []);
    next = more.next;
    hops += 1;
  }

  if (pages.length === 0) {
    fail(`Crawl completed but returned zero pages for ${url}. Check the site allows crawling.`);
  }
  return pages;
}

function renderMarkdown(pages, sourceUrl, mode) {
  const parts = [
    `<!-- Scraped by dtg-atelier research/firecrawl/crawl.mjs (${mode}) from ${sourceUrl}`,
    `     on ${new Date().toISOString()}. Research input only — never republish. -->`,
    "",
  ];
  for (const page of pages) {
    const pageUrl = page?.metadata?.sourceURL || page?.metadata?.url || sourceUrl;
    parts.push(`\n---\n\n# ${pageUrl}\n`);
    parts.push(page?.markdown || "_(no markdown returned for this page)_");
  }
  return parts.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireApiKey();

  if (!args.crawl && args.limit !== 10) {
    console.log("Note: --limit only applies with --crawl; ignoring it for a single scrape.");
  }

  const mode = args.crawl ? "crawl" : "scrape";
  console.log(`${mode === "crawl" ? "Crawling" : "Scraping"} ${args.url} ...`);

  const pages = args.crawl
    ? await crawlSite(args.url, args.limit)
    : await scrapePage(args.url);

  const slug = slugify(args.tag || args.hostname);
  const dir = path.join(OUTPUT_ROOT, slug);
  await mkdir(dir, { recursive: true });

  const stamp = timestamp();
  const jsonPath = path.join(dir, `${stamp}.json`);
  const mdPath = path.join(dir, `${stamp}.md`);

  const payload = {
    tool: "research/firecrawl/crawl.mjs",
    mode,
    url: args.url,
    tag: slug,
    fetchedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages,
  };

  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await writeFile(mdPath, renderMarkdown(pages, args.url, mode), "utf8");

  console.log(`Done. ${pages.length} page${pages.length === 1 ? "" : "s"} captured.`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log("Reminder: research/output/ is gitignored. Keep it that way.");
}

main().catch((err) => fail(`Unexpected error: ${err.message}`));
