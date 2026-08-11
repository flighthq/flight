---
package: "@flighthq/registry-catalog"
role: package
crate: flighthq-registry-catalog
lastDirection: 2026-08-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# registry-catalog — Charter

> Durable vision and core values for `@flighthq/registry-catalog`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/registry-catalog` is the open, caller-owned inventory of which public registrar binds a
content kind to which implementation on a backend. Each row carries only facts that remain true under
either registry-ownership lane.

## North star

One exact factual row is independently usable by diagnostics, inventory checks, callers, and codegen.
Vendor-prefixed kinds remain first-class, and multiple ordered registrar rows may satisfy one
backend/facet/kind requirement.

## Boundaries

- Owns the open catalog mechanism and the factual backend, facet, kind, registrar import/symbol, and
  implementation import/symbol contract.
- Built-in rows are generated into this cell but remain empty during the additive stage.
- Does not own argument expressions, registration state, source emission, or existing registrar code.
- Remains separate from the consumer-shaped `SceneCoverageCatalog` diagnostics contract.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-10] Facts are in scope; lane choices are not.** Backend, facet, registrar import/symbol,
  and implementation import/symbol do not vary with the caller-filled versus self-filling decision and
  belong in the row. Argument/source expressions do vary and are excluded.
- **[2026-08-10] Contents stay empty.** The additive thread builds and checks the mechanism without
  populating built-in ownership rows or touching existing registration chains.

## Open directions

Population of built-in rows begins only in the migration thread after its rendering-drift gate closes.
