# TS↔Rust Alignment: @flighthq/texture

**Verdict:** Fully aligned — all 11 TS exports map 1:1 to `flighthq-texture` with matching names, filenames, and out/sentinel/clone conventions; no drift to record.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `cloneTexture` / `texture.ts` | `clone_texture` / `texture.rs` | None |
| `copyTexture` / `texture.ts` | `copy_texture` / `texture.rs` | None — `out: TextureLike` → `out: &mut Texture`; alias-safe (reads into locals before writing) |
| `createTexture` / `texture.ts` | `create_texture` / `texture.rs` | None — `opts?` → `Option<&TextureOptions>` |
| `isTextureReady` / `texture.ts` | `is_texture_ready` / `texture.rs` | None — `is_` prefix preserved; `image !== null` → `image.is_some()` |
| `setTextureImage` / `texture.ts` | `set_texture_image` / `texture.rs` | None — `image \| null` → `Option<ImageResource>` |
| `cloneSampler` / `sampler.ts` | `clone_sampler` / `sampler.rs` | None |
| `copySampler` / `sampler.ts` | `copy_sampler` / `sampler.rs` | None — alias-safe |
| `createSampler` / `sampler.ts` | `create_sampler` / `sampler.rs` | None — `opts?` → `Option<&SamplerOptions>` |
| `equalsSampler` / `sampler.ts` | `equals_sampler` / `sampler.rs` | None — `null \| undefined` operands → `Option<&Sampler>`; both-absent → `false` preserved |
| `cloneCubeTexture` / `cubeTexture.ts` | `clone_cube_texture` / `cube_texture.rs` | None — file basename tracks (`cubeTexture` → `cube_texture`) |
| `createCubeTexture` / `cubeTexture.ts` | `create_cube_texture` / `cube_texture.rs` | None — `opts?` → `Option<&CubeTextureOptions>` |

Extra Rust items (`TextureOptions`, `SamplerOptions`, `CubeTextureOptions`) are not functions and are not drift: they are the established port idiom for the TS `Readonly<Partial<…Like>>` constructor-overrides argument (used identically across `camera`, `lighting`, `mesh`, etc.), documented in this crate's `lib.rs`. `npm run rust:conformance` reports `texture | 11 | 11 | 18 | 0` (11/11 matched, 0 missing); the count-18 surplus is these three structs plus per-file test items, not unported/extra public functions.

## In sync

- **Package→crate name:** identity (`@flighthq/texture` → `flighthq-texture`). The crate exists only via the `world → scene` 3D-pipeline rename already recorded in the divergence map (conformance.md line 37) — `texture` itself needs no separate entry.
- **All 11 exported functions** present, 1:1, camelCase→snake_case with full type words preserved; no abbreviation, no rename-without-reason, no missing port, no extra public function.
- **Filenames** all track their TS counterparts (`texture.ts`/`sampler.ts`/`cubeTexture.ts` ↔ `texture.rs`/`sampler.rs`/`cube_texture.rs`), and `index.ts` ↔ `lib.rs` re-export the same symbol sets.
- **Conventions carry across:** `out`-param functions (`copyTexture`/`copySampler`) → `&mut` and stay alias-safe; nullable inputs/returns → `Option`/`bool`; no teardown verbs in this crate (plain value-typed entities, GC-managed in TS, `Clone` in Rust — `clone_*` correctly chosen over `dispose_*`/`destroy_*`).
- **Defaults match exactly:** sampler (`anisotropy 1`, `linear`/`linear-mipmap-linear`, `clamp-to-edge`, mipmaps on), texture (`srgb`, null image, identity uv-transform), cube (six null faces, `srgb`). `colorSpace` `'srgb'`/`'linear'` ↔ `TextureColorSpace::Srgb`/`Linear`.
- **No divergence-map action needed.** No texture-specific entry is missing, and no existing entry is stale.
