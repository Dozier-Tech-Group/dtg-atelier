# Palette — defining a drop's colors before pixels

A drop palette is a closed set. Every hex the artwork may use is listed here
before rendering starts; anything not in the table is out of bounds. This is
what makes 198 tokens look like one collection instead of 198 opinions.

## Roles

Every color gets exactly one role. Three roles, fixed meanings:

| Role | Count | Job |
|---|---|---|
| **Core** | 2 | The identity colors. They dominate surface area — bodies, grounds, large shapes. Remove them and the collection is unrecognizable. |
| **Accent** | 1–2 | The energy. Small areas, high salience — eyes, highlights, rare traits, calls to action on the board. If an accent covers more than ~10% of a render, it has become a core and the palette is wrong. |
| **Neutral** | 2–3 | The support. Backgrounds, line work, text, shadow. Neutrals carry contrast so cores and accents don't have to. |

Five to seven colors total. More than seven is not a palette, it's a search
result.

## The table format

Define a palette as one table, exactly these columns:

| Hex | Name | Role | Usage |
|---|---|---|---|

- **Hex** — six digits, uppercase, leading `#`. No alpha; opacity is a
  rendering decision, not a palette entry.
- **Name** — evocative but unambiguous. Two words. The name is what appears in
  trait option names and design discussions; nobody says "the #3E5C4B one".
- **Role** — `core`, `accent`, or `neutral`. One role per color.
- **Usage** — a rule, not a suggestion. "Backgrounds and body base" is a rule.
  "Use where it feels right" is a bug.

## Accessibility — contrast notes

The palette also serves the board, the docs, and any web surface that shows the
drop, so text-bearing pairs must pass WCAG 2.1:

- **4.5:1** minimum for normal text (AA), **7:1** for AAA.
- **3:1** minimum for large text (≥ 24px, or ≥ 18.7px bold) and UI glyphs.
- Check every pair you will actually set text in — accent-on-dark-neutral and
  light-neutral-on-core are the ones that fail silently.
- Ratios below are computed with the WCAG relative-luminance formula and
  rounded to one decimal. `board.html` recomputes them live from the hexes, so
  the table and the board cannot drift apart.

Artwork itself (non-text) is exempt from WCAG, but a render whose subject sits
below ~3:1 against its background reads as mud at thumbnail size — and
thumbnails are where collections are judged.

## Worked example — the Bayou Standard palette

Louisiana bayou tones, chosen for the lineage and kept for the foundry's own
surfaces. This is the palette `board.html` renders.

| Hex | Name | Role | Usage |
|---|---|---|---|
| `#3E5C4B` | Cypress Green | core | Body base, dominant surfaces, dark cards on light grounds |
| `#6E5335` | Brackish Brown | core | Secondary bodies, wood, ground planes |
| `#C56B36` | Sunset Copper | accent | Eyes, highlights, rare-trait markers, primary buttons |
| `#D9A441` | Cane Gold | accent | Fine highlights, metallic details, link text on dark |
| `#F3EEE4` | Heron White | neutral | Text on dark, light grounds, line work on cores |
| `#93A796` | Spanish Moss | neutral | Secondary text on dark, muted UI, soft edges |
| `#131A16` | Bayou Ink | neutral | Page and canvas background, deepest shadow, text on light |

### Contrast table (WCAG 2.1)

| Pair | Ratio | Verdict |
|---|---|---|
| Heron White on Bayou Ink | 15.3:1 | AAA — default body text |
| Cane Gold on Bayou Ink | 7.9:1 | AAA — safe at any size |
| Spanish Moss on Bayou Ink | 6.9:1 | AA — secondary text, fine |
| Heron White on Cypress Green | 6.4:1 | AA — text on core cards, fine |
| Heron White on Brackish Brown | 6.2:1 | AA — text on core cards, fine |
| Sunset Copper on Bayou Ink | 4.7:1 | AA — passes, but prefer ≥ 18px for comfort |
| Heron White on Sunset Copper | 3.3:1 | **Large text only.** Never set body copy in white on copper. |

## Rules that are not negotiable

- Lock the palette before trait design starts. Trait options reference palette
  names; a palette edit after weighting invalidates the traits stage.
- Never introduce a hex mid-render "because this one trait needs it". Add it to
  the table, re-check contrast, re-commit — or don't use it.
- Tints and shades derived in the renderer (multiply, overlay, alpha) are
  allowed; new base hexes are not.
