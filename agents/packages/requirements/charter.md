---
package: "@flighthq/requirements"
role: package
crate: flighthq-requirements
lastDirection: 2026-08-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# requirements — Charter

> Durable vision and core values for `@flighthq/requirements`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/requirements` is the backend-neutral question half of selective registration. Producers
report factual `(facet, key)` requirements into a sink, and callers merge or compare complete and
partial `RequirementSet` values without naming a renderer, registry, registrar, or backend.

## North star

Content describes what it needs once. Completeness is explicit through `covers`, so an unvisited facet
can never masquerade as evidence that the content needs nothing from that facet.

## Boundaries

- Owns requirement collection and deterministic set merge/diff operations.
- Depends only on `@flighthq/types` and belongs in the SDK core tier.
- Does not map facets to registries, choose backends, or carry remedies; those are consumer facts.
- Does not migrate existing scene walks during the additive stage.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-10] Additive before migration.** Build the requirement mechanism as a new cell without
  rewiring existing producers or coverage consumers; migration remains a separately gated thread.

## Open directions

Which existing producer walks adopt the sink is deferred to the migration thread.
