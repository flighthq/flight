# Depth Review: @flighthq/lighting

**Domain:** 3D light descriptors for a real-time renderer — the data layer of a lighting system (light types, falloff/cone/shadow parameters, image-based environment lighting). Explicitly a descriptor package, not a shading/solver package.

**Verdict:** solid — **70/100**

The package covers the full canonical _set of light types_ a mature real-time renderer exposes, with the right per-type parameters (range falloff, spot cones, shadow bias/PCF, LTC area rectangle, IBL environment). What it does not yet have is breadth _within_ each descriptor — no photometric/physical units, no luminous-intensity helpers, no shadow-map/clip parameters beyond bias, and only a single mutator helper (`setSpotLightCone`). Judged as the descriptor cell it declares itself to be, it is well-formed; judged against everything an "authoritative lighting library" conventionally exposes, it is a strong but not exhaustive foundation.

## Present capabilities

Per-type `create*` + `clone*` pairs over plain entity data (all defaulting to opaque white `0xffffffff`, unit intensity):

- **AmbientLight** — uniform fill; `color`, `intensity`; correctly documented as non-shadowing.
- **HemisphereLight** — gradient ambient with `skyColor`/`groundColor`/`intensity`; the canonical sky/ground irradiance approximation, a real differentiator from a bare ambient term.
- **DirectionalLight** — sun; `direction` (travel direction), `intensity`, full shadow params (`castsShadow`, `shadowBias`, `normalBias`, `pcfRadius`).
- **PointLight** — omnidirectional; `position`, `range` (-1 = infinite), shadow params.
- **SpotLight** — cone-restricted; `position`/`direction`, `range`, inner/outer cone stored as precomputed cosines, plus `setSpotLightCone(out, innerDegrees, outerDegrees)` to write them from degrees. Shadow params present.
- **AreaLight** — rectangular, documented LTC-shaded; `position`/`direction`/`right`/`up` (half-extent axes), `range`, shadow params.
- **Environment** — IBL + skybox source; `environment` cubemap (shared, not deep-copied, with the GPU-aliasing reason documented) and `intensity`.

Good descriptor hygiene throughout: vectors are deep-cloned in `clone*` (fresh `direction`/`position`/`right`/`up`), the cubemap alias is deliberate and explained, packed sRGB-albedo RGBA color convention is consistent and the sRGB→linear seam is documented as living in `@flighthq/materials`. Types in `@flighthq/types` carry the design intent (forward lighting, `SceneLightBlock` packing path). Every export is colocated-tested.

## Gaps vs an authoritative lighting library

These are largely **missing-by-omission within the descriptor scope**, not missing-by-design — the descriptor layer is the correct place for most of them:

- **No photometric / physical units.** Industry-standard libraries (Filament, three.js `physicallyCorrectLights`, glTF `KHR_lights_punctual`) expose intensity in lumens / candela / lux and a `decay`/inverse-square model; here `intensity` is an opaque unitless scalar and `range` is a hard cutoff with no documented falloff curve or `decay` exponent. No color-temperature (Kelvin → RGB) helper, a near-universal convenience.
- **Spot falloff is only the cone, not the penumbra/profile.** No `spotBlend`/penumbra exponent beyond the inner/outer cosine lerp, and no IES photometric profile support (a standard feature in authoritative renderers).
- **No degrees↔stored-form helpers except for spot.** `setSpotLightCone` is the only mutator. There is no `setDirectionalLightDirection`, no `setPointLightRange`, no `getSpotLightConeDegrees` round-trip accessor, and crucially no validation/clamp ensuring `innerConeCos >= outerConeCos` (the comment explicitly offloads ordering to the caller).
- **Shadow descriptor is thin.** Only `shadowBias`/`normalBias`/`pcfRadius`. An authoritative shadow descriptor also carries shadow-map resolution, near/far or cascade split config (CSM for directional), point-light cubemap face handling, and a shadow strength/opacity. None present.
- **No light grouping / culling metadata.** No layer/mask, no `enabled` flag, no priority for the documented `MAX_FORWARD_LIGHTS` budget — the descriptors give a packer no way to prioritize when over budget.
- **No light-probe / SH irradiance type.** Environment covers IBL cubemaps, but spherical-harmonic irradiance probes and reflection-probe placement (common in mature engines) are absent.
- **No analysis/utility free functions.** No `getLightBounds` / influence-sphere computation for culling, no `getLightDirectionFromTarget` look-at helper, no luminance/luma query. The package is entirely constructors + clones.
- **Light linking / decoupled placement.** Types note placement comes from the owning scene node's transform, so per-light world transform is intentionally out of scope here — **missing-by-design**, correctly.

## Naming / API-shape notes

- Naming is exemplary and on-convention: full unabbreviated type words in every function, `create*`/`clone*` allocation verbs, `set*Cone` mutator with an `out` first param, packed-int color convention consistent across all six types.
- The `Options` interfaces are a clean, symmetric per-type surface. Defaults are sane and documented inline.
- One asymmetry: spot stores cosines (`innerConeCos`/`outerConeCos`) and exposes degrees only through `setSpotLightCone`, but `createSpotLight` _does_ take `innerConeDegrees`/`outerConeDegrees` — yet there is no getter to read them back as degrees, so a round-trip (create → inspect) forces the caller to `Math.acos` manually. A `getSpotLightConeDegrees(out)` accessor would close this.
- `setSpotLightCone` documents but does not enforce the `inner <= outer` invariant. For an authoritative library a clamp or a documented sentinel would be safer than silent inversion.
- `clone*` functions are split between delegating to `create*` (ambient, hemisphere, environment) and inlining `createEntity` (directional, point, spot, area, because they preserve already-stored fields like `innerConeCos`). Reasonable, but the inconsistency is worth a comment.

## Recommendation

Keep the verdict at **solid**. The light-_type_ taxonomy is complete and correctly modeled — this is the hard part and it is done well. To reach **authoritative**, add depth _inside_ the descriptors rather than new types:

1. Add a documented photometric model: `intensity` unit semantics, an inverse-square `decay`/falloff option, and a `createColorFromKelvin`-style color-temperature helper.
2. Round out shadow config (map resolution, directional CSM cascade splits, shadow strength) and a per-light `enabled`/priority/layer mask for the forward budget.
3. Add reciprocal accessors/mutators (`getSpotLightConeDegrees`, `setDirectionalLightDirection`, etc.) and a culling helper (`getLightInfluenceBounds`).
4. Consider an SH/light-probe descriptor alongside `Environment` to complete the IBL story.

None of these require new packages or cross-boundary work; they are additive within `lighting` + matching types in `@flighthq/types`.
