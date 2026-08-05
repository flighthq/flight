# Per-Package Artifact Contract

The contract `npm run docs:check` enforces (`scripts/docs.ts`, also run as a gate inside `npm run check`) and every skill references. It governs only the **envelope** — file presence, front matter, and the append-only ledgers. The prose body of every file is free. See [`index.md`](index.md) for the architecture. The same script carries a second, unrelated surface — the self-declared size budgets in [commands](../commands.md) — so a red `docs:check` is not necessarily a cell violation; read which check named it.

The checker splits its findings by who can act on them. **Failures** are unambiguous envelope violations — a missing `package` key, a malformed date, a broken relative link, a repeated ordinal — and gate the build. **Warnings** are drift that needs a human ruling and never gate: a charter missing its `North star` cannot be fixed by an agent, because charter direction comes from the user alone. Run `npm run docs:check -- --verbose` to list every warning individually rather than grouped by shape.

## Folder & file naming

- One folder per package: `agents/packages/<name>/`, where `<name>` is the `packages/<name>` directory name (the unscoped package name).
- Files: `charter.md`, `status.md`, `review.md`, `assessment.md`. No other names; no compound `<name>.charter.md` form (the folder already carries the package identity).
- `charter.md` is **required**. The other three are created by their producing stage.
- **Every `packages/<name>` must have a cell**, checked from the `packages/` side and failing if absent. Adding a package therefore means scaffolding its cell in the same change (`node agents/packages/scaffold.mjs` writes the stubs). A blank charter is a valid flagpole — it marks where review content will land — but no cell at all makes the package invisible to every generator, which is how `quadbatch` kept seven consumers and no survey. The reverse is not checked: a cell with no package is a chartered-unbuilt, absorbed, external, or reserved cell, all legitimate and already classified by the generated index.

## Front matter

YAML front matter is the only machine-read surface. Keys below are required unless marked optional. Values that are dates use `YYYY-MM-DD`. `package` must equal `"@flighthq/<name>"` and match the folder. `crate` is `flighthq-<name>` (identity) or `null` for packages with no Rust crate (`scene2d-canvas`, `scene2d-dom`, `effects-canvas`, `filters-canvas`, `filters-css`, `host-electron`, `surface-rs`, `textshaper-canvas`).

### `charter.md`

```yaml
package: '@flighthq/<name>'
role: package # package | header | barrel | tooling | host
crate: flighthq-<name> # or null
lastDirection: null # YYYY-MM-DD of the last time you gave direction; null until then
review: ./review.md
assessment: ./assessment.md
status: ./status.md
absorbed: '@flighthq/target' # optional; historical cell folded into another package
```

The charter carries **no status or score** — that lives in `review.md`/`assessment.md`. This keeps the charter's git history meaningful: it changes only when _direction_ changes.

`role` is the cell's architectural position, and it exists because generators must not treat every cell as an ordinary package. `package` is the default and covers all but six cells today.

- `header` (`types`) and `barrel` (`sdk`) are **obliged to absorb other packages' work**: every exported type in the SDK lives in `types` by rule, and `sdk` re-exports the tree, so a feature landing in `mesh` must touch both. Generators ranking staleness count only the commits such a cell **owned** — sole package touched, or at least half the lines — because a commit that merely passed through is not drift of that cell's own shape.
- `tooling` (`tool-*`) and `host` (`host-*`) sit outside the `@flighthq/sdk` barrel and are not tree-shakable, an exclusion `scripts/sdk-policy.ts` enforces. Their surveys do not gate SDK depth, so generators rank them separately rather than against SDK packages.

Declare the role rather than inferring it from churn statistics. The statistics are only correlated: `types` follows 86% of the commits touching it and `sdk` 87%, but `render` follows 67% against `mesh`'s 47%, so any threshold tuned to catch the first two misfiles `render` on the way. The architecture is the signal; the percentage is a symptom.

`absorbed` is optional and records a package that was deliberately folded into another package. The cell remains as architectural history, but generators must exclude it from build/deepen queues and must not propose recreating it.

### `review.md`

