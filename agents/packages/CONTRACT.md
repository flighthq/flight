# Per-Package Artifact Contract

The contract `npm run docs:check` enforces (`scripts/docs.ts`, also run as a gate inside `npm run check`) and every skill references. It governs only the **envelope** — file presence, front matter, and the append-only ledgers. The prose body of every file is free. See [`index.md`](index.md) for the architecture. The same script carries a second, unrelated surface — the self-declared size budgets in [commands](../commands.md) — so a red `docs:check` is not necessarily a cell violation; read which check named it.

The checker splits its findings by who can act on them. **Failures** are unambiguous envelope violations — a missing `package` key, a malformed date, a broken relative link, a repeated ordinal — and gate the build. **Warnings** are drift that needs a human ruling and never gate: a charter missing its `North star` cannot be fixed by an agent, because charter direction comes from the user alone. Run `npm run docs:check -- --verbose` to list every warning individually rather than grouped by shape.

## Folder & file naming

- One folder per package: `agents/packages/<name>/`, where `<name>` is the `packages/<name>` directory name (the unscoped package name).
- Files: `charter.md`, `status.md`, `review.md`, `assessment.md`. No other names; no compound `<name>.charter.md` form (the folder already carries the package identity).
- `charter.md` is **required**. The other three are created by their producing stage.
- **A cell with no code in this repo carries `charter.md` alone.** `review.md` and `assessment.md` are surveys *of source*, and a cell marked `downstream:` or `reserved:` has none here — writing them would be ceremony asserting a survey nobody performed. So the `review` / `assessment` / `status` front-matter keys below are required only where the code is local. A `spunOut:` cell keeps whichever of the four it accumulated while its code did live here (`surface-rs` keeps all four); it does not shed them on departure.
- **Every `packages/<name>` must have a cell**, checked from the `packages/` side and failing if absent. Adding a package therefore means scaffolding its cell in the same change (`node agents/packages/scaffold.mjs` writes the stubs). A blank charter is a valid flagpole — it marks where review content will land — but no cell at all makes the package invisible to every generator, which is how `quadbatch` kept seven consumers and no survey. The reverse is not checked: a cell with no package is a chartered-unbuilt, absorbed, external, or reserved cell, all legitimate and already classified by the generated index.

### Supplementary evidence documents

