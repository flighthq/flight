---
package: "@flighthq/scene-document"
role: package
crate: flighthq-scene-document
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# scene-document — Charter

> Durable vision and core values for `@flighthq/scene-document`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

`@flighthq/scene-document` owns Flight's native logical scene document, its constrained YAML text
codec, and the schema-driven conversion between logical scene entries and owned 2D/3D runtime
materializations. A `FlightDocument` is a versioned multi-scene container with one shared resource
table, an in-range `defaultScene`, and a non-empty tuple of mixed `Scene2D`/`Scene3D` entries.

## North star

- One logical model spans mixed 2D and 3D entries without implying that they render together.
- Parsing and materialization refuse malformed or unsupported input with stable, machine-readable
  explanations; scene-local paths always identify `scenes[index]`.
- Public text boundaries are the symmetric `parseFlightDocumentText`, `explainFlightDocumentText`, and
  `formatFlightDocumentText` functions over the constrained, resource-bounded YAML subset.
- Scene and resource kinds remain open through registries. Runtime resource identity across separately
  materialized scenes is the caller's resolver policy, not a document-level cache.

## Boundaries

In scope: the `FlightDocument` container and entry types, text parsing/explanation/formatting, schema
registries, default or explicitly indexed per-scene materialization, and logical scene-entry writers.

Out of scope: Application composition, renderer/backend selection, live resource I/O, and an implicit
promise that two materializations share resolved object identity. Binary sidecar and packed encodings
remain a separate future arc gated on the planned `serialize` package.

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

- 2026-08-28 — Ratified `FlightDocument` as the versioned multi-scene container; its `scenes` tuple may
  mix 2D and 3D entries, while `defaultScene` selects the initial entry.
- 2026-08-28 — Empty scenes and invalid `defaultScene` are named refusals, never fallback behavior;
  entry-local refusals use `scenes[index]`-qualified paths.
- 2026-08-28 — Materialization remains per scene and Application composition remains external.
- 2026-08-28 — Resources are declared once, while a caller-provided resolver controls whether runtime
  identity is shared across materialization calls.

## Open directions

The ratified [scene-document model](../../scene-document-model.md) is the architecture record for the
shipped logical model, text codec, and materialization surfaces. Future work is limited to separately
approved extensions such as binary encodings; it must not collapse per-scene materialization into
Application composition.