```yaml
package: '@flighthq/<name>'
status: stub # stub | partial | solid | authoritative
score: 0 # 0-100, reviewer's own, directional
updated: YYYY-MM-DD
ingested: # what this survey read
  - status.md
  - reviews/depth/<name>.md
  - source
```

`status` reuses the existing depth-review vocabulary (`stub` 🔴 / `partial` 🟡 / `solid` 🔵 / `authoritative` 🟢) so the charter, the reviews, and every generated index speak one language.

### `assessment.md`

```yaml
package: '@flighthq/<name>'
updated: YYYY-MM-DD
basedOn: ./review.md # the review revision this assessment reasoned over
```

### `status.md`

The **continuity log**: transient unfinished-work tidbits (half-done threads, gotchas, what to watch), appended by the developer or review pass. It is the home for the transient notes that would otherwise rot as inline `TODO` comments; durable semantic comments stay in the code. Append-only, newest entry on top.

```yaml
package: '@flighthq/<name>'
updated: YYYY-MM-DD # date of the newest entry; null when empty
by: null # the pass that merged the newest entry (e.g. ingest:builder-<sha>)
```

## Append-only ledgers

Two sections are **append-only**: `charter.md › Decisions` and `assessment.md › Approved`. Existing lines in these sections are never edited or deleted — only added, and `npm run check:append-only-ledgers` enforces it: every line present in a guarded section at the merge-base must still be present, byte-identical. A reversed decision is recorded as a **new** dated line that supersedes the old one; the old line stays. This preserves "frozen approval" and "a decision is never rewritten" without requiring a content schema.

### Completion and obsolescence are not approval changes

The `Approved` ledger records an **authorization event**, not a work state. An entry says that the user
authorized an item, on a date, by a named route; that historical fact cannot become false. Whether the
tree later implements the item or removes its target is a separate fact, on a different timescale,
authored by the tree rather than by the user. Recording completion as a change to approval would make
"we finished it" indistinguishable from "the user changed their mind."

Completion or obsolescence is therefore **not** a reversed approval. It never edits, annotates, or
appends to `Approved`. Only a new user ruling may append a dated `Approved` line that supersedes an
earlier approval.

Record the later tree fact as a dated, struck evidence note in the corresponding **non-ledger**
section, normally `assessment.md › Recommended`, labelled **LANDED** or **OBSOLETE**. Checkable source
evidence is mandatory: a `LANDED` note names the implementation source, manifest, or test that proves
the item exists; a bare label is not evidence. An `OBSOLETE` note must additionally name what obsoleted
the item — for example the split, ruling, or commit — so the claim can be checked. For example:

```markdown
- ~~Recommendation text.~~ — **LANDED 2026-08-05:** `packages/example/src/example.ts` and its test.
- ~~Recommendation text.~~ — **OBSOLETE 2026-08-05:** target replaced by the split in commit `abc123`.
```

These notes are a **cache, not the truth**. Completion and obsolescence remain facts about the tree and
can be re-derived from source at any time; losing a note costs a re-derivation, not the fact. That is
why the reworked `Recommended` section is an acceptable home while the authorization ledger remains
immutable.

## Provenance stamp (`Approved` entries)

Every `assessment.md › Approved` line begins with a stamp:

```
- [YYYY-MM-DD · <provenance>] <item> — <link to the recommendation it came from>
```

`<provenance>` is one of:

- `picked` — you named this item specifically.
- `blanket "<phrase>"` — swept in by a coarse approval, with the phrase you used, e.g. `blanket "do all recommended"`.

Examples:

```
- [2026-06-24 · blanket "do all recommended"] Radial/tangential acceleration — review.md#bronze
- [2026-06-10 · picked] stepParticleEmitter convenience — review.md#bronze
```

## Charter body sections

`charter.md` uses four fixed top-level sections (the buckets an agent sorts your direction into); prose within each is free:

- **What it is** — Flight-specific identity and where it ends and a neighbor begins.
- **North star** — the durable principles that define "good" for this package. Survives agents.
- **Boundaries** — in scope / explicitly **not** in scope (non-goals).
- **Decisions** — append-only, dated, blessed rulings, with the _why_ git can't capture.
- **Open directions** — gestured-at but undecided; where an agent **asks** rather than assumes.