- **[2026-08-07] Charter-reachable supplementary evidence is permitted.** The preceding “No other names”
  rule defines the four standard contract files; it does not prohibit a cell from carrying evidence
  beside them. A supplementary document belongs to a cell only when that cell's `charter.md` acknowledges
  it through a resolvable Markdown link or front-matter `./…md` pointer. The charter carries the cell's
  blessed direction, so a review or assessment reference is a finding and a status reference is a
  transient mention—not durable membership. The orphan gate mechanically enforces reachability from an
  authority-bearing document. `npm run docs:check` separately enforces cell membership by requiring each
  supplementary document directly inside a cell to be pointed to from its own `charter.md`. The four
  contract files remain required and retain the only uniform envelope; supplementary evidence is not a
  fifth contract-file kind. A `docs:check` “not a contract file” label is classification, not prohibition.

  The existing evidence set demonstrates why the distinction is load-bearing:
  [`geometry/out-parameter-sweep.md`](geometry/out-parameter-sweep.md),
  [`host-electron/seam-audit.md`](host-electron/seam-audit.md),
  [`interaction/interaction-state-design.md`](interaction/interaction-state-design.md),
  [`scene2d-dom/public-lane-audit.md`](scene2d-dom/public-lane-audit.md),
  [`skeleton2d/rig-model.md`](skeleton2d/rig-model.md),
  [`swf/fixture-evidence.md`](swf/fixture-evidence.md),
  [`swf/sha-pin-incidental-audit.md`](swf/sha-pin-incidental-audit.md), and
  [`swf/tag-coverage.md`](swf/tag-coverage.md). Seven were already acknowledged by their cell charters;
  the scene2d-dom public-lane audit is acknowledged by the companion charter repair. The SWF fixture
  record is also license evidence: it commits provenance and a derived manifest instead of redistributing
  the upstream binary. When eight files across several cells independently violate an apparent contract,
  the contract is usually what is wrong, not eight authors. The defect here was the contract's silence
  being read by a gate as prohibition.

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
downstream: flight-hx # optional; implemented in the named upstream-consuming repo, never scaffolded here
spunOut: flight-rs # optional; code that once lived here and was moved out
reserved: true # optional; name/concept held deliberately, not to be built yet
```

The charter carries **no status or score** — that lives in `review.md`/`assessment.md`. This keeps the charter's git history meaningful: it changes only when _direction_ changes.

`role` is the cell's architectural position, and it exists because generators must not treat every cell as an ordinary package. `package` is the default and covers all but six cells today.

- `header` (`types`) and `barrel` (`sdk`) are **obliged to absorb other packages' work**: every exported type in the SDK lives in `types` by rule, and `sdk` re-exports the tree, so a feature landing in `mesh` must touch both. Generators ranking staleness count only the commits such a cell **owned** — sole package touched, or at least half the lines — because a commit that merely passed through is not drift of that cell's own shape.
- `tooling` (`tool-*`) and `host` (`host-*`) sit outside the `@flighthq/sdk` barrel and are not tree-shakable, an exclusion `scripts/sdk-policy.ts` enforces. Their surveys do not gate SDK depth, so generators rank them separately rather than against SDK packages.

Declare the role rather than inferring it from churn statistics. The statistics are only correlated: `types` follows 86% of the commits touching it and `sdk` 87%, but `render` follows 67% against `mesh`'s 47%, so any threshold tuned to catch the first two misfiles `render` on the way. The architecture is the signal; the percentage is a symptom.

`absorbed` is optional and records a package that was deliberately folded into another package. The cell remains as architectural history, but generators must exclude it from build/deepen queues and must not propose recreating it.

`absorbed`, `downstream`, `spunOut`, and `reserved` are the four **no-local-code** markers, and each answers a different question about why `packages/<name>/` is absent — folded into another package, built in a repo downstream of this one, moved out of here, or deliberately not built yet. They share one mechanical consequence: `docs.ts` treats the charter as an upstream naming record rather than a live one, so the body-section contract does not apply, and `todo.mjs` routes the cell out of the chartered-unbuilt queue into its own section. Pick by the reason, not by the effect — the effect is identical under all four, so a wrong marker is invisible to every gate and misleads only the reader. Full definitions in [register.md](register.md#states).

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

Two sections are **append-only**: `charter.md › Decisions` and `assessment.md › Approved`. Existing lines in these sections are never edited or deleted — only added. A reversed decision is recorded as a **new** dated line that supersedes the old one; the old line stays. This preserves "frozen approval" and "a decision is never rewritten" without requiring a content schema.

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

### Historical ratchet boundary

The completion rule is a ratchet, not a retroactive audit: once a governed line exists, later state
is recorded with a new dated line instead of editing history. The seven violations below are the case
for that rule, with the four-edit Physics2D progress counter as the exhibit.

- ~~Seven historical guarded-line edits had no durable explanation.~~ — **RECORDED 2026-08-07:** a
  deliberately wide `FLIGHT_LEDGER_BASE=1b4fb2bdf npm run check:append-only-ledgers` comparison finds
  two lines in `physics2d/charter.md`, two in `skeleton2d-formats/charter.md`, and three continuation
  lines in `swf/charter.md`. The Physics2D progress decision was maintained as a counter through four
  in-place edits—five to six kinds in `79f2ddc0a`, six to seven in `226af002d`, seven to eight in
  `10483d987`, and eight to all nine in `1c7794799`; `5364889d9` rewrote its debug-geometry decision,
  and `0e1ec6820` rewrote the two Skeleton2D-formats lines and three SWF lines. The current text is a
  chosen historical state: restoring an old line would substitute a reconstruction for the approver's
  words, while appending a supersession would misstate an edit as a reversal. Those four ancestral
  edits to one guarded `Decisions` line supersede the earlier three-edit account; they do not describe
  separate lines.

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
