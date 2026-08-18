# DESIGN — the art-direction charter

Artwork in this repo is an engineering artifact. It is specified, reviewed, and
frozen like a contract — because on-chain it *is* one. Every drop's art is fully
decided **before pixels**, and pixels are fully decided before mint.

This directory is the specification. If a decision about a drop's look is not
written down here (or in the drop's copy of these files), it has not been made.

## The order of operations

Six stages, strictly in order. Each stage produces a written artifact. No stage
starts until the previous stage's artifact is committed.

| # | Stage | Artifact | Decided |
|---|---|---|---|
| 1 | **Concept** | One page in the drop's README | What the collection *is*: subject, mood, one-sentence promise, supply |
| 2 | **Palette** | `palette.md` table | Every hex the artwork may use, by role, with contrast checks |
| 3 | **Traits** | Manifest validating against `traits.schema.json` | Layers, z-order, options, weights (each layer sums to 100) |
| 4 | **Renders** | `{id}.png` files from `pipeline.md` | Every token image, generated with a recorded seed |
| 5 | **Metadata** | `{id}.json` files per `metadata-standard.md` | The exact JSON marketplaces will read, forever |
| 6 | **Freeze** | `freezeURI()` transaction | Nothing changes again. Ever. |

The stages are one-directional on purpose. A palette change after traits are
weighted means redoing traits. A trait change after renders means regenerating
renders. A metadata change after freeze means nothing — freeze is permanent.
That is the point: cheap changes early, impossible changes late.

### 1 — Concept

One page. Name, subject, mood in five words or fewer, supply as a number with a
reason, and the single sentence a stranger would use to describe the collection.
If the sentence needs a comma, the concept isn't done.

### 2 — Palette

Follow `palette.md`. Core, accent, and neutral roles; every color gets a hex, a
name, and a usage rule; text-bearing pairs get a WCAG contrast ratio. The
palette is *closed* — an artist reaching for a hex not in the table is a
specification bug, not a creative decision.

### 3 — Traits

Write the trait manifest and validate it against `traits.schema.json`
(`traits.example.json` is a complete valid example). Layers compose by
`zIndex`, weights are positive integers that sum to exactly 100 per layer, and
absence is explicit: an optional layer expresses "nothing here" as an option
named `None` pointing at a fully transparent PNG. No implicit behavior.

Count your distinct combinations (the product of option counts across layers).
Supply must be ≤ that number or the pipeline cannot produce unique tokens.

### 4 — Renders

Run the pipeline in `pipeline.md`. Layered PNGs compose by `zIndex`, selection
is weighted-random with a **recorded seed**, and every token's trait combo is
hash-checked for uniqueness. The seed goes in the run record. A render you
cannot reproduce from the seed is a render you cannot trust.

### 5 — Metadata

Emit exactly the shape in `metadata-standard.md` — OpenSea-compatible, one
`{id}.json` per token, matching the contract's `tokenURI` concatenation
(`{baseURI}{id}.json` — see `AtelierDrop.sol`). Validate every file. Pick the
hosting option and commit to it.

### 6 — Freeze

`freezeURI()` on the contract is permanent. It ships only when every render is
final, every metadata file validates, every image URL resolves, and the license
line is chosen. There is no unfreezing. If you are less than certain, wait.

## Worked lineage: Silicon Bayou

This process is not theoretical. It shipped
[`Dozier-Tech-Group/silicon-bayou`](https://github.com/Dozier-Tech-Group/silicon-bayou):
**198 BAYOU gators** on Robinhood Chain (chain id **4663**), contract
`0xA81aEd6f3a5Faea95197786ba162e706Fd938d20`, metadata **frozen**.

- Supply was pinned at 198 before a single gator was rendered.
- Metadata was hosted as static JSON served over GitHub raw — the simplest
  hosting option in `metadata-standard.md`, proven in production.
- `freezeURI()` was called only after every URI resolved and every file
  validated. The collection is now immutable, which is why it can be trusted.

This repo generalizes that playbook. It does not modify that collection.

## Files in this directory

| File | What it is |
|---|---|
| `README.md` | This charter |
| `palette.md` | How to define a drop palette, with the worked bayou example |
| `traits.schema.json` | JSON Schema (draft 2020-12) every trait manifest must satisfy |
| `traits.example.json` | A small valid manifest — copy it to start a drop |
| `metadata-standard.md` | The exact metadata JSON this repo emits, naming, hosting, freeze policy |
| `pipeline.md` | The generative pipeline spec: compose, select, dedupe, output |
| `board.html` | Self-contained art-direction board — `npm run design:board`, open http://localhost:4174/board.html |

## Design Definition of Done

A drop's design is done when every box is checked. Not before.

- [ ] **Palette locked.** Every hex in the artwork appears in the palette table
      with a role and a usage rule. Text-bearing pairs pass WCAG contrast.
- [ ] **Trait weights sum to 100** in every layer, verified against
      `traits.schema.json` and re-verified by the pipeline before rendering.
- [ ] **Every trait combo renderable.** Each option's PNG exists, matches the
      canvas dimensions, and composites cleanly at its `zIndex` — including the
      transparent `None` files.
- [ ] **Metadata validates against schema.** Every `{id}.json` matches
      `metadata-standard.md` exactly; every `image` URL resolves.
- [ ] **License line chosen.** The rights statement (CC0, personal-use, or a
      custom license URI) is written into the collection description before
      freeze — after freeze it cannot be added.

Never freeze against unchecked boxes. Freeze is the one operation in this repo
with no undo.
