---
package: '@flighthq/text-markup'
updated: 2026-07-13
basedOn: ./review.md
---

# text-markup — Assessment

## Recommended

Sweep-safe, within-package, no design fork:

1. **Sanitization/drop guard + `explain*`** — `enableTextMarkupGuards` (separately importable, emitting via `@flighthq/log`) warning on unknown/dropped tags, unresolved `<font color>` values, and unsafe `href` schemes; plus a shakeable `explainTextMarkup(html)` returning plain data about what a parse dropped/ignored. Charter Open direction 3 already names this; the diagnostics convention fully specifies the shape.
2. **Relative font size** (`size="+2"` / `size="-1"`) — resolve against the enclosing stack size in the `<font>` handler, keeping `TextFormat.size` absolute. Dialect fidelity for the blessed `htmlText` subset; contained to `markupTagRegistry.ts`.
3. **Linear-time `resolveMarkupFormats`** — replace the per-character object build in `formatTextMarkup` with a range-boundary sweep so serialization is O(n + ranges) without per-char spreads. Behavior-preserving; the round-trip test pins correctness.
4. **Document the `<span class>` one-way rule** — a durable comment on `formatTextMarkup` stating class names do not survive serialization (formats are stored resolved), so the silence is a stated rule rather than a surprise.

## Backlog

- **`<img>` placeholder support** — parked: requires the rich-text model (`@flighthq/textlayout` / `@flighthq/types`) to grow an inline-image concept first (charter Open direction 2; cross-package).
- **Registry-aware serialization** (custom tags round-tripping through `formatTextMarkup`) — parked: API-shape fork (serializer hooks on `MarkupTagHandler` vs. a separate emit registry); route to charter Open directions.
- **`condenseWhite`-style whitespace option** — parked: dialect-scope question the charter has not settled (candidate open direction in the review).
- **BBCode / native-dialect sibling codec** — parked: charter Open direction 1, a new-package (register) question, not in-package work.
- **Package Map entry for `@flighthq/text-markup`** — parked: `agents/index.md` / `packages/map.md` edits are admin-doc revisions gated by the user.

## Approved

_Empty — awaiting the user's verbal approval gate._
