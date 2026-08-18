# BLUEPRINT — the dtg-atelier charter

**Read this before writing anything in this repo.** It pins the vision, the contract
APIs, the directory ownership, and the facts that must never be invented.

## What this repo is

`dtg-atelier` is Dozier Tech Group's foundry for launching **any token or NFT
collection** — the scaffolding that turned Silicon Bayou (198 gators on Robinhood
Chain) into a live, sold-out, frozen collection, generalized so the next drop takes
days, not months.

Three promises, in order:

1. **Extremely safe.** No secrets in the repo, ever. No upgradeable proxies. No
   hidden mint paths. Ownable2Step everywhere. Pausable everything. Metadata
   freezable. Royalties hard-capped. If a safety property can be a compiled
   constant instead of a config value, it is.
2. **A work of art.** The docs read like they were written by someone who cares.
   The `design/` section treats artwork as a first-class engineering artifact —
   palettes, traits, and metadata are specified before a single pixel is minted.
3. **Reusable.** One `drop.config.json` describes a drop; the scripts do the rest.

## Pinned contract APIs (do not deviate — tests and scripts are written against these)

All contracts: Solidity **0.8.24**, evmVersion **shanghai**, OpenZeppelin **5.2.0**,
`Ownable2Step`, `Pausable`. No proxies, no upgradeability, no `selfdestruct`, no
`delegatecall`, no assembly. `renounceOwnership()` is disabled everywhere — it
always reverts with `RenounceDisabled()`, so ownership can only move via the
two-step handoff and a paused contract can never be orphaned.

### `contracts/token/AtelierToken.sol` — ERC-20

- `constructor(string name_, string symbol_, uint8 decimals_, uint256 maxSupply_, address owner_)`
  — `maxSupply_` must be > 0 (hard cap, immutable). `owner_` becomes Ownable owner.
- `decimals()` returns the constructor value (stored immutable).
- `mint(address to, uint256 amount)` — `onlyOwner`, reverts if `totalSupply() + amount > maxSupply`.
- `pause()` / `unpause()` — `onlyOwner`; transfers and mints blocked while paused
  (via `ERC20Pausable`).
- Includes `ERC20Permit` (gasless approvals).
- Custom errors: `MaxSupplyExceeded()`, `ZeroMaxSupply()`, `RenounceDisabled()`.

### `contracts/nft/AtelierDrop.sol` — ERC-721 collection

- `constructor(string name_, string symbol_, string baseURI_, uint256 maxSupply_, uint96 royaltyBps_, address royaltyReceiver_, address owner_)`
  — `maxSupply_` > 0, immutable. Royalty capped by `MAX_ROYALTY_BPS`.
- `uint256 public constant MAX_BATCH = 50;`
- `uint96 public constant MAX_ROYALTY_BPS = 1000;` (10%)
- `mintBatch(address to, uint256 count)` — `onlyOwner`, sequential token IDs
  starting at 1, reverts over `maxSupply` or `MAX_BATCH`.
- `totalMinted()` view.
- `setBaseURI(string)` — `onlyOwner`, reverts after freeze.
- `freezeURI()` — `onlyOwner`, permanent, emits `URIFrozen()`.
- `setDefaultRoyalty(address, uint96)` — `onlyOwner`, capped at `MAX_ROYALTY_BPS` (ERC-2981).
- `pause()` / `unpause()` — `onlyOwner`; blocks mint and transfer (override `_update`).
- `tokenURI(id)` → `{baseURI}{id}.json`.
- Custom errors: `MaxSupplyExceeded()`, `BatchTooLarge()`, `URIIsFrozen()`,
  `RoyaltyTooHigh()`, `ZeroMaxSupply()`, `RenounceDisabled()`.

### `contracts/nft/AtelierEditions.sol` — ERC-1155 editions

- `constructor(string uri_, uint96 royaltyBps_, address royaltyReceiver_, address owner_)`
- `createEdition(uint256 id, uint256 maxSupply)` — `onlyOwner`, `maxSupply` > 0,
  reverts if the edition already exists.
