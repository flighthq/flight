---
package: '@flighthq/texture'
updated: 2026-08-08
by: principal
---

# texture — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/texture/src/` and `packages/types/src/` on 2026-08-08. Stage names are
from [`agents/texture-source-model.md`](../../texture-source-model.md); M2–M5 have landed, so only the
stages below are still open in this tree.

- **M6 is unstarted.** No `Surface`, `HostSurface`, or `destroySurface` exists anywhere in `packages/`.
  A canvas is therefore still indistinguishable from a read-only `<img>`: both arrive as an `Image`
  through `createImageResourceFromCanvas` / `…FromImageElement`, as at
  `packages/textureatlas/src/textureAtlasFrom.ts:17` and `:29`.
- **M7 is unstarted.** `createVideoTexture` (`videoTexture.ts:32`) still puts a modifier in the subject
  slot of a type that does not exist, and there is no `createTextureFromCompressedImage` — compressed
  content is assembled into `createTexture({ source })` by the caller.
- **M10 is unstarted.** Every content slot is nullable: `Texture2D.source` and the `'3d'` source
  (`packages/types/src/Texture.ts:36`, `:47`) and each cube face (`:14-22`, whose own comment calls the
  null a transitional sentinel).
- **Four of the video exports are pass-throughs.** `cloneVideoTexture` (`:20`), `copyVideoTexture`
  (`:25`), `getVideoTextureInverseUvMatrix` (`:49`), and `getVideoTextureUvMatrix` (`:55`) delegate
  wholly to the Texture equivalents and are labelled "compatibility entry" in source. Video is a
  cadence over a plain `Texture2D`, so these are a second name for one behavior.
- **`VoxelGrid` has no constructor.** `invalidateVoxelGrid` (`voxelGrid.ts:4`) is the package's only
  VoxelGrid export and `createVoxelGrid` exists nowhere in `packages/`, so a `'3d'` texture's source
  can only be hand-assembled — the D5 gap, on the dimension that still has it.
- **There is no `invalidateTexture` verb.** `version` is bumped inline by `setTextureSource`
  (`texture.ts:306`), `setCubeTextureFace` (`cubeTexture.ts:60`), and `advanceVideoTexture`
  (`videoTexture.ts:14`), against an invalidation doctrine that names `invalidate<Type>` as the verb.
- **`equalsTexture` compares `version`** (`texture.ts:182`) while its own doc comment (`:164`) lists the
  compared fields and omits it — two textures describing identical state but carrying different
  revision counters compare unequal.
- **`setCubeTextureFace` writes through `as unknown as`** (`cubeTexture.ts:58`) because
  `TextureSourceCubeFaces` is a `readonly` 6-tuple that is mutable at runtime by construction.
- **`Texture` carries no `format` or `mipPolicy`** (`packages/types/src/Texture.ts:26-32`); upload
  format and mip policy are each backend's own decision.
- **No guard or `explain*` module** exists in this package, so `getTexture{Width,Height}`'s `-1`
  (`texture.ts:188`, `:249`) and `getTextureSourceKind`'s `null` (`:210`) have no pull query.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Most of the old deferral list checked out
  **false**, the largest being the `VideoTexture` entity itself: the file described "a
  `VideoResource`-backed source … plus a monotonic `frameId`", and no such type or field exists — video
  is a `Texture2D` over an `Image`, dirty-tracked by `version` (`videoTexture.ts:10-17`), exactly as the
  model doc rules. Also dropped: the uv-transform helpers as unimplemented (`getTextureInverseUvMatrix`
  `texture.ts:198`, `transformTextureUv` `:371`, `resetTextureUvTransform` `:282` all exist), the
  `crates/flighthq-texture` mirror (no `crates/` directory in this repo), the `@flighthq/resources`
  dependency (package deleted), `texture-formats` as blocked (the package exists with ATF/container
  parsers), `version`/dirty tracking as deferred (`TextureCommon.version`), and the geometry
  `inverseMatrix3` affine bug — that branch is column-major by its own comment
  (`packages/geometry/src/matrix3.ts:132`) and derives the translation from the inverted linear part at
  `:164-165`, so the row-major reading behind the report does not hold.
- **2026-07-24** — WebGPU compressed upload reached GL parity through an opt-in uploader plus optional
  RGBA decode; 2D/cube/array containers covered, generic binder still 2D.
- **2026-07-22** — Named the compressed-texture shape boundary: a low-level container upload is not an
  end-to-end Texture capability.
- **2026-07-19** — Video sources landed alongside still images, with the per-frame GL upload in
  `render-gl` and material binding through `UnlitMaterial.baseColorVideoMap`.
- **2026-06-25** — uv-transform helper set completed; unused `@flighthq/resources` dependency dropped.
- **2026-06-24** — Cube/texture symmetry pass: `equals*`, `copyCubeTexture`, face accessors, uv matrix,
  and the sampler presets.
