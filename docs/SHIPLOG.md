# SHIPLOG — ship and verification record

Every ship gets an entry: what went out, the evidence it works, and what it
cost. Claims here are verified, not remembered — each one names its check.

---

## Ship 001 — 2026-08-18 · commit `46b9bb9` · repo founded

The full foundry, first push: three pinned contracts, 121 tests, key-gated
deploy scripts, the DESIGN section, Azure estate wiring, Firecrawl research
lane, CI. Built by a 14-agent parallel workflow (7 build lanes → docs
synthesis → verify gate → 3 adversarial reviewers → hardening), then
re-verified after push by a 3-agent sweep against the *live GitHub state*.

### Verification evidence

| Check | Result |
|---|---|
| Local gate | `npm run compile` clean · **121 tests passing, 0 failing** · solhint **0 errors, 0 warnings** |
| GitHub CI | `atelier-ci` run [32158844270](https://github.com/Dozier-Tech-Group/dtg-atelier/actions/runs/32158844270) — **success** in 31s on the founding push |
| Fresh-clone proof | Clean `git clone` from GitHub → `npm ci` (348 packages) → 45 Solidity files compiled → **121 passing** → lint clean. The pushed state works from scratch, not just this machine. |
| History hygiene | `git log --all -- .env` empty — no `.env` was ever committed. 38 tracked files, working tree clean. |
| Docs truth | All 26 relative links in README resolve. Every `npm run` command documented anywhere maps to a real script and file. Lineage facts (contract `0xA81a…8d20`, chain 4663, 198 supply) match silicon-bayou exactly. `design/board.html` makes zero external requests. |
| Deploy rails | All three `scripts/deploy-*.js` guard mainnet chain IDs `[4663, 8453]` behind `I_UNDERSTAND_MAINNET=1` and never read or log `PRIVATE_KEY`. Verified by reading the code, not the docs. |

### Hardening applied before push (adversarial review, 4 findings, all fixed)

1–3. **`renounceOwnership()` was reachable** in all three contracts —
OpenZeppelin's `Ownable2Step` still inherits one-step renounce, so a single
owner call could orphan a paused contract forever. Now disabled everywhere:
`renounceOwnership()` reverts with `RenounceDisabled()`. Ownership moves only
through the two-step handoff. Six tests added (121 total).

4\. **`drop.config.json` was not gitignored** — the documented flow ("your real
drop parameters stay local") didn't match reality. Now ignored; only
`drop.config.example.json` is tracked.

### Dependency watch — day-one Dependabot verdicts

Dependabot opened 7 PRs within minutes of founding. CI judged them:

| PR | Bump | CI |
|---|---|---|
| #7 | hardhat 2.29.1 → 3.13.0 | **failed** |
| #6 | hardhat-chai-matchers 2.1.2 → 3.0.0 | **failed** |
| #5 | @openzeppelin/contracts 5.2.0 → 5.6.1 | **failed** |
| #3 | hardhat-ethers 3.1.3 → 4.0.15 | **failed** |
| #4 | solhint 5.2.0 → 6.2.4 | passed |
| #2 | actions/setup-node 4 → 7 | passed |
| #1 | actions/checkout 4 → 7 | passed |

The four failures are exactly the majors that would break the toolchain pinned
in [`BLUEPRINT.md`](../BLUEPRINT.md) — the pin is doing its job. Policy set in
this ship: **Dependabot no longer proposes npm majors** (minors and patches
still flow; GitHub Actions majors still flow). Upgrading the toolchain is a
decision made in the BLUEPRINT, not a bump merged from a queue.

Recommended handling of the open PRs: merge #1 and #2 (CI-green, CI-only
surface), #4 optional, close #3/#5/#6/#7 until a deliberate toolchain upgrade.

### Gas & ETH — what deploying actually costs

**Nothing in this repo needs ETH today.** Compiling, testing, CI, the design
board, and the research CLI are all free. Azure bills dollars, not ETH;
Firecrawl needs an API key, not ETH. ETH enters only when a contract ships:

| Network | Cost reality |
|---|---|
| Robinhood testnet (46630) | Free — faucet ETH. Always the first stop. |
| Robinhood mainnet (4663) | Gas in native ETH, and it is cheap: silicon-bayou's **entire launch** — ERC-721 deploy, 198 tokens minted in 6 batches, `freezeURI`, royalty set — burned **~0.0027 ETH**. Budget **0.005 ETH bridged** per full drop (relay.link route is the proven path) and expect change. |
| Sepolia / Base Sepolia | Free — faucet ETH. |
| Base mainnet (8453) | Same order of magnitude as Robinhood Chain — an L2 deploy is typically well under 0.002 ETH. |

A single contract deploy alone runs roughly 0.001–0.002 ETH on either mainnet.
Wallet state at ship time (public on-chain facts, addresses already published
in silicon-bayou's DEPLOYMENT.md): operator `0x2948…D11d` held **~0.0021 ETH**
on chain 4663 — enough for about one contract deploy, tight for a full drop.
Silicon-bayou's own runbook lists **~0.0023 ETH sweepable** from its throwaway
deployer `0xBA98…aa71`; that sweep alone funds the next deploy.

### Known limits, stated plainly

- The repo is **private**. Flip when ready:
  `gh repo edit Dozier-Tech-Group/dtg-atelier --visibility public`
- Secret-scanning and Dependabot-*alert* settings could not be read via the API
  with the current token (`security_and_analysis` returned null) — confirm both
  are enabled in Settings → Code security. Dependabot *version updates* are
  demonstrably active.
- `infra/azure/main.bicep` is written and reviewed but has not been deployed —
  no Azure resources exist for this repo yet. When one is created, DTG-Infra's
  `docs/ARCHITECTURE-MAP.md` must be updated in the same PR.
