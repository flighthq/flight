---
package: '@flighthq/path-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# path-formats — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review.md](./review.md).

## Recommended

Sweep-safe: within `@flighthq/path-formats`, no cross-package coupling, no breaking change, no open design fork.

1. **`explainSvgPathData(d)` diagnostic query** — a shakeable plain-data companion to the `null`/`false` sentinels, returning where and why parsing failed (e.g. `{ position, reason }`; `null` for well-formed input). Directly required by the diagnostics inversion rule ("every silent sentinel gets a shakeable `explain*` query"). Separately importable, so it costs the parse path nothing. — review.md#gaps (1)
2. **Atomic `appendSvgPathData` failure** — parse into a scratch path (or record the pre-append length and truncate) so a `false` return leaves the caller's path untouched, then tighten the doc from "no mutation guarantee" to a guarantee. No signature change; strictly safer behavior. Add the failure-state test either way. — review.md#gaps (2)
3. **Fix the arc-after-`Z` corner** — the parser already tracks the correct post-close current point (`currentX/Y = startX/Y`); route it into the arc append (e.g. emit the implicit moveto/anchor the spec implies) so an `A` following `Z` starts from the subpath origin rather than `getPathLastPoint`'s pre-close anchor. Fully within this package's parser; add the regression test and clear the status.md known-limitation. — review.md#gaps (5)
4. **Tokenizer edge-case tests** — leading-dot (`.5`), packed decimals (`0.5.5`), explicit `+`, trailing-dot (`10.`), dangling-exponent backtrack (`1e` as a bare token), and non-finite overflow behavior. Behavior looks correct by inspection; lock it in. — review.md#gaps (4)
5. **Name the format options type** — `SvgPathDataFormatOptions` instead of the inline anonymous `Readonly<{ precision?: number }>`, local to the package (it crosses no package boundary), so writer options have a navigable home before they grow. — review.md#contract--docs-fit

## Backlog

- **Compact/relative/minified writer mode** (`H`/`V` collapse, implicit-repeat elision, relative-when-shorter, minimal separators) — parked: the charter blesses absolute emission and does not rule on minification; an output-mode option is a small but real design decision (option shape, defaults). Route to charter Open directions. — review.md#gaps (3), #candidate-open-directions (3)
- **Arc verb round-trip fidelity** (`A` surviving format, via a `Path` arc segment kind or cubic→arc recognition) — parked: cross-package; `@flighthq/path` owns the segment vocabulary. Belongs to the path charter's Open directions. — review.md#candidate-open-directions (2)
- **Canvas2D `Path2D` record/replay and other formats** (PostScript, compact binary) — parked: charter-deferred Open directions; each is additive as its own module when demand appears (the per-format-module boundary already anticipates them). — review.md#gaps (6)
- **Lenient (render-up-to-error) parse mode** — parked: contradicts the blessed 2026-07-09 sentinel decision ("not a silent partial"); only revisit if `svg-formats` (fork I) surfaces a real UA-compat need, and then as a charter decision, not a sweep item. — review.md#candidate-open-directions (4)
- **Doc touch-ups outside this cell** (Package Map line missing `appendSvgPathData`) — parked: admin-doc edits are the user's gate, not in-package work. — review.md#contract--docs-fit

## Approved

None.
