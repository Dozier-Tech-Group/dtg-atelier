# Firecrawl research

Market research for drops, on demand. This lane scrapes marketplace collection
pages, chain docs, and competitor mints into local JSON and markdown, so design
and pricing decisions rest on what the market actually shows — not on memory.

One script, zero new dependencies. `crawl.mjs` calls the Firecrawl v1 API with
Node 20's global `fetch` and writes everything to `research/output/`. Nothing it
produces is committed.

## Prior art — this account already runs Firecrawl in production

This lane is not a first attempt. It mirrors two working integrations:

| Repo | Files | What it proves |
|---|---|---|
| [`grantdozier/DozierTechOperatorBot`](https://github.com/grantdozier/DozierTechOperatorBot) | `discovery/firecrawl_client.py`, `services/discovery_service.py`, `discovery/ingestion_runner.py`, `discovery/source_registry.py` | The Python discovery/ingestion pipeline. This lane is that pipeline's shape — client, source registry, ingestion run — ported to Node. |
| [`grantdozier/consent-archaeology`](https://github.com/grantdozier/consent-archaeology) | `api/src/lib/config.js`, `api/src/routes/sweep.js` | Firecrawl driven from Node. The integration precedent for `crawl.mjs`. |

When in doubt about API behavior, read those files before guessing.

## Usage

```
node research/firecrawl/crawl.mjs <url> [--crawl] [--limit N] [--tag name]
```

Or via the package script (note the `--` before arguments):

```
npm run research -- https://opensea.io/collection/silicon-bayou --tag opensea-silicon-bayou
```

| Flag | Meaning |
|---|---|
| `<url>` | The page to scrape. Required. |
| `--crawl` | Crawl the whole site starting at `<url>` instead of scraping one page. Polls the Firecrawl job until it finishes (10-minute cap). |
| `--limit N` | Max pages for `--crawl`. Default 10. Keep it small. |
| `--tag name` | Output folder name. Default: the URL's hostname. |

Each run writes two files:

```
research/output/<tag-or-hostname>/<timestamp>.json   # full API payload: markdown, links, metadata
research/output/<tag-or-hostname>/<timestamp>.md     # the scraped markdown, readable
```

## API key

`crawl.mjs` reads `FIRECRAWL_API_KEY` from the environment.

- **Locally:** copy `.env.example` to `.env` and set the key there.
- **Canonically:** the key lives in Azure Key Vault. Repos hold pointers, never
  values. See [`infra/azure/README.md`](../../infra/azure/README.md).

Never commit `.env`. Never paste a key into chat. If the key is missing, the
script tells you where to get it and exits — it does not stack-trace.

## Output stays local

`research/output/` is gitignored. Scraped data never enters the repo, never
enters a commit, never leaves this machine. If a decision depends on scraped
data, write the *decision* into `design/` or a doc — not the scrape.

## Starting sources

[`sources.example.json`](./sources.example.json) is the curated starting list:
the Silicon Bayou collection on OpenSea, its contract on Robinhood Chain's
Blockscout, the Robinhood chain docs, and two market-analytics sites. Copy it,
edit it, and feed each entry to `crawl.mjs` with its tag.

## Legal — read this before scraping anything

- Respect `robots.txt` and each site's terms of service. If a site says no, the
  answer is no.
- This is research input only. **Never republish scraped content** — not in this
  repo, not in metadata, not in marketing copy, not anywhere.
- Marketplaces rate-limit and block aggressive crawlers. Use `--limit` small,
  crawl rarely, and don't hammer the same site in a loop.
