---
name: api-alignment-review
description: Audit the Flight SDK against its own conventions — exported API naming/verbs/out-params, source filename descriptiveness, and dependency hygiene. Use when asked to do an "API alignment review", "convention/consistency check", "filename review", or "dependency mapping review". Produces ephemeral Markdown reports (gitignored under reports/).
---

# API & Structural Alignment Review

A periodic audit of whether the SDK obeys its own rules. Four independent **dimensions**, each producing one Markdown doc per package plus one cross-cutting synthesis doc.

This is the **judgment** layer. It complements — never duplicates — the machine-checkable gates. Run those first and only report what they miss: `npm run api` / `api:json`, `npm run packages:check`, `npm run order`.

## How to run

The heavy lifting is a fan-out, so this skill drives the **`api-alignment-review` workflow**:

```
Workflow({ name: 'api-alignment-review' })                                  # all four dimensions
Workflow({ name: 'api-alignment-review', args: { dimensions: ['filenames'] } })
Workflow({ name: 'api-alignment-review', args: { dimensions: ['api','ts-rust'], packages: ['easing','path'] } })
```

All four dimensions ≈ 340 agents — scope with `args.dimensions` and/or `args.packages` unless a full sweep is wanted. After it finishes, generate `alignment/index.md` from the returned `byDimension` summaries (one ranked table per dimension, high-severity first). If a few agents fail on transient API errors, re-run just those subjects with the Agent tool using the same prompt.

For a small, targeted check you can also just follow the checklists below by hand — no workflow needed.

## Dimensions & checklists

### 1. `api` — exported API conventions (per package + `_consistency.md`)

- Function names contain the **full, unabbreviated type word** (`getNode2DBounds`, never `getDOBounds`).
- Exported names globally unique, especially from package roots.
- Allocation by verb: `create*`/`clone*`/pool `acquire*` may allocate; math/transform/bounds/update write into `out`/`target` and must not.
- `out`-param functions are **alias-safe** (read inputs into locals before writing).
- Mutable-param **naming by read/write**: `source` = read-only; `out` = written-only (never read); `target` = read **and** write. Order is destination-first `(out|target, source)`. Flag a write-only destination named `target`, a read+write one named `out`, or reversed `(source, out)`.
- Teardown verbs distinct: `dispose*` (detach→GC), `destroy*` (free non-GC resource now), `acquire*`/`release*` (pool brackets only).
- `Readonly<T>` wherever mutation isn't intended (objects; primitives exempt).
- Sentinels (`null`/`false`/`-1`) for expected failure; `throw` only for programmer error.
- `get*` accessors; `has*`/`is*` for booleans.
- **Verb & parameter-order consistency** within and across packages (the `_consistency.md` synthesis).
- `import type {}` on its own line; cross-package types from `@flighthq/types`.

### 2. `filenames` — filename descriptiveness (per package + `_global.md`)

The test: **remove the folder — is the bare filename self-describing?**

- A filename names the **domain or object**, never a single function (`HasTransform2D` → `transform2D.ts`).
- **Backend-variant packages** (`*-canvas`/`*-dom`/`*-gl`/`*-wgpu`) prefix every file **prefix-first** with the backend token: `glBlurFilter.ts`, `canvasBitmap.ts`, `wgpuShape.ts` — not `blurFilterGl.ts`, not a bare `blurFilter.ts`.
- Single-implementation domains (`node`, `surface`, `geometry`…) take a plain domain name; cross-package basename reuse is fine.
- Flag generic names (`data`, `format`, `query`, `utils`, `helpers`, `math`, `common`).
- Tests colocated as `<source>.test.ts`.

### 3. `deps` — dependency hygiene (per package + `_graph.md`)

- No package imports `@flighthq/sdk`.
- Cross-package types live in `@flighthq/types`, not redefined inline.
- Declared deps minimal/correct: no unused, no phantom (used-but-undeclared), workspace `"*"`.
- Layering respected (renderers→render core; backends independent; nothing reaches up a layer).
- The dep set is predictable from the package's purpose; flag surprising edges and cycles.

### 4. `ts-rust` — NOT APPLICABLE IN THIS REPOSITORY

**There is no Rust here to review.** The Rust port and the reference suite were moved out in `57722ed4c` and now live in **flight-rs** / **flight-reference**. This tree has no `crates/`, no `-rs` packages, no `agents/rust/`, and no conformance scripts — so every check this dimension used to make has nothing to read, and the `rust:conformance` / `mixing:conformance` gates it cited no longer exist.

Running this dimension against this repository produces nothing. It is left standing rather than deleted because whether the review moves to flight-rs, spans both repositories, or goes away is a scope decision and not a documentation one; the workflow still declares a `ts-rust` phase (`.claude/workflows/api-alignment-review.js`), which would need the same ruling.

## Maintaining this review

- Conventions live in the workflow's `*_CHECKLIST` strings (authoritative) and mirrored above.
- To add a dimension, extend `DIMENSION_KEYS` + the prompt builders in the workflow.
