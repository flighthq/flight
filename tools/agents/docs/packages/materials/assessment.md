---
package: '@flighthq/materials'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/materials

The review verdict is **solid — 86/100**. This bundle already landed the bulk of the prior maturation roadmap: every Bronze item (clone/copy/equals, spec→metallic conversion, the color-seam inverse, the manifest fix) and most of the Silver color-ops / validation / alpha-mode / presets tiers. What remains splits cleanly into a small set of within-package, no-decision **contract-fit fixes** (Recommended) and a larger set of **cross-package, type-touching, or design-gated** items (Backlog), with the genuine forks routed to the charter's Open directions.

Per the contract, **Approved is left empty** — approval is the user's verbal gate.

## Recommended

Sweep-safe: within `@flighthq/materials`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this set as a whole.

- **Fix `equalsMaterial`'s shallow `standard` sub-block compare** (review.md › Gaps). The generic field loop does `aFields[key] !== bFields[key]` for every non-`kind` field, so a PBR-extension material's nested `standard` object compares by reference — and because `cloneMaterial` / `copyMaterial` allocate a _fresh_ `standard` block, `equalsMaterial(cloneMaterial(m), m)` is `false` for every extension material. This is a real clone↔equals round-trip inconsistency, not a cosmetic one. Recurse into `standard` (and any nested entity besides the already-handled `colorTransform`) so structural equality is actually structural for extension kinds. Within-package, bug-fix, no decision; pairs with an added clone-round-trips-equal test.

- **Repair the stale `hslToRgb` doc comment** (`color.ts:57-60`; review.md › Contract & docs fit). The block comment is a copy-paste of `rgbToHsl`'s — it claims the function converts a packed color _to_ HSL, writes hue/sat/lightness to `out`, and "Returns `out`", when the function actually does HSL→RGB and returns `void`. Pure documentation defect on a public function; rewrite to match.

- **Align `createColorTransform`'s constructor param with the `create*Material` shape** (api-alignment Medium; review.md › Contract & docs fit). Rename `obj` → `opts` and mark it `Readonly<Partial<…>>`, matching every `create*Material(opts?: Readonly<Partial<…>>)`. A within-package naming/consistency fix; pre-release, no consumers, so no migration concern.

- **Settle the `compute*` vs `get*` verb split for derived-color reads** (api-alignment Low; review.md › Contract & docs fit). `computeRgbHexString` derives a value like its `getColorTransformOffsetRgb*` siblings but uses a different verb. Pick one verb for derived-color reads and apply it. Within-package; rename only.

## Backlog

Parked: each waits on a cross-package seam, a `@flighthq/types` change, a new triad cell, or an Open direction the charter has not yet settled. Not part of any blanket approval.

