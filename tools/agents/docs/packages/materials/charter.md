---
package: '@flighthq/materials'
crate: flighthq-materials
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# materials — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/materials` is the data-side material system for the SDK — the package that holds material _descriptors_ and the color _values_ they are built from, not the shading code that consumes them. It spans three slices fused into one package today:

- **2D color transform** — a complete OpenFL-parity `ColorTransform` algebra (create/clone/copy/concat/invert/equals, offset packers, GPU-array upload path). This is the Flash/OpenFL tinting model.
- **Color utilities** — packed-RGBA values and the conversions between color spaces: the bidirectional sRGB↔linear seam (`unpackColorToLinear`/`packLinearToColor`), gamma-free pack/unpack, HSL/HSV (artist-facing, sRGB-space), gamma-correct mixing/lerp, luminance/contrast/WCAG, and premultiply/unpremultiply.
- **3D material catalog** — a broad, glTF-aligned descriptor library: unlit/debug, classic lighting (Lambert/Phong/Blinn-Phong), metallic-roughness PBR core, the spec-gloss model and its conversion to metallic-roughness, the KHR-named extension materials (anisotropy, clearcoat, iridescence, sheen, specular, transmission/volume, subsurface), validation/clamping, a generic clone/copy/equals suite, and named PBR presets.

It ends where **shading** begins: it produces and compares descriptors and color values; it does not (today) own BRDF/Fresnel/GGX/IBL math. It feeds the GPU renderers (`render-gl`/`scene-wgpu`) and the software path (`displayobject-skia`), sits at the 2D-tint / 3D-material / color-seam intersection, and is the single SDK home for the sRGB→linear decode.

_(Seeded from the prior depth review; replace with the intent in your own framing.)_

## North star (proposed)

_Proposed durable principles inferred from the design and the structural forks. Confirm, edit, or move any of these to Open directions before they are treated as the rubric._

- **Plain data over runtime objects.** Materials are descriptors and colors are packed RGBA integers — value types with explicit `create*`/`clone*`/`copy*`/`equals*` brackets and `out`-param math, not stateful material objects with hidden behavior. This is what keeps the package a Wasm-mixable value-typed leaf (fork D).
- **One color convention, one sRGB seam.** A single SDK-wide sRGB↔linear decode/encode lives here, packed `0xRRGGBBAA` is the one color form, and every conversion (HSL/HSV/linear/premultiply) is built on it. There is exactly one place the gamma transform happens.
- **glTF/KHR as the descriptor vocabulary.** The 3D material catalog tracks the industry-standard metallic-roughness + KHR-extension model rather than an invented taxonomy, so descriptors round-trip with the wider ecosystem and the Rust port can mirror upstream factoring.
- **AAA descriptor coverage; the clone/copy/equals/validate quartet is complete and generic.** Every material kind participates uniformly in structural clone, in-place copy, equality, and clamping — no kind is a second-class citizen, and the round-trip law (`equals(clone(m), m)`) holds for every kind.
- **Descriptor-vs-math line is deliberate, not accidental.** Where the package draws the line between "material data" and "shading math" is a stated boundary the renderers depend on — not an unstated gap. (Which side IBL/BRDF lands on is an Open direction below, not a settled principle.)

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighbors. Confirm before relying on them._

**In scope (proposed):**

- Color-transform algebra (OpenFL parity) and its GPU-upload path.
- Packed-color utilities and the bidirectional sRGB↔linear seam.
- Artist-facing color spaces (HSL/HSV) and gamma-correct mixing/measurement.
- The full 3D material descriptor catalog (unlit, classic, PBR core + spec-gloss, KHR extensions), with clone/copy/equals/validate and named presets.
- Material-model conversions that are pure descriptor→descriptor math (e.g. spec-gloss → metallic-roughness).

**Non-goals / out of scope (proposed, pending Open directions):**

- **Shading math** (BRDF/Fresnel/GGX/IBL/normal-mapping) — currently lives in renderer backends; whether it graduates here is the gating Open direction.
- **Serialization / glTF `material` JSON import** — the triad `-formats` layer; deferred as cross-package (the map-handle ↔ resource-id seam needs `resources`/`loader` sign-off) until format plurality appears.
- **Shaders / shader programs** — despite the legacy "shader-related utilities" Package Map line, there is no shader code here and none planned in this package.
- **The perceptual color tier (OKLab/OKLCH) and CSS color parsing** — a scope choice (in-package vs a dedicated `@flighthq/color` neighbor), not yet decided.

## Decisions

None blessed yet.

## Open directions

_Every candidate question carried from the review and the structural forks that touch this package. These are for the user to settle — an agent asks here rather than assumes._

1. **Material-math boundary (the gating fork).** Does `@flighthq/materials` become the shading source of truth — BRDF/Fresnel-Schlick/GGX/IBL as tested reference math consumed by both the GPU shaders and `displayobject-skia` — or stay descriptor-only with the math living in renderer backends? This is the difference between an authoritative material _library_ and an authoritative material _descriptor_ library, and it carries direct Rust-conformance weight. (structural-forks A: source-data vs graph participation; fork D: material/color math is named as a Wasm-mixable leaf candidate.)
2. **Where do `LinearColor`/`HslColor`/`HsvColor` (and a future color tier) live?** They are already the return/out types of exported barrel functions and cross into `render-gl`/`scene-wgpu`/`displayobject-skia`, yet are defined file-local in `color.ts`. Do they move to `@flighthq/types` as shared scratch types, and/or does the color half graduate to a dedicated `@flighthq/color` neighbor? The package is already half a color library; the boundary is undecided.
3. **OKLab/OKLCH (perceptual) tier** — in-package or in the `color` neighbor above. Pure math, no blocker, but a scope choice.
4. **Materials serialization / a `materials-formats` triad cell.** The map-handle ↔ resource-id seam shape, and whether glTF `material` import is a `materials-formats` package (the triad `-formats` layer) or belongs to `resources`. Cross-package; the triad plurality guard (structural-forks B / the subject triad) says don't pre-create the cell until ≥2 formats appear.
5. **`KHR_texture_transform` and the full extension-parity set** (per-map UV transform; dispersion, diffuse-transmission, emissive-strength as a first-class field, unlit round-trip) — which extensions are in scope, given each may touch `@flighthq/types` for the GPU renderers to read.
6. **Rust conformance posture.** When does `flighthq-materials` catch up (the gate reports ~60% — the entire 3D family, the new color helpers, and the conversion/validation/preset surface are unported), and are the existing Rust name drifts (`equals_material_by_kind`, the split `create_color_transform_from`) sanctioned in the divergence map or bugs to rename? The TS `equalsMaterial` rewrite this pass makes the `_by_kind` name actively misleading.
7. **Conversion-matrix completeness.** Is the package responsible for the full material-model conversion graph (back-direction metallic→spec-gloss, phong↔PBR, shininess↔roughness), or only the canonical spec-gloss→metallic-roughness path? A scope question that interacts with the descriptor-vs-math boundary.
8. **`materials` Package Map line.** The map still reads "color transform and shader-related utilities … 3D material support is planned as a future direction," which is now false on every clause. Rewriting it to match "What it is" is an admin-doc revision that needs user sign-off (surfaced here rather than acted on).
