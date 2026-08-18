# CLAUDE.md — standing orders for coding agents

You are working in `dtg-atelier`, Dozier Tech Group's foundry for launching
tokens and NFT collections. These orders are not suggestions.

## Read BLUEPRINT.md first

[`BLUEPRINT.md`](BLUEPRINT.md) pins the vision, the contract APIs, the
directory ownership, and the verified facts. Read it before writing anything.
Two of its rules matter most:

1. **The pinned contract APIs are law.** Constructors, function signatures,
   constants (`MAX_BATCH = 50`, `MAX_ROYALTY_BPS = 1000`), and custom errors
   are fixed. Tests and deploy scripts are written against them. Changing any
   of them is a design decision that requires a human and a BLUEPRINT.md
   update first — it is never a refactor you make in passing.
2. **The verified facts must never be invented or altered.** Azure tenant and
   subscription IDs, the Silicon Bayou contract address, chain IDs, repo
   pointers — they are in BLUEPRINT.md because they were verified. Do not
   guess new ones.

## Directory ownership

| Path | Owns |
|---|---|
| `contracts/` | The three contracts (`AtelierToken`, `AtelierDrop`, `AtelierEditions`) — Solidity 0.8.24, OpenZeppelin 5.2.0, no other contracts without a BLUEPRINT change |
| `test/contracts/` | Hardhat tests, one file per contract. Every behavior change ships with a test in the same PR |
| `scripts/` | Deploy scripts driven by `drop.config.json`; `scripts/README.md` documents the flow |
| `design/` | Art-direction charter, palette, trait schema, metadata standard, pipeline, `board.html` |
| `infra/azure/` | Bicep + docs for the DTG Azure estate |
| `research/firecrawl/` | Firecrawl research CLI; output goes to gitignored `research/output/` |
| `.github/` | CI (compile, lint, test only) and Dependabot |

## Commands

| Command | What it does |
|---|---|
| `npm run compile` | Hardhat compile (0.8.24, shanghai, optimizer 200 runs) |
| `npm test` | Full test suite (`test/contracts/`) |
| `npm run lint` | solhint over `contracts/**/*.sol` — zero findings is the bar |
| `npm run security` | lint + tests. Must pass before any PR |
| `npm run design:board` | Serves `design/` on port 4174 — open `http://localhost:4174/board.html` |
| `node research/firecrawl/crawl.mjs <url> [--crawl] [--limit N] [--tag name]` | Firecrawl scrape/crawl to `research/output/` (needs `FIRECRAWL_API_KEY` in `.env`) |

Deploy commands (`npm run deploy:*`) exist but are **not yours to run** — see
below.

## Hard rules

- **Never touch `.env`.** Never read it, never write it, never print its
  contents. Never write a secret — key, token, connection string — into any
  file, log, commit, or chat message. `.env.example` holds pointers only.
- **No proxies, no upgradeability, ever.** No `delegatecall`, no
  `selfdestruct`, no assembly. This is a product guarantee (see
  `SECURITY.md`), not a style preference. A PR introducing any of these is
  wrong by definition.
- **Deploys are human-run only.** Never execute a deploy script, never add a
  deploy job or a `secrets.*` reference to CI. CI stays at `contents: read`
  with zero secrets. Mainnet deploys additionally require the human to set
  `I_UNDERSTAND_MAINNET=1`.
- **Azure changes carry a paperwork duty.** Any change to Azure resources
  (Bicep, deploy script, new resources) must be reflected in
  [`Dozier-Tech-Group/DTG-Infra`](https://github.com/Dozier-Tech-Group/DTG-Infra)'s
  `docs/ARCHITECTURE-MAP.md` in the same PR. Also: DNS lives in Cloudflare,
  not Azure, and ACR Tasks (`az acr build`) is not permitted on this
  subscription.
- **Tests are not optional.** New revert, new event, new code path — new test,
  same PR. `npm run security` must pass before the work is done.
- **No new dependencies without written justification.** Every dependency is
  attack surface. OpenZeppelin is pinned at exactly `5.2.0` — do not bump it
  casually; the contracts and tests are written against it.
- **Match the voice.** Docs here are confident, concrete, short-sentenced.
  Tables for facts, prose for reasoning, blunt warnings. No filler, no hype,
  no "simply".

## Where answers live

| Question | Answer |
|---|---|
| What are the exact contract APIs? | `BLUEPRINT.md` |
| How do I deploy, and in what order? | `scripts/README.md` |
| What are the invariants and incident runbooks? | `SECURITY.md` |
| How does the design process work? | `design/README.md` |
| How does this repo use Azure? | `infra/azure/README.md` |
| How do I run market research? | `research/firecrawl/README.md` |
| What must pass before a PR? | `CONTRIBUTING.md` (`npm run security`) |