- **Move `LinearColor` / `HslColor` / `HsvColor` to `@flighthq/types`** (review.md › Contract & docs fit; api-alignment **High** on `LinearColor`). These are the return/out types of exported barrel functions — already public surface — and `LinearColor` crosses into `render-gl` / `scene-wgpu` / `displayobject-skia`. Per the header-layer rule, cross-package types belong in `@flighthq/types`, not file-local in `color.ts`. **Parked because it edits `@flighthq/types`** (a shared header, outside this package's boundary) and is entangled with Open direction 2 (does the color half graduate to a dedicated `@flighthq/color` neighbor?) — the destination of these types depends on that ruling. High-value and low-effort once the boundary is decided.

- **Rewrite the Package Map line for `@flighthq/materials`** (review.md › Contract & docs fit). The map in `tools/agents/docs/index.md` still reads "color transform and shader-related utilities … 3D material support is planned as a future direction," which is stale on all three counts (3D is shipped and extensive, the color tier is broad, there is no shader code). **Parked because it is a user-gated admin-doc edit** outside the package source; surface as a suggestion to update the map to match the charter's "What it is."

- **Per-family `equals*` fast paths** (`equalsStandardPbrMaterialProperties`, `equalsSurfaceMaterial`) — Silver roadmap optimizations over the generic `equalsMaterial`. **Parked as not-yet-needed**: the generic path (once the `standard` recursion above lands) is correct, and these are perf specializations with no measured hot path. Revisit if a profile shows the generic compare is hot.

- **Conversion-matrix completion** (review.md › Gaps): `convertStandardPbrToSpecularGlossiness`, `convertPhongToStandardPbr` / `convertStandardPbrToBlinnPhong`, and shininess↔roughness helpers. The spec-gloss→metallic direction landed; these are the lossy inverse/cross conversions. **Parked as larger additive scope** (each is documented-lossy approximation work with round-trip error tests), not a single sweep-safe fix; admit as a follow-on once boundaries are set.

- **Serialization round-trips / a `materials-formats` triad cell** (review.md › Gaps; Open direction 4): `serializeMaterial` / `deserializeMaterial` and glTF `material` JSON import. **Parked as cross-package**: the map-handle ↔ resource-id seam needs `resources` / `loader` sign-off, and the triad **plurality guard** (structural-forks B / the triad section) says do **not** pre-create a `materials-formats` cell until ≥2 formats appear. Surfaced to the charter's Open directions, not recommended.

- **`KHR_texture_transform` (per-map UV transform)** (review.md › Gaps): the one common glTF feature the catalog omits. **Parked as a `@flighthq/types` + renderer-coupled change** — it adds a `TextureTransform` type the GPU backends read, so it crosses the package boundary and needs sign-off. Surfaced as Open direction 5.

- **Functional / parity rendering scenes** exercising each material kind across the raster backends (review.md › Gaps). **Parked as cross-package**: it lives in `tests/functional`, depends on the GPU/`displayobject-skia` renderers actually consuming these descriptors, and is end-to-end coverage rather than within-package unit work.

- **Bring `flighthq-materials` to conformance** (review.md › Gaps; Open direction 6). The Rust crate is ~60% conformant (45 TS / 21 Rust / 24 missing): the entire 3D family, the new color helpers, and the conversion/validation/preset surface are unported, and Rust carries undocumented name drifts (`equals_material_by_kind`, a split `create_color_transform_from`). The TS `equalsMaterial` rewrite this pass makes the `_by_kind` Rust name describe behavior TS no longer has. **Parked as a cross-worktree port** gated on (a) the material-math boundary ruling, which decides whether the BRDF reference is in scope, and (b) a divergence-map decision on whether the existing name drifts are sanctioned or bugs. Surfaced as Open direction 6.

## Routed to the charter's Open directions (not edited here)

The review surfaced six charter silences; the design forks and cross-package boundary questions below are **not** Recommended — they need a `North star` / `Boundaries` decision from the user. Noted here for the next charter pass; this skill does not edit the charter.

1. **Material-math boundary (the gating fork).** Does `@flighthq/materials` become the shading source of truth — tested BRDF / Fresnel-Schlick / GGX / IBL reference math consumed by both the GPU shaders and `displayobject-skia` — or stay descriptor-only with the math in renderer backends? This is the difference between authoritative material _library_ and material _descriptor_ library, and it has direct Rust-conformance weight (structural-forks A; the Wasm-mixable-leaf question in fork D names material/color math as a mixable candidate). The status report flags it as the #1 design call; the review correctly does not act on it.
2. **Where do `LinearColor` / `HslColor` / `HsvColor` (and a future color tier) live** — in `@flighthq/types` as shared scratch types, and/or does the color half graduate to a dedicated `@flighthq/color` neighbor? The package is already half a color library; this decision is the gate on the first Backlog item.
3. **OKLab / OKLCH perceptual tier** — in-package or in the `color` neighbor above. Pure math, no blocker, but a scope choice.
4. **Materials serialization / a `materials-formats` triad cell** — the map-handle ↔ resource-id seam shape, and whether glTF `material` import is a `materials-formats` package or belongs to `resources`. Plurality guard: don't pre-create the cell until ≥2 formats appear.
5. **`KHR_texture_transform` and the full extension-parity set** (dispersion, diffuse-transmission, emissive-strength as a first-class field, unlit round-trip) — which extensions are in scope, given each may touch `@flighthq/types`.
6. **Rust conformance posture** — when `flighthq-materials` catches up, and whether the existing Rust name drifts (`equals_material_by_kind`, `create_color_transform_from`) are sanctioned in the divergence map or renamed as bugs.

## Roadmap seed absorbed

`tools/agents/docs/reviews/maturation/depth/materials.md` (the prior Bronze/Silver/Gold roadmap) is fully absorbed into this assessment: its Bronze and most-of-Silver items were verified _already landed_ in this bundle (review.md confirms), and its remaining Silver/Gold items are now sorted into Backlog / Open directions above. The one-time seed file can be removed.

## Approved

_None. Approval is the user's verbal gate; this section is frozen on approval only._
