# infra/azure — how dtg-atelier plugs into the DTG Azure estate

This repo does not own cloud infrastructure. It *borrows* three narrow services from
the Dozier Tech Group Azure estate, whose canonical source of truth is
[`Dozier-Tech-Group/DTG-Infra`](https://github.com/Dozier-Tech-Group/DTG-Infra).
If a fact here ever disagrees with DTG-Infra, DTG-Infra wins.

## The estate

| Fact | Value |
|---|---|
| Tenant | `doziertechgroup.com` (`a0844ee1-d6d6-47c5-8fa8-69302b3ddd27`) |
| Subscription | **DTG Platform** (`ea96e212-9b00-4e93-9d3b-9018638cee20`) |
| Default region | `centralus` |
| Canonical infra repo | `Dozier-Tech-Group/DTG-Infra` |

One estate, one subscription, one region. No legacy tenants.

## The three roles Azure plays here

### 1. Key Vault holds the secrets. The repo holds pointers.

Deployer private keys and Firecrawl API keys live in Key Vault — nowhere else.
This repo commits only the *names* of secrets, never their values:

```
# .env (local, gitignored) — fetched from Key Vault, never committed
PRIVATE_KEY=$(az keyvault secret show --vault-name <vault> --name atelier-deployer-key --query value -o tsv)
FIRECRAWL_API_KEY=$(az keyvault secret show --vault-name <vault> --name firecrawl-api-key --query value -o tsv)
```

Never commit `.env`. Never paste a key into chat. Never put a secret in a GitHub
Actions secret when a Key Vault reference via OIDC will do. The vault in
`main.bicep` uses RBAC authorization, purge protection, and 90-day soft delete —
a deleted secret is recoverable and an attacker cannot purge the evidence.

### 2. A Storage static website is one hosting option for frozen metadata.

When a drop's metadata and images are frozen (`freezeURI()` is permanent — see the
contracts), they need a home that outlives any laptop. The Storage account in
`main.bicep` (StorageV2, HTTPS-only, TLS 1.2 minimum, blob public access disabled)
can serve them via the static-website endpoint. Bicep cannot enable static website
directly — it is a data-plane setting — so `deploy.ps1` prints the one-line CLI
command to run after deployment.

This is an *option*, not a mandate. IPFS or another host may serve a given drop;
`drop.config.json` decides. But if Azure hosts it, this is the account.

Custom domains for the endpoint go through Cloudflare. Per DTG-Infra: **DNS lives
in Cloudflare, not Azure.** Do not create Azure DNS zones.

### 3. GitHub Actions authenticates via OIDC. No long-lived secrets in GitHub.

`main.bicep` declares a user-assigned managed identity with a federated identity
credential scoped to exactly one thing:

| Field | Value |
|---|---|
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:Dozier-Tech-Group/dtg-atelier:ref:refs/heads/master` |
| Audience | `api://AzureADTokenExchange` |

A workflow on `master` in this repo exchanges its GitHub-issued token for an Azure
token at runtime. Nothing to rotate, nothing to leak, nothing stored in GitHub.
Grant the identity the minimum RBAC roles it needs (e.g. *Key Vault Secrets User*
on the vault, *Storage Blob Data Contributor* on the account) — role assignments
are deliberately not in the template, because scope decisions belong in DTG-Infra.

Note what OIDC is *for* here: CI reads research keys and pushes metadata. Key-gated
contract deploys never run in CI (see `.github/workflows/`). Builds run locally or
via GitHub Actions with scoped OIDC — per DTG-Infra, **ACR Tasks (`az acr build`)
is not permitted on this subscription.**

## Deploying

```powershell
# Preview only (what-if is the default — nothing changes):
./infra/azure/deploy.ps1

# Actually deploy:
./infra/azure/deploy.ps1 -Apply
```

`deploy.ps1` targets the DTG Platform subscription, creates `rg-dtg-atelier` in
`centralus` if it does not exist, and runs the deployment. Without `-Apply` it is
read-only.

## The rule that outranks the others

Per DTG-Infra: **any Azure resource change must be reflected in DTG-Infra's
`docs/ARCHITECTURE-MAP.md` in the same PR.** Not a follow-up PR. The same one.
`deploy.ps1` reminds you; this sentence is why.
