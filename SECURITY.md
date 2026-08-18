# SECURITY — threat model and runbooks

This repo deploys contracts that hold other people's assets and reputations.
Read this before you touch a key, a network flag, or a workflow file.

## The threat model in one table

| Threat | Mitigation |
|---|---|
| Deployer key leaks via repo or CI | Keys never exist in the repo or in CI. Key Vault only. |
| Compromised owner mints or rugs | Fixed supply caps compiled into the bytecode. Owner cannot exceed them. |
| Malicious upgrade swaps the contract | No proxies. No upgrade path exists. What you deploy is what runs forever. |
| Royalty griefing | `MAX_ROYALTY_BPS = 1000` (10%) is a compiled constant. The owner cannot set more. |
| Metadata rug after sellout | `freezeURI()` is permanent. After freeze, no code path can change the URI. |
| CI as an attack vector | CI has `contents: read` and zero secrets. A compromised workflow can read public code and nothing else. |
| Live incident (exploit, key compromise) | `pause()` stops all mints and transfers. Runbook below. |

## Key management

**Rules. Not suggestions.**

- Deployer private keys live in **Azure Key Vault** in the DTG Platform
  subscription (`ea96e212-9b00-4e93-9d3b-9018638cee20`). See `infra/azure/README.md`.
  The repo holds pointers (vault name, secret name), never values.
- Keys are pulled to a local `.env` only at the moment of deployment, on a
  machine you control. `.env` is gitignored. Never commit it. Never paste a key
  into chat, a ticket, or a screenshot.
- CI has **no secrets configured**. There is nothing to steal from a workflow
  run, and no workflow references `secrets.*`. Keep it that way — a PR that adds
  a secret reference to CI is a security incident, not a code review comment.
- The deployer key is a launch tool, not a permanent owner. **Production owner
  should be a Safe multisig.** Every contract is `Ownable2Step`: deploy with the
  hot key, transfer ownership to the Safe, have the Safe accept. Runbook below.
- Rotate the deployer key after every mainnet launch. It signed public
  transactions; treat it as burned.

## Contract invariants

These are compiled constants and immutables, not config. No transaction, from
anyone, can change them after deployment.

| Invariant | Where |
|---|---|
| Supply cap is fixed at construction and can never rise | `maxSupply` immutable in all three contracts; mint reverts with `MaxSupplyExceeded()` |
| Zero cap is rejected at deploy | `ZeroMaxSupply()` in every constructor |
| Royalties can never exceed 10% | `MAX_ROYALTY_BPS = 1000` constant; `RoyaltyTooHigh()` on any attempt |
| URI freeze is permanent | `freezeURI()` sets a one-way flag; `setBaseURI`/`setURI` revert with `URIIsFrozen()` forever after |
| Batch mints are bounded | `MAX_BATCH = 50` constant in `AtelierDrop` |
| No upgrade path | No proxies, no `delegatecall`, no `selfdestruct`, no assembly — enforced by review and solhint |
| Ownership cannot be fat-fingered away | `Ownable2Step`: the new owner must call `acceptOwnership()` or the transfer never happens |

If a change to any row in this table appears in a PR, that PR is a redesign of
the product, not a refactor. See `BLUEPRINT.md`.

## Operational runbooks

### Pause

**When:** suspected key compromise, an exploit in the wild, marketplace-visible
anomaly (mints or transfers you did not initiate), or a critical bug report you
cannot immediately disprove. When in doubt, pause. Pausing is reversible;
stolen tokens are not.

**Who:** the contract owner — the Safe in production, the deployer key before
handoff. Nobody else can.

**Command** (owner key in local `.env`, correct network flag):

```
npx hardhat console --network robinhood
> const c = await ethers.getContractAt("AtelierDrop", "<CONTRACT_ADDRESS>");
> await c.pause();
> await c.paused();   // must print: true
```

Same shape for `AtelierToken` and `AtelierEditions` — only the contract name
changes. If the owner is a Safe, queue `pause()` through the Safe UI instead
and confirm `paused()` reads `true` on the explorer.

Unpause is the same call with `unpause()`. Do not unpause until the incident
review below is complete.

### Ownership transfer (deployer key → Safe)

Two steps, by design. The transfer is not real until the Safe accepts.

```
# Step 1 — from the deployer key:
npx hardhat console --network robinhood
> const c = await ethers.getContractAt("AtelierDrop", "<CONTRACT_ADDRESS>");
> await c.transferOwnership("<SAFE_ADDRESS>");
> await c.pendingOwner();   // must print the Safe address

# Step 2 — from the Safe (Safe UI → New transaction → Contract interaction):
#   call acceptOwnership() on the contract

# Step 3 — verify, from anywhere:
> await c.owner();          // must print the Safe address
> await c.pendingOwner();   // must print the zero address
```

Do not consider the handoff done until step 3 checks out on the block explorer
too. Then rotate the deployer key.

### Incident response

1. **Pause** every affected contract. First move, no meeting required.
2. **Snapshot** the facts: block numbers, tx hashes, affected addresses,
   explorer links. Write them down before they scroll away.
3. **Rotate keys.** Assume the deployer key is burned. Generate a new one,
   store it in Key Vault, purge the old secret.
4. **Assess** whether the owner itself is compromised. If yes, race a
   `transferOwnership` to a clean Safe before unpausing anything.
5. **Communicate.** Holders find out from you, not from a block explorer
   thread. State what happened, what is paused, what happens next.
6. **Fix, review, unpause.** Unpause only after the root cause is understood
   and the fix (or the all-clear) is written up.

## CI posture

- **Deploys never run in CI.** Not on a tag, not on a release, not behind a
  manual approval. Deployment is a human at a keyboard with a Key Vault-pulled
  key. Every workflow in `.github/workflows/` builds, lints, and tests — nothing
  else.
- Workflow permissions are `contents: read`. No `write`, no `id-token`, no
  package or deployment scopes.
- No repository or environment secrets are configured, and no workflow
  references any.
- Dependabot watches npm and GitHub Actions weekly (`.github/dependabot.yml`).
  Action versions are reviewed, not auto-merged.

## Responsible disclosure

Found a vulnerability? Report it privately via **GitHub private vulnerability
reporting** on this repository (Security tab → "Report a vulnerability"). Do not
open a public issue, and do not exploit it beyond the minimum proof needed to
demonstrate impact. You will get an acknowledgment and a straight answer.
