---
package: "@flighthq/tool-manifest"
role: tooling
crate: null
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tool-manifest — Charter

> Durable vision and core values for `@flighthq/tool-manifest`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/tool-manifest` is the declarative build configuration layer: it provides a serializable
JSON manifest format for declaring what capabilities a build supports, composition utilities for
layering and aggregating manifests, an import registry that maps manifest identifiers to
package/export pairs, code generation that emits tree-shaking-optimal TypeScript from a manifest,
content analysis infrastructure for deriving manifests from content files, and a three-way diff for
diagnostics.

The manifest is the single artifact that runtime resolution, build tooling (via
`@flighthq/vite-plugin-manifest`), and diagnostics all consume. It is pure data — no functions, no
imports, no code — and survives disk round-trips as JSON.

Like every `tool-*` cell it sits outside the `@flighthq/sdk` barrel, runs in Node, and keeps its
own exported types local rather than in `@flighthq/types`. It has no Rust crate.

## North star

The manifest is the answer to "what does this build support?" A build's capability set is declared
once, composed mechanically, and resolved to tree-shaking-optimal code — no manual handler hunting,
no unused imports, no missing capabilities discovered at runtime.

- A manifest is JSON. It serializes, composes, and diffs without importing any runtime code.
- Composition is mechanical: extend (pipeline layering) and union (content aggregation) are the two
  operations, and both are deterministic.
- Code generation is the tree-shaking boundary: the generated module imports exactly what the
  manifest declares, nothing more.
- Content analysis is domain knowledge contributed by format packages as static metadata, not
  runtime code. The manifest package provides infrastructure; domains provide mappings.
- The CLI is the standalone entry point for projects not using Vite.

## Boundaries

In scope: manifest types and JSON validation, composition (extend, union), import registry types and
resolution, code generation (manifest + registry → TypeScript source), content analysis
infrastructure (analysis types, analysis-to-manifest conversion), three-way diff (declared vs
encountered), and the `flight-manifest` CLI.

Not in scope: format-specific content analyzers (those live in format packages as domain
contributions), Vite integration (that is `@flighthq/vite-plugin-manifest`), runtime loading or
parsing, and any dependency on a browser or renderer.

## Decisions

_Append-only, dated, blessed rulings._

- 2026-09-22 — Manifest identifiers are strings (Kind values, family names, capability names).
  The manifest is domain-agnostic; each format/renderer domain contributes its own vocabulary and
  import mappings as static metadata.
- 2026-09-22 — Composition has two modes: extend (additive within categories, override for scalars)
  and union (minimal covering set across N manifests). No subtract/exclude operation.
- 2026-09-22 — Import registry entries map manifest identifiers to `{ package, export, kind?,
  kindPackage? }`. Static metadata, not runtime code.

## Open directions

_Gestured-at but undecided; where an agent asks rather than assumes. None recorded yet._
