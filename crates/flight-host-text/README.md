# flight-host-text

`flight-host-text` is Flight's opt-in, Rust-only font-loading, shaping and glyph-raster service. It
is a workspace member outside `default-members`; a root default build does not resolve or compile
its text backings. It is outside `flight-sdk` and has no FFI or aggregate-native feature.

## Capability fit

The existing host records divide the service into byte loading, text shaping and codepoint-keyed
glyph rasterization. `rustybuzz` fits the shaping record because it returns glyph identifiers,
source clusters, advances and offsets after OpenType GSUB/GPOS. `ttf-parser` fits face selection,
variations, metrics, cmap/name lookup and outline extraction. Flight's existing
`GlyphOutlineSource` adapter performs the final straight-alpha RGBA8 rasterization. WOFF input is
normalized through `flight-font-formats`; WOFF2 is rejected because the existing portable reader
does not currently expose a complete reconstructed font to a shaper.

| Existing capability slot | Filled | Backing and limits |
| --- | --- | --- |
| `HostFontCapabilities.loader` byte source | yes | bounded SFNT/TTC/WOFF bytes; URLs are not fetched |
| loader discovery/name lookup | `system-discovery` feature | bounded deterministic scan of configured roots |
| `HostTextShaperCapabilities.shaper.measure_text` | yes | same rustybuzz run used by direct shaping |
| shaper `shape_run` | yes | rustybuzz GSUB/GPOS; existing callback carries direction/script and `TextFormat` variations |
| shaper language/features | direct host function | `TextShaperOptions`; the existing `shape_run` callback has no language/features fields |
| shaper metrics/cmap/name | yes | ttf-parser; glyph-only callbacks select the most recently loaded face because those slots carry no family |
| `HostGlyphCapabilities.rasterizer` | yes | ttf-parser outlines through Flight's `GlyphOutlineSource` RGBA rasterizer |
| raster variations | no | `GlyphRasterizeOptions` carries no variation coordinates |
| URL/network font loading | no | no I/O callback or fetch policy exists in the font-loading contract |
| WOFF2 | no | no complete reconstructed-font carrier is exposed to the shaper |

The headless Flight glyph atlas accepts Unicode code points while a shaped run carries glyph IDs.
Latin code points can traverse loading, shaping, rasterization, atlas packing and bitmap readback,
and this crate tests that path against the direct RGBA result. The backend builds one bounded,
immutable reverse cmap when a face is loaded; repeated glyph-to-codepoint queries use that cache.
A general complex-script draw path still lacks a glyph-ID rasterization carrier/function between
`ShapedGlyph.glyph_id` and the codepoint-keyed atlas; this crate does not reverse-map substituted
glyphs or invent a renderer.

Every replaceable third-party type is confined to `opentype_backend.rs`. Public operations and
state use Flight records, plain host values and opaque `FontFaceHandle`s only. There is no native
aggregate or FFI exposure.

## Ownership, bounds and disposal

The host owns its capability groups, a bounded registry of Flight `FontFace` values, immutable
font bytes hidden behind each face's opaque handle and one liveness token. Getters borrow capability
groups. Loaded faces and retained callbacks may outlive the host value, but callbacks fail closed
after `dispose_text_host` or `Drop`. Disposal is idempotent and clears the registry; memory is freed
when the final face/callback reference is dropped.

Defaults cap one encoded font and one decoded WOFF at 32 MiB, WOFF directories at 4,096 tables, a
registry at 64 faces, discovery at 4,096 traversed entries, reverse cmap parsing at 4,096 groups and
262,144 mapping operations, font size at 512 pixels and one glyph at four million pixels. Reverse
cmap loading checks the work for format 2 and format 4 before enumerating their mappings. Format 4
segments must be ordered and non-overlapping. Size arithmetic is checked. WOFF headers, directory
ranges and reconstructed size are validated before
inflation; identical compressed streams are inflated only once. A load explanation performs only
the bounded container preflight, so it never parses a face or inflates WOFF payload data.

Shaping and rasterization never write a last-error slot: each sentinel has a pure
`explain_text_host_*` probe. Output coordinates use a y-down convention for both offsets and
advances. Horizontal `advance_width` is the sum of x advances; top-to-bottom `advance_width` and
direct shaping results use y advances, and letter spacing follows the corresponding advance axis.
A mapped glyph with no outline, such as a space, rasterizes to a valid 0-by-0 bitmap while retaining
its advance; missing mappings and resource-limit rejection remain distinct failures.

## Discovery and threads

Byte loading works with `--no-default-features`. The default `system-discovery` feature scans the
configured directories in sorted order without following symbolic links. The discovery cap counts
every traversed directory entry, not only readable font files. Defaults are the common system font
roots on Linux, macOS and Windows; callers can replace them. Missing roots, unreadable files and
unavailable discovery are ordinary explained outcomes.

All records and callbacks are `Send + Sync`; work runs synchronously on the calling thread. The
host creates no workers, executor, process singleton, module-level mutable state or thread-affine
resource.
