---
package: '@flighthq/scene-formats'
updated: 2026-07-03
basedOn: ./review.md
---

# scene-formats — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (stub, 18/100). The charter's priority Decision — expand glTF coverage, since partial support is not useful — makes most of the review's glTF build-out sweep-safe within-package work: the existing slice is well-shaped and grows rather than restructures. Parked items are those needing the `mesh` vertex-layout expansion, a cross-package seam, or a charter Open direction (export/serialize naming, USD scope, streaming).

_Items 1–4, 7, 9 of the original list landed 2026-07-09 (`771bf232`): GLB container parsing (`createSceneFromGlb`), `byteStride`/`normalized` accessor correctness, multi-primitive meshes, TANGENT import, validation/diagnostics (version check, no-throw sentinel on malformed JSON, non-triangle-`mode`/`extensionsRequired` warnings), and the `GltfDocument`-only barrel narrowing — plus a latent `decodeBase64` high-byte fix. Remaining:_

1. Core-spec materials/textures/samplers import — parse `materials`/`textures`/`images`/`samplers` and map metallic-roughness onto `@flighthq/materials` + `@flighthq/texture`. The largest visible-output gap: every import renders untextured. **Cross-package — needs a direction for the material/texture mapping.**
2. Animations import into the `@flighthq/animation` core — glTF channel/sampler/clip map onto `AnimationTrack`/`AnimationChannel`/`AnimationClip` with `SceneAnimationTarget`. **Cross-package — needs a direction.**
3. OBJ/MTL importer — charter Decision 2026-07-03 ("the home for all 3D file format parsing"); cheap, high value for test assets. Within-package, sweep-safe.
4. Sparse accessors + external `.bin`/image URI resolution — parked correctness gaps flagged during the 2026-07-09 pass.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Skins and morph targets** (`skins`, `targets`/`weights` → `@flighthq/skeleton`). _Parked — cross-package: needs `JOINTS_0`/`WEIGHTS_0` in `mesh`'s vertex layout and skeleton's SkinnedMesh Open direction._
- **`COLOR_0` / `TEXCOORD_1` / `JOINTS_0` / `WEIGHTS_0` attribute coverage.** _Parked — cross-package: requires expanding `mesh`'s canonical vertex layout beyond position/normal/tangent/uv0._
- **External buffer/image URI resolver** (`scene.bin` references; only embedded base64 decodes today). _Parked — design decision: injected async resolver vs pre-fetched buffer map vs `@flighthq/loader` integration changes the import seam's sync/async shape._
- **Extension-handler registry** with `KHR_lights_punctual` / `KHR_materials_*` as first entries. _Parked — the registry mechanism follows the SDK's registry-by-default rule, but extension scope is the explicit open dial in the blessed 3D pipeline architecture, settled as the package is built._
- **Cameras and punctual lights import.** _Parked — no scene home: cameras and lights are draw-arguments, not scene members, per the blessed architecture; needs the optional `CameraNode`/`LightNode` decision or an import-result shape carrying them alongside the `Scene`._
- **Export direction** (`createGltfFromScene` / serializer) and the import-export pair vocabulary. _Parked — design decision; charter Open direction, and the naming rides the scene-serialization naming fork; candidate Open direction for the charter._
- **USD.** _Parked — charter Open direction: full USD vs USDZ-only._
- **Streaming/progressive parsing.** _Parked — charter Open direction._
- **`CANONICAL_LAYOUT` shared export.** _Parked — cross-package: the constant duplicates one `mesh` keeps private ("kept in sync structurally" is a drift trap); `mesh` or `types` should export it and this package consume it._
- **`decodeBase64` shared home.** _Parked — cross-package: other packages (`image`) plausibly need the same primitive; extract-the-missing-primitive applies._
- **`createMesh(...) as unknown as SceneNode` double-cast.** _Parked — cross-package: the fix is in the type hierarchy owned by `scene`/`mesh`/`types` (`Mesh` should be a `SceneNode` family member without `unknown`)._
- **Standardize the `warnings` out-array diagnostics channel.** _Parked — cross-package convention: invented here; should be typed once if it spreads to other codecs._

## Approved

None.