- `mint(address to, uint256 id, uint256 amount)` — `onlyOwner`, reverts if the
  edition doesn't exist or the per-id cap would be exceeded (uses `ERC1155Supply`).
- `editionMaxSupply(uint256 id)` view (0 = not created).
- `setURI(string)` — `onlyOwner`, reverts after freeze; `freezeURI()` permanent,
  emits `URIFrozen()`.
- `setDefaultRoyalty(address, uint96)` — capped at `MAX_ROYALTY_BPS = 1000`.
- `pause()` / `unpause()` — blocks mint and transfer (override `_update`).
- Custom errors: `EditionExists()`, `EditionUnknown()`, `MaxSupplyExceeded()`,
  `URIIsFrozen()`, `RoyaltyTooHigh()`, `ZeroMaxSupply()`, `RenounceDisabled()`.

## Directory ownership

| Path | Purpose |
|---|---|
| `contracts/` | The three contracts above + `.solhint.json` at root |
| `test/contracts/` | Hardhat tests, one file per contract, exhaustive |
| `scripts/` | `deploy-token.js`, `deploy-drop.js`, `deploy-editions.js`, driven by `drop.config.json` (example: `drop.config.example.json`) |
| `design/` | The DESIGN section: art direction, palette, trait schema, metadata standard, generative pipeline, preview board |
| `infra/azure/` | Bicep + docs tying this repo to the DTG Azure estate |
| `research/firecrawl/` | Firecrawl-powered market research pipeline |
| `.github/workflows/` | CI: compile, test, lint, audit — key-gated deploys never run in CI |

## Facts that must never be invented (verified 2026-08-18)

**DTG Azure** — canonical repo: [`Dozier-Tech-Group/DTG-Infra`](https://github.com/Dozier-Tech-Group/DTG-Infra)

- Tenant: `doziertechgroup.com` (`a0844ee1-d6d6-47c5-8fa8-69302b3ddd27`)
- Subscription: **DTG Platform** (`ea96e212-9b00-4e93-9d3b-9018638cee20`)
- Default region: `centralus` — one Azure estate, no legacy tenants
- Container registry: `acrdtghozwav7eopryc.azurecr.io` (resource group `rg-dtg-shared`)
- Rules from DTG-Infra: secrets live in **Key Vault**, never in repos (repos hold
  *pointers*, never values). DNS lives in **Cloudflare**, not Azure. ACR Tasks
  (`az acr build`) is **not permitted** on this subscription — builds run locally or
  via GitHub Actions with scoped OIDC. Any Azure resource change must be reflected
  in DTG-Infra's `docs/ARCHITECTURE-MAP.md` in the same PR.

**Firecrawl** — existing capabilities in this GitHub account:

- [`grantdozier/DozierTechOperatorBot`](https://github.com/grantdozier/DozierTechOperatorBot) —
  `discovery/firecrawl_client.py`, `services/discovery_service.py`,
  `discovery/ingestion_runner.py`, `discovery/source_registry.py` (Python discovery/ingestion pipeline)
- [`grantdozier/consent-archaeology`](https://github.com/grantdozier/consent-archaeology) —
  `api/src/lib/config.js`, `api/src/routes/sweep.js` (Firecrawl in a Node API)

**Lineage** — [`Dozier-Tech-Group/silicon-bayou`](https://github.com/Dozier-Tech-Group/silicon-bayou):
198 BAYOU gators, Robinhood Chain (4663), contract
`0xA81aEd6f3a5Faea95197786ba162e706Fd938d20`, metadata frozen. This repo
generalizes that playbook; it does not modify that collection.

## Toolchain (mirrors silicon-bayou — proven in production)

Node.js 20+, Hardhat `^2.26.3`, `@nomicfoundation/hardhat-ethers` `^3.1.0`,
ethers `^6.15.0`, chai `^4.5.0`, solhint `^5.2.0`, OpenZeppelin `5.2.0`,
Solidity 0.8.24 / shanghai, optimizer 200 runs.

## Voice

Docs are confident, concrete, and short-sentenced. Tables for facts, prose for
reasoning. Warnings are blunt ("Never commit `.env`. Never paste a key into
chat."). No filler, no hype, no "simply".
