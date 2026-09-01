---
package: "@flighthq/tokens"
updated: 2026-09-01
by: builder2
---

# tokens — Status

## Open

- **No composite token kind is registered.** The value model already admits one (a mode value is the
  open `FlightDocumentValue`), and the resolver table is open, so a `Shadow` or `Typography` kind is a
  registration rather than a format change. Nothing exercises that path yet, so the first composite
  kind should expect to be the first real test of it.
- **Aliases are kind-checked only when the WHOLE value is a reference.** A reference nested inside a
  composite value substitutes without a kind comparison, deliberately: the field it fills is not the
  token's own semantic type. Unreachable today because every registered kind is scalar; it becomes
  reachable with the first composite kind, and the rule is stated in
  `flightDocumentSceneTokens.ts:resolveAlias`.
- **An unsubstituted reference is caught at materialization only where the field schema rejects a
  string.** `sceneDocumentRefusal.ts` runs each node field schema's `validate` and refuses an
  undeclared field, so a `$…` left in a numeric field is a `FieldInvalid` refusal rather than a silent
  coercion — the pipeline test's fixture relies on exactly that. A field whose validator accepts
  strings would still take a stray reference, which is why `substituteFlightDocumentSceneTokens`
  refuses an unresolved reference itself rather than delegating the check downstream.
- **Colour values round-trip through the model, not through their spelling.** `formatNumber` emits
  decimal, so an authored `0x3366ccff` is written back as `862375167`. Pre-existing and equally true
  of `backgroundColor`; see the charter's Open directions for why it was left alone here.
- **A substituted scene entry is a materialization input, not a save target.** It keeps its `tokens`
  section (the palette still round-trips) but its references are gone, so a mode switch must always
  re-resolve from the ORIGINAL entry. Pinned by `substituteFlightDocumentSceneTokens.test.ts`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- 2026-09-01 — corrected the field-validation note: node field validators DO run (they landed with
  document interactive states), which is what makes an unsubstituted reference a refusal.
- 2026-09-01 — pilot landed: kind-tagged token rows on both scene entries (`@flighthq/types`), the
  `tokens` codec section (`@flighthq/scene-document`), and resolve + substitute here. End-to-end flow
  from authored text to a materialized node is pinned in `flightDocumentSceneTokenPipeline.test.ts`.
