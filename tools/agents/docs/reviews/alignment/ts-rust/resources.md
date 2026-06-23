# TS↔Rust Alignment: @flighthq/resources

**Verdict:** Crate name and core entity API map cleanly; the 18 TS-only functions are correctly browser-relocated, but Rust adds a family of native loaders and a symmetric `dispose_*`/`has_*_data`/`set_image_resource_data` surface that is plausible native conformance work yet is **not recorded in the divergence map** — silent drift the conformance script is structurally blind to.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `setImageResourceSource` (`imageResource.ts`) | `set_image_resource_data` (`image_resource.rs`) | Renamed AND re-semantic. TS sets a DOM `CanvasImageSource`; Rust sets raw pixel data (no DOM substrate). The `Source`→`data` word swap is a deliberate divergence but is not in the conformance map. Conformance script reports `setImageResourceSource` as a web-relocated TS-only function and never sees the `set_image_resource_data` replacement. |
| `hasImageResourceSource` (`imageResource.ts`) | (no port; `has_image_resource_data` is the port of `hasImageResourceData`) | TS-only (DOM source presence). Correctly browser-relocated per conformance.md L119; flagged here only to note the source/data pair collapses to data-only natively. |
| — (no TS counterpart) | `load_image_resource_from_bytes` / `_from_path`, `load_audio_resource_from_bytes` / `_from_path`, `load_font_from_bytes` / `_from_path`, `load_font_resource_from_bytes` / `_from_path`, `load_texture_atlas_from_bytes` / `_from_path`, `load_tileset_from_bytes` / `_from_path`, `load_video_resource_from_path` | Rust-only native loaders (the std/`from_path` + in-memory `from_bytes` analogues of TS's DOM-bound `*FromBlob`/`*FromBase64`). Follows the documented native-default pattern (rust/index.md L77, `std::fs`), but no resources-specific entry records that these are the native substitutes for the relocated browser loaders. |
| — (no TS counterpart) | `dispose_audio_resource`, `dispose_font_resource`, `dispose_video_resource` (resp. files) | Rust-only. TS defines `dispose*` only for the image resource. Rust extends the teardown verb symmetrically across audio/font/video. Reasonable, but invented surface not present upstream and not in the map. |
| — (no TS counterpart) | `has_audio_resource_data`, `has_video_resource_data`, `has_font_resource_face` (resp. files) | Rust-only `has_*` predicates. TS has only `hasImageResourceData`/`hasImageResourceSource`. `has_font_resource_face` is a Rust-native concept (font face presence) with no TS analogue. Undocumented additions. |
| `imageResource.ts` + `imageResourceFrom.ts` (split) | `image_resource.rs` (single file) | Filename divergence: every TS `<x>From.ts` loader file is folded into its base `<x>_resource.rs`. Consistent across all six families (audio/font/image/textureAtlas/tileset/video). Basename tracks the entity; the `*From` split simply does not exist in Rust. Acceptable Cargo-local layout choice, worth a one-line note. |
| `createAudioResourceFromURLs`, `createVideoResourceFromURLs`, `loadFontFromURLs`, `loadFontResourceFromURLs`, `loadAudioResourceFromURLs`, `loadVideoResourceFromURLs` | `..._from_urls` (resp.) | In sync. `URLs`→`urls` is the correct camelCase→snake_case mapping; the apparent diff is a casing artifact only. |

## In sync

- **Crate name** `flighthq-resources` ↔ `@flighthq/resources` — identity, not in any rename row of the conformance map. Correct.
- **TextureAtlas / TextureAtlasRegion / Tileset core API** — full 1:1: `add_texture_atlas_region`, `add_texture_atlas_region_rectangle`, `add_texture_atlas_region_rectangle_xy`, `add_texture_atlas_region_vector2`, `create_texture_atlas`, `create_texture_atlas_region`, `set_texture_atlas_region`, `create_tileset`, `create_tileset_from_atlas`, `create_tileset_from_image_resource`, `build_tileset_regions`, `create_texture_atlas_from_image_resource`. Full type words preserved, no abbreviation.
- **Image resource core** — `create_image_resource`, `clone_image_resource`, `has_image_resource_data`, `is_image_resource_empty`, `invalidate_image_resource`, `dispose_image_resource`, `detect_image_mime_type` all match TS with correct verbs and `&mut`/`Option` conventions (`detect_image_mime_type` → `Option<&'static str>` mirrors TS `string | null`).
- **Loaders that have a native substrate** — `load_*_from_array_buffer` and `load_*_from_url` map 1:1 across image/texture-atlas/tileset/font/audio/video.
- **Constructors** — `create_audio_resource`, `create_font`, `create_font_resource`, `create_video_resource`, plus the `*_from_url`/`*_from_urls` family.
- **The 18 TS-only functions** (`create*FromCanvas`/`FromImageBitmap`/`FromImageElement`, `load*FromBase64`/`FromBlob`, `getAudioContext`, `hasImageResourceSource`, `isImageResourceSameOrigin`, `setImageResourceSource`, `loadFontFromName`, `loadFontResourceFromName`) are all DOM/Web-Audio-substrate bound and correctly out of native-core scope per conformance.md L119 (browser-validated in `host-web`). Not gaps.
- **Teardown verbs** — `dispose_*` used throughout (no `destroy_*`); appropriate since resources are GC/buffer-backed, not GPU-handle owners.

## Suggested divergence-map additions

The conformance script's structural check is presence-only (TS→Rust) and explicitly "blind to extra Rust functions" (conformance.md L16), so none of the Rust-only surface below is gated or surfaced. Add a `resources` note to the divergence map recording:

1. The native-loader family `load_*_from_bytes` / `load_*_from_path` as the in-box substitutes for the relocated browser loaders (`*FromBlob`/`*FromBase64`/`*FromCanvas`), tied to the rust/index.md L77 native-default rule.
2. `setImageResourceSource` → `set_image_resource_data` as an intentional rename + semantic shift (DOM element → raw pixel data) given no DOM substrate.
3. The symmetric Rust-only teardown/predicate surface (`dispose_audio/font/video_resource`, `has_audio/video_resource_data`, `has_font_resource_face`) — either record it as deliberate native symmetry, or reconsider whether TS should gain the same symmetry upstream (TS being authoritative, the asymmetry is arguably a TS gap rather than Rust drift).
