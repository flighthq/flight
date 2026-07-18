# Per-Package Artifact Contract

The contract a future `docs:packages:check` enforces and every skill references. It governs only the **envelope** — file presence, front matter, and the append-only ledgers. The prose body of every file is free. See [`index.md`](index.md) for the architecture.

## Folder & file naming

- One folder per package: `agents/packages/<name>/`, where `<name>` is the `packages/<name>` directory name (the unscoped package name).
- Files: `charter.md`, `status.md`, `review.md`, `assessment.md`. No other names; no compound `<name>.charter.md` form (the folder already carries the package identity).
- `charter.md` is **required**. The other three are created by their producing stage.

## Front matter

YAML front matter is the only machine-read surface. Keys below are required unless marked optional. Values that are dates use `YYYY-MM-DD`. `package` must equal `"@flighthq/<name>"` and match the folder. `crate` is `flighthq-<name>` (identity) or `null` for packages with no Rust crate (`displayobject-canvas`, `displayobject-dom`, `effects-canvas`, `filters-canvas`, `filters-css`, `host-electron`, `surface-rs`, `textshaper-canvas`).

### `charter.md`

```yaml
package: '@flighthq/<name>'
crate: flighthq-<name> # or null
lastDirection: null # YYYY-MM-DD of the last time you gave direction; null until then
review: ./review.md
assessment: ./assessment.md
status: ./status.md
```

The charter carries **no status or score** — that lives in `review.md`/`assessment.md`. This keeps the charter's git history meaningful: it changes only when _direction_ changes.

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

Two sections are **append-only**: `charter.md › Decisions` and `assessment.md › Approved`. A mechanical check (git diff) asserts that existing lines in these sections are never edited or deleted — only added. A reversed decision is recorded as a **new** dated line that supersedes the old one; the old line stays. This is what makes "frozen approval" and "a decision is never rewritten" mechanical without a content schema.

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
