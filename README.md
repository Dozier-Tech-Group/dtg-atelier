# dtg-atelier

> **The Dozier Tech Group foundry for launching any token or NFT collection —
> safe by construction, designed before minted.**

One `drop.config.json` describes a drop. Three contracts with the safety
properties compiled in, exhaustive tests, deploy scripts with hard rails, and a
design charter that treats artwork as an engineering artifact. This is the
scaffolding that shipped [Silicon Bayou](https://github.com/Dozier-Tech-Group/silicon-bayou)
— 198 gators, sold out, metadata frozen — generalized so the next drop takes
days, not months.

**Never commit `.env`. Never paste a key into chat. Mainnet deploys require
`I_UNDERSTAND_MAINNET=1`.**

---

## What lives where

| Path | What it is |
|---|---|
| [`BLUEPRINT.md`](BLUEPRINT.md) | The charter. Pinned contract APIs, directory ownership, verified facts, voice. Read it before anything else. |
| [`contracts/`](contracts/) | The three contracts: [`AtelierToken.sol`](contracts/token/AtelierToken.sol) (ERC-20), [`AtelierDrop.sol`](contracts/nft/AtelierDrop.sol) (ERC-721), [`AtelierEditions.sol`](contracts/nft/AtelierEditions.sol) (ERC-1155). |
| [`test/contracts/`](test/contracts/) | Hardhat test suites — one per contract, exhaustive. Every revert, every event, every boundary. |
| [`scripts/`](scripts/) | Deploy scripts driven by `drop.config.json`. [`scripts/README.md`](scripts/README.md) is the testnet-first deploy flow. |
| [`design/`](design/) | The DESIGN section: art-direction charter, palette rules, trait schema, metadata standard, generative pipeline, preview board. |
| [`infra/azure/`](infra/azure/) | Bicep + docs tying this repo to the DTG Azure estate (Key Vault, Storage, GitHub OIDC). |
| [`research/firecrawl/`](research/firecrawl/) | Firecrawl-powered market research CLI. Output stays local and gitignored. |
| [`.github/`](.github/) | CI — compile, lint, test. No deploy jobs, no secrets, `contents: read`. Dependabot weekly. |
| [`drop.config.example.json`](drop.config.example.json) | Copy to `drop.config.json` (gitignored) and describe your drop. The scripts do the rest. |
| [`.env.example`](.env.example) | Copy to `.env` (gitignored). Pointers and local-only values — the repo never holds secrets. |
| [`hardhat.config.js`](hardhat.config.js) | Solidity 0.8.24 / shanghai, optimizer 200 runs. Networks: Robinhood Chain (4663 / 46630), Sepolia, Base, Base Sepolia. Blockscout verification wired in. |
| [`.solhint.json`](.solhint.json) | Lint rules: compiler pinned, custom errors required, zero findings tolerated. |
| [`SECURITY.md`](SECURITY.md) | Threat model, compiled-invariants table, pause / ownership-handoff / incident runbooks. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contributor rules. `npm run security` passes before any PR, or the PR is not ready. |
| [`CLAUDE.md`](CLAUDE.md) | Standing orders for coding agents working in this repo. |
| [`LICENSE`](LICENSE) | MIT — code only. Artwork is separate; see [License](#license) below. |

## Quickstart

```bash
git clone https://github.com/Dozier-Tech-Group/dtg-atelier.git
cd dtg-atelier
cp .env.example .env          # PowerShell: Copy-Item .env.example .env
npm install
npm run compile
npm test
npm run security              # solhint + full test suite — the pre-PR gate
```

You do not need a key to compile or test — contributors leave `PRIVATE_KEY`
blank. Deploying is a different activity: read
[`scripts/README.md`](scripts/README.md) start to finish first, and deploy to a
testnet before you even think about mainnet.

## Three contracts

All three: Solidity **0.8.24**, OpenZeppelin **5.2.0**, custom errors
throughout, `Ownable2Step`, pausable, **no proxies**. The exact APIs are pinned
in [`BLUEPRINT.md`](BLUEPRINT.md); the tests are written against them.

### [`AtelierToken`](contracts/token/AtelierToken.sol) — ERC-20

A capped, pausable token. `maxSupply` is set at construction, stored immutable,
and can never rise — `mint` is `onlyOwner` and reverts with
`MaxSupplyExceeded()` at the cap. `decimals()` is a constructor choice, also
immutable. `ERC20Permit` gives gasless approvals. `pause()` stops mints and
transfers cold.

### [`AtelierDrop`](contracts/nft/AtelierDrop.sol) — ERC-721 collection

Sequential token IDs from 1, immutable `maxSupply`, batches bounded by
`MAX_BATCH = 50`. `tokenURI(id)` is `{baseURI}{id}.json`; `setBaseURI` works
until `freezeURI()` — which is permanent, one-way, and emits `URIFrozen()`.
ERC-2981 royalties are hard-capped at `MAX_ROYALTY_BPS = 1000` (10%) — a
compiled constant the owner cannot exceed.

### [`AtelierEditions`](contracts/nft/AtelierEditions.sol) — ERC-1155 editions

`createEdition(id, maxSupply)` pins a permanent per-id cap before anything can
mint. `mint` checks live totals via `ERC1155Supply` — `EditionUnknown()` for
ids that don't exist, `MaxSupplyExceeded()` at the cap. Same freezable URI,
same capped royalties, same pause switch.

## Safety by construction

If a safety property can be a compiled constant instead of a config value, it
is. The full threat model and runbooks live in [`SECURITY.md`](SECURITY.md).

- **No proxies, no upgradeability.** No `delegatecall`, no `selfdestruct`, no
  assembly. What you deploy is what runs forever.
- **Ownable2Step everywhere.** Ownership transfers require the new owner to
  accept. You cannot fat-finger a contract to a dead address, and the
  production owner should be a Safe multisig.
- **Pausable everything.** One `onlyOwner` call stops mints and transfers on
  any of the three contracts. The incident runbook starts with it.
- **Freezable metadata.** `freezeURI()` is permanent. After freeze, no code
  path can change what holders bought.
- **Royalties capped at 10%** by a compiled constant. `RoyaltyTooHigh()` on any
  attempt to exceed it.
- **Immutable supply caps.** Set at construction, enforced on every mint, zero
  caps rejected at deploy (`ZeroMaxSupply()`).
- **Mainnet rail.** Deploy scripts refuse mainnet chain IDs unless
  `I_UNDERSTAND_MAINNET=1` is set in the environment. Testnet first, always.
- **No secrets, ever.** Keys live in Azure Key Vault; the repo holds pointers.
  CI has zero secrets and `contents: read` — deploys are a human at a keyboard,
  never a workflow.

## Design before mint

Artwork here is specified, reviewed, and frozen like a contract — because
on-chain it is one. The [`design/`](design/) directory is the specification:
six stages in strict order (concept → palette → traits → renders → metadata →
freeze), each producing a committed artifact before the next begins.

- [`design/README.md`](design/README.md) — the charter and the Design
  Definition of Done
- [`design/palette.md`](design/palette.md) — closed palettes with WCAG
  contrast checks, worked Bayou example included
- [`design/traits.schema.json`](design/traits.schema.json) — every trait
  manifest validates against this, weights sum to exactly 100 per layer
- [`design/metadata-standard.md`](design/metadata-standard.md) — the exact
  OpenSea-compatible JSON, matched to the contract's `{baseURI}{id}.json`
- [`design/pipeline.md`](design/pipeline.md) — seeded, deterministic,
  byte-reproducible generation

See it, don't just read it: `npm run design:board`, then open
<http://localhost:4174/board.html> — a self-contained art-direction board with
live palette contrast, the trait stack, and a seeded sample-token preview. No
external requests, no build step.

## Azure estate

This repo plugs into the DTG Azure estate — tenant `doziertechgroup.com`,
subscription **DTG Platform**, region `centralus`. Key Vault holds the keys,
Storage is one option for frozen metadata, GitHub Actions federates via OIDC
with no long-lived secrets. [`infra/azure/README.md`](infra/azure/README.md)
has the facts, the Bicep, and the deploy script (what-if by default).

The canonical infra repo is
[`Dozier-Tech-Group/DTG-Infra`](https://github.com/Dozier-Tech-Group/DTG-Infra).
Its rules apply here verbatim — including: any Azure resource change must be
reflected in DTG-Infra's `docs/ARCHITECTURE-MAP.md` in the same PR.

## Market research

[`research/firecrawl/`](research/firecrawl/) is a zero-dependency Node CLI for
scraping marketplaces, explorers, and analytics pages into local JSON +
Markdown. Read [`research/firecrawl/README.md`](research/firecrawl/README.md)
for usage, key sourcing, and the legal rules (robots.txt, site terms, research
only — never republish scraped content).

It builds on proven prior art in this account:
[`grantdozier/DozierTechOperatorBot`](https://github.com/grantdozier/DozierTechOperatorBot)
(Python discovery/ingestion pipeline) and
[`grantdozier/consent-archaeology`](https://github.com/grantdozier/consent-archaeology)
(Firecrawl in a Node API).

## Lineage

[`Dozier-Tech-Group/silicon-bayou`](https://github.com/Dozier-Tech-Group/silicon-bayou):
**198 BAYOU gators** on Robinhood Chain (chain id **4663**), contract
[`0xA81aEd6f3a5Faea95197786ba162e706Fd938d20`](https://robinhoodchain.blockscout.com/address/0xA81aEd6f3a5Faea95197786ba162e706Fd938d20),
metadata frozen. Supply pinned before a single gator was rendered; frozen only
after every URI resolved. That playbook worked. This repo generalizes it — and
does not modify that collection.

## License

Code is [MIT](LICENSE). Artwork, palettes, and collection designs are
copyright Dozier Tech Group — the MIT grant does not cover them. Each drop
states its own artwork license line in the collection description before
freeze.
