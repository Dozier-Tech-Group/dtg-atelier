# Metadata standard — the JSON this repo emits

Marketplaces read metadata, not intentions. This document pins the exact shape,
the file naming, the hosting options, and the freeze policy. The pipeline emits
this shape and nothing else.

## The shape

One JSON file per token. OpenSea-compatible, four fields, no extras:

```json
{
  "name": "Pelican Parish #7",
  "description": "One of 54 residents of Pelican Parish, rendered from frozen traits on Robinhood Chain. License: CC0 — no rights reserved.",
  "image": "https://raw.githubusercontent.com/Dozier-Tech-Group/pelican-parish/master/images/7.png",
  "attributes": [
    { "trait_type": "Background", "value": "Cypress Dusk" },
    { "trait_type": "Body", "value": "Heron White" },
    { "trait_type": "Eyes", "value": "River Amber" },
    { "trait_type": "Headwear", "value": "Fisher's Cap" }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `name` | `{collection} #{id}`. Collection string comes verbatim from the trait manifest. `id` matches the token id — no padding. |
| `description` | One to three sentences. The **license line lives here** ("License: CC0 — no rights reserved." or your chosen terms) — it must be present before freeze, because after freeze it cannot be added. |
| `image` | Absolute HTTPS or `ipfs://` URL to `{id}.png`. Must resolve at freeze time. Relative paths are a bug. |
| `attributes` | Array of `{ "trait_type", "value" }` objects, both strings. `trait_type` is the layer name verbatim; `value` is the option name verbatim. Ordered by layer `zIndex`, ascending. A `None` draw on an optional layer emits **no entry** — marketplaces treat absence as the trait not existing, which is correct. |

No `external_url`, no `animation_url`, no numeric `display_type` attributes
unless a drop's concept page explicitly calls for them — and then this document
gets amended first. Extra fields are how metadata drifts.

## File naming and the contract

Files are named `{id}.json` — `1.json`, `2.json`, … — matching
`AtelierDrop.sol`, whose `tokenURI(id)` returns `{baseURI}{id}.json` by plain
concatenation. Consequences:

- `baseURI` **must end with `/`** (e.g. `https://…/metadata/`). A missing
  trailing slash yields `…metadata7.json`. Check it on testnet before mainnet.
- Token ids start at 1 (the contract mints sequentially from 1), so there is no
  `0.json`.
- Images follow the same convention: `{id}.png`, referenced absolutely from the
  `image` field.

## Hosting options

Three supported options. Pick one per drop and record it in the drop config.

| Option | baseURI shape | Trade-off |
|---|---|---|
| **GitHub raw** (the silicon-bayou way) | `https://raw.githubusercontent.com/{org}/{repo}/{branch}/metadata/` | Free, versioned, zero infra. Depends on GitHub's availability and the repo staying public. Proven in production: silicon-bayou's 198 frozen gators serve from GitHub raw today. |
| **IPFS pin** | `ipfs://{CID}/` | Content-addressed — the URI *is* the integrity check, the strongest match for frozen metadata. Requires a pinning service (and paying it forever); a CID nobody pins is a dead link. |
| **Azure Storage static site** (per `infra/azure/`) | `https://{account}.z*.web.core.windows.net/metadata/` or a Cloudflare-fronted custom domain | First-party control on the DTG estate. Follows all DTG-Infra rules: DNS in Cloudflare, secrets in Key Vault, and the resource change reflected in DTG-Infra's `docs/ARCHITECTURE-MAP.md` in the same PR. |

Whichever you pick: the URL scheme must be final **before** freeze, because
`baseURI` freezes with everything else.

## The freeze policy

`freezeURI()` is a one-way door. After it, `setBaseURI` reverts with
`URIIsFrozen()` — permanently, for everyone, including the owner. So metadata
ships only when it is perfect:

1. Every `{id}.json` from 1 to `maxSupply` exists and parses.
2. Every file matches the shape above — validated mechanically, not by eye.
3. Every `image` URL returns the correct PNG over HTTPS (or resolves via an
   IPFS gateway if `ipfs://`).
4. `tokenURI(1)` and `tokenURI(maxSupply)` return the expected URLs on the
   deployed contract — trailing-slash bugs die here.
5. The license line is present in every description.
6. The Design Definition of Done in `design/README.md` is fully checked.

Then, and only then, freeze. Silicon Bayou froze after exactly this drill; that
is why its 198 gators are trustworthy. Never freeze to hit a launch date. A
late freeze costs a day. A wrong freeze costs the collection.
