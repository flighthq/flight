# shading — Status

Continuity log for `@flighthq/shading`. See [charter](charter.md) (a **reserved** home) and [effect-adjustment-architecture](../../effect-adjustment-architecture.md).

## State: chartered, reserved, NOT built (2026-07-11)

`@flighthq/shading` is the reserved home for the compiled **Material Feature / Modifier** tier — shader features (Fresnel/rim, dissolve, toon quantization, normal perturbation, fog, vertex displacement) that inject into the material shader and produce variants. It is deliberately **not built**: Flight ships complete materials today, so there is no consumer for a compiled-feature/shader-graph system, and building one now would be an unused dispatcher (plurality guard / fork B).

The `draft: true` charter holds the name and the boundary (compiled features ≠ data-fed adjustments) so the three composition styles each have an address.

## Build trigger (from the charter)

Build this when the first material augmentation is genuinely wanted as a **composable feature across materials** rather than a whole new material kind (e.g. "dissolve on any material", "rim light on any material") — i.e. when ≥2 real features must combine on one material. At that point it gains its bedrock: a `Modifier` descriptor, a composition/ordering contract, and the per-backend compiler that assembles base material + features into one program.

## No code exists yet. Nothing to continue.
