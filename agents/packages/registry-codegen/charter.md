---
package: "@flighthq/registry-codegen"
role: package
crate: flighthq-registry-codegen
lastDirection: 2026-08-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# registry-codegen — Charter

> Durable vision and core values for `@flighthq/registry-codegen`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/registry-codegen` is the pure resolution kernel between content requirements and factual
catalog rows. It produces an ordered `RegistryCodegenPlan` containing matched ownership rows and
unresolved requirements for one backend.

## North star

Resolution is deterministic and emission-neutral. A plan must expose every unmatched positive
requirement without silently choosing how registrations obtain state, implementations, or arguments.

## Boundaries

- Resolves backend/facet/kind requirements to ordered catalog entries and reports gaps.
- Is pure, filesystem-free, argv-free, and part of the SDK core tier.
- Does not emit source text or select an ambient versus caller-filled registries module.
- Does not invent argument or source-expression fields.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-08-10] The output form is the ownership boundary.** The catalog entry shape is factual and
  approved; a single generated registries-module shape would answer the still-open ownership lane. The
  additive codegen cell therefore stops at the planning kernel.

## Open directions

Whether generated registry source is caller-filled or ambiently self-filling remains a user decision.
