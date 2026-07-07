---
package: '@flighthq/scene-formats'
updated: 2026-07-03
basedOn: ./review.md
---

# scene-formats — Assessment

See [charter](./charter.md) for blessed direction. Sorted from the 2026-07-03 review (stub, 18/100). The charter's priority Decision — expand glTF coverage, since partial support is not useful — makes most of the review's glTF build-out sweep-safe within-package work: the existing slice is well-shaped and grows rather than restructures. Parked items are those needing the `mesh` vertex-layout expansion, a cross-package seam, or a charter Open direction (export/serialize naming, USD scope, streaming).

## Recommended

1. GLB (`.glb`) container parsing — the 12-byte header + JSON/BIN chunk walk. The dominant distribution form; without it the importer fails on most real assets.
2. `byteStride` de-striding and `normalized` integer attribute handling in `readAccessor` — silent-corruption correctness holes today (strided assets read garbage; normalized UBYTE/USHORT decode wrong).
3. Multi-primitive meshes — import every `primitives[]` entry, not just `[0]`; multi-material meshes currently drop geometry silently.
4. Import `TANGENT` into the existing canonical-layout slot when present (stop zero-filling), falling back to zero-fill otherwise.
5. Core-spec materials/textures/samplers import — parse `materials`/`textures`/`images`/`samplers` and map metallic-roughness onto `@flighthq/materials` + `@flighthq/texture` (both exist and are the natural targets). The single largest visible-output gap: every import renders untextured.
6. Animations import into the `@flighthq/animation` core — glTF channel/sampler/clip map straight onto `AnimationTrack`/`AnimationChannel`/`AnimationClip` with `SceneAnimationTarget` (the blessed 3D pipeline architecture calls this mapping out as non-speculative; the sampler is already glTF-conformant, and accessors slot in zero-copy).
7. Validation and diagnostics: check `asset.version`; return a sentinel (with warning) on malformed JSON instead of a raw `JSON.parse` throw; warn on non-triangle primitive `mode`; warn when `extensionsRequired` names an unsupported extension.
8. OBJ/MTL importer — charter Decision 2026-07-03 ("the home for all 3D file format parsing"); cheap, high value for test assets, and justifies the plural package name.
9. Narrow the public schema surface — export `GltfDocument` from the barrel and keep the remaining `Gltf*` wire types internal (they are format-internal, not cross-package SDK types).

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
