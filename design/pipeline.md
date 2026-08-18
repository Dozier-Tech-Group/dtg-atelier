# Pipeline — the generative render spec

This is the contract between a trait manifest and a finished drop. Any
implementation (Node script, Python, whatever the drop uses) must satisfy every
rule here, because the outputs — `{id}.png` and `{id}.json` — get frozen.

## Inputs

| Input | Requirement |
|---|---|
| Trait manifest | Validates against `traits.schema.json`. Layer `zIndex` values unique. Every layer's weights sum to exactly 100. |
| Layer assets | One PNG per option `file`, all with identical pixel dimensions (the canvas size), with alpha. Optional layers include their transparent `None` PNG. |
| `supply` | Token count, 1-indexed. Must equal the contract's `maxSupply`. Must be ≤ the number of distinct trait combinations, or generation cannot terminate. |
| `seed` | An integer, chosen once per run and **recorded**. The entire run is a pure function of (manifest, assets, supply, seed). |

Validation failures abort the run before any file is written. A pipeline that
renders first and validates later produces half-frozen garbage.

## The algorithm

For each token id from 1 to `supply`, in order:

1. **Select.** For each layer, sorted by `zIndex` ascending, draw one option by
   weighted random selection: draw `r` in `[0, 100)` from the seeded PRNG, walk
   the options in manifest order accumulating weights, pick the first option
   whose cumulative weight exceeds `r`. Manifest order is significant — never
   re-sort options.
2. **Hash.** Build the canonical combo string:
   `Layer=Option` pairs joined by `|`, layers in `zIndex` order, including
   `None` picks (e.g. `Background=Storm Glass|Body=Moss Grey|Eyes=River Amber|Headwear=None`).
   Hash it (SHA-256; the first 8 hex characters are the display form used on
   the board).
3. **Dedupe.** If the hash already exists in this run, discard the draw and
   re-select (the PRNG advances, so the retry differs). Cap retries at
   `1000 × supply` total across the run; hitting the cap means the weight
   distribution cannot yield `supply` unique tokens — fix the manifest, don't
   raise the cap.
4. **Compose.** Paint the selected PNGs onto the canvas in `zIndex` order,
   lowest first, straight alpha-over. No scaling, no filters, no per-token
   effects — anything visual belongs in the layer PNGs where it can be
   reviewed.
5. **Emit.** Write `{id}.png` and `{id}.json` (the metadata shape in
   `metadata-standard.md`, attributes in `zIndex` order, `None` picks omitted).

## Determinism

- One PRNG for the whole run, seeded once. Record the algorithm name with the
  seed (e.g. `mulberry32`, seed `4663`) — a seed without its algorithm is
  decoration.
- No `Math.random()`, no time-based anything, no parallel selection (parallel
  *composition* is fine once picks are fixed; selection order must be serial).
- Re-running with the same inputs must reproduce every byte of every `{id}.json`
  and every pixel of every `{id}.png`. Spot-check this on every run: regenerate
  ids 1 and `supply` and diff.

## The run record

Every render run commits a `run.json` next to its outputs:

```json
{
  "manifest": "traits.json",
  "manifestSha256": "…",
  "prng": "mulberry32",
  "seed": 4663,
  "supply": 54,
  "distinctCombos": 54,
  "retries": 3,
  "generatedAt": "2026-08-18T00:00:00Z"
}
```

This is the reproducibility receipt. A frozen collection whose seed is lost can
still be *served*, but it can never again be *proven* — record the seed.

## Output checklist

Before the outputs move to the metadata stage:

- [ ] Exactly `supply` PNG files and `supply` JSON files, ids 1..supply, no gaps.
- [ ] All PNGs share the canvas dimensions.
- [ ] All combo hashes unique (re-verify from the emitted JSON, not from memory
      of the run).
- [ ] Rarity sanity pass: observed option frequencies within reason of the
      weights for the supply size. At small supplies the variance is real —
      if a 5-weight option appears zero times in 54 tokens, that is probability,
      not a bug; decide whether you accept it *before* freeze.
- [ ] `run.json` committed alongside the outputs.
