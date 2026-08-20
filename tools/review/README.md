# Review tool behavior

## Navigation

Up/Down follows the sidebar's current visual order: tool order, then the attention groups `differs`, `changed`, `not-commissioned`, `requested`, and `included`, then alphabetical order within a group. Filtering retains that relative order. Left/Right follows declared renderer order after excluding context-only reference cells.

The review and commissioning queue excludes scenes with fewer than two reviewable backend cells by default. Context-only reference cells do not count toward that minimum. Use **Include single-cell** to opt into reviewing those scenes when their own-drift signal is useful despite the absence of a cross-backend comparison.

The sidebar re-sorts immediately when commission state changes. That behavior is accepted for now. If it disrupts a review pass, the two deferred options are:

1. Advance to the next cell automatically upon commission.
2. Avoid re-sorting immediately by freezing the ordered list for the pass.

## Proposed per-scene reference-image tolerance (design only)

Status: proposed for manager review. There is no tolerance manifest, reader, setter, or fuzzy review verdict yet.

### Declaration

Add one committed Flight-owned file, `scripts/reference-image-tolerances.json`. An absent scene entry means exact comparison; there is no mutable review-tool default and no tolerance stored in browser state.

```json
{
  "$comment": "Per-scene full-resolution reference-image comparison policy. Missing scenes are pixel-exact.",
  "schemaVersion": 1,
  "comparisonPolicyId": "illustrative-upstream-registered-policy-id",
  "scenes": {
    "functional/text-markup-color": {
      "channelTolerance": 2,
      "maxFraction": 0.001,
      "gateOnMaxChannelDelta": true,
      "maxChannelDelta": 16,
      "reason": "Measured sub-pixel glyph rasterisation variance in the registered capture environment."
    }
  }
}
```

The key is `subject/scene`, never a renderer or an individual reference/candidate pair, so every backend cell in a scene is judged by the same declared rule. `channelTolerance` is the existing `getBitmapMismatch` per-channel noise band; `maxFraction`, `gateOnMaxChannelDelta`, and `maxChannelDelta` map directly to `ReferenceImageComparisonPolicy`. All four numeric/gating fields and a non-empty reason are explicit on every override. The parser rejects unknown scenes, unknown fields, non-integer channel values outside 0–255, fractions outside 0–1, and malformed records. Both consumers fail closed on an invalid file rather than silently falling back to exact comparison.

The value above is deliberately illustrative, not an approved or registered identifier. The real registered `comparisonPolicyId` must name the per-scene policy contract and match `scripts/reference-image-capture-identity.json`. That identity is still registered by `flight-reference-images` and copied here; the review tool must not invent one. Adopting this design therefore includes registering the new policy identity before the first override lands.

### One implementation, two consumers

A new shared scripts module owns all of these operations:

1. Parse and validate the committed manifest.
2. Resolve `subject/scene` to an explicit policy, with an exact zero policy for absence.
3. Compare decoded blessed and candidate bitmaps through `compareOracleReference`.
4. Apply the resolved `maxFraction` and `maxChannelDelta` gates to the resulting measurement.

The review Vite server and `scripts/reference-image-check.ts` must import those same functions. The browser may render the delta image, but it does not independently decide `included` versus `differs`. For an exact policy the shared implementation may retain decoded-pixel hash equality as a fast path. For any nonzero policy it must decode both images: a hash mismatch is binary and cannot say whether the measured delta is inside the declared policy.

CI passes the scene policy into `verifyOracleCaptures`, and the review manifest uses the same verdict when it builds each cell's commission state. Tests use one image pair that is hash-different but inside policy and another just outside it, then assert the tool-facing state and CI verdict agree for both. A defeating test gives the tool and CI different policies and must fail the consistency assertion.

### Setting it in the tool

The review tool exposes **Set scene tolerance** only while showing a measured candidate/reference comparison. It displays the current measurements beside fields pre-populated from the scene's existing declared policy, requires a reason, and writes the scene entry to the committed manifest through a server endpoint. It does not store the value in local storage, auto-commission the image, or infer a permanent threshold from one observation. Removing an override is a reviewed file deletion that returns the scene to exact comparison.

This is per-pair pinning in a different guise, not a reversal of the earlier parity-tolerance decision. Parity pinning was withdrawn because the parity distribution had a clean numeric gap at 5, so one corpus-wide threshold was sufficient. Reference-image exact-hash equality has no distribution and no gap: it is a binary same/different result, so text rasterisation needs a separately declared full-resolution policy that both the review tool and CI apply.
