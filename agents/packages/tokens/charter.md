---
package: "@flighthq/tokens"
role: package
crate: flighthq-tokens
draft: true
lastDirection: 2026-09-01
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# tokens — Charter

> Drafted by the implementing agent from the 2026-09-01 pilot ruling, not authored as user direction.
> The North star and Open directions below are the thinnest honest statement of what was ruled; they
> are for the owner to replace with their own framing.

## What it is

`@flighthq/tokens` resolves and substitutes the named semantic values a `.flight` scene entry declares
in its `tokens` section. A token is a kind-tagged row with mode variants (`light`, `dark`, and any
other open mode string); a node field references one by writing `$` before its key instead of a
hardcoded value.

Both operations are explicit calls the caller makes, in this order:

- `resolveFlightDocumentSceneTokens(scene, mode, resolvers?)` — picks one mode, follows aliases,
  validates each value through the open per-kind resolver table, and returns a flat dereferenced
  table (or `null` plus `explainFlightDocumentSceneTokenResolution`).
- `substituteFlightDocumentSceneTokens(scene, resolution)` — returns a **new** document scene entry
  with every reference replaced, for later materialization. It never mutates its input.

Nothing observes, binds, or re-evaluates. Switching modes is another resolve and substitute call.

## North star

The document declares the palette; this package turns it into concrete values on demand; the caller
decides when. A token that cannot be resolved is a named refusal carrying its key, mode, and path —
never a `$…` string left in a numeric field for a renderer to misread.

## Boundaries

In scope: mode selection and fallback, aliases, deep substitution into node field value trees, the
open per-kind resolver registry, and the refusal seam for all of it.

Not in scope, ruled 2026-09-01: applying tokens to a **live** materialized scene, the in-place
per-kind field writer that would need, and any document-to-live-node correspondence. Also out: the
text codec (the `tokens` section is read and written by `@flighthq/scene-document`), animated
transitions between modes (a caller's `tween` concern — transitions stay opt-in per gui-architecture
G2), and token authoring UI.

## Decisions

- **2026-09-01 — tokens live on the scene entry, not the container.** `FlightDocumentScene2D.tokens`
  and `FlightDocumentScene3D.tokens`, both dimensions symmetrically. Manager ruling, relayed through
  foreman. The known cost: a document holding a 3D world and its 2D HUD duplicates the palette.
- **2026-09-01 — substitution is pure and document-side.** `substituteFlightDocumentSceneTokens`
  returns a new scene entry; live apply is explicitly not built in this pilot.
- **2026-09-01 — token rows are authored kind-tagged, with the kind on the ROW.** Shaped
  `{ key, kind, ...mode variants }`, patterned after resource descriptors. A per-mode kind would let
  one token be a colour under one mode and a number under another.
- **2026-09-01 — per-kind resolvers are an open `KeyedTable`.** `Boolean`, `Color`, `Number` and
  `String` ship via `createFlightDocumentTokenResolverRegistry()`; a vendor kind is one
  `withRegistryTableEntry` call. An unregistered kind refuses by name.

## Open directions

- **Composite token kinds** (shadow, typography, gradient). The value model is already the open
  document value model, so a composite kind needs a resolver registration and no format change. No
  composite kind is registered yet.
- **Colour text fidelity.** An authored `0x3366ccff` is written back as `862375167`, because
  `formatNumber` emits decimal for every number — already true of `backgroundColor`. The kind tag now
  makes hex emission decidable per kind; it is deliberately not done, because token-only hex would
  trade one inconsistency for a more visible one. Worth revisiting as one rule for both.
