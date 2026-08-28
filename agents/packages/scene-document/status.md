---
package: "@flighthq/scene-document"
updated: 2026-08-28
by: builder3
---

# scene-document — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Round 8 is accepted. The public and contract lanes export the ratified multi-scene `FlightDocument`
model; `parseFlightDocumentText`, `explainFlightDocumentText`, and `formatFlightDocumentText`; and
default or explicit-index 2D/3D materialization surfaces. A container may mix dimensions, but each
entry materializes independently and Application composition remains external.

Empty `scenes` and an invalid `defaultScene` are named refusals. Entry-local explanations are qualified
with `scenes[index]`. Resources are declared once on the container, while the caller-provided resolver
controls whether separate materializations receive shared or distinct runtime object identities.

There are no remaining Round 8 design blockers. Binary sidecar and packed encodings remain future work
gated on a separately approved `serialize` package arc.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- 2026-08-28 — Ratified multi-scene model, public text codec, default/explicit-index materializers,
  named container refusals, and `scenes[index]` diagnostics shipped; see
  [the architecture record](../../scene-document-model.md) and package contract.
- 2026-08-27 — Resources are declared once across the document, but the caller-provided resolver
  controls runtime identity: materializing two scenes may share or duplicate a texture by caller
  policy; the document groups scenes, and the application composes their rendering.
