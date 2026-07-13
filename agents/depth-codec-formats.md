# Depth Review: Codec Formats Cluster

_2026-07-13. Cross-package findings from the depth review of: image-codec, texture-formats, tilemap-formats, path-formats, shape-formats, path-boolean, binpack. Per-package review.md and assessment.md files are in their respective `agents/packages/<name>/` cells._

## Per-Package Scores

| Package | Score | Tier | Key Finding |
|---------|-------|------|-------------|
| `path-boolean` | 85 | solid | No open-path clipping (blocked on flattenPath closedness); deflation instability on dense/round-join rings |
| `path-formats` | 74 | solid | No explain\* for sentinels; appendSvgPathData can leave half-appended path on failure; writer absolute-long-form only |
| `binpack` | 74 | solid | Only BSSF heuristic; no online/incremental packing; no occupancy metric |
| `image-codec` | 70 | solid | AVIF unreachable via sniffing; no explain\* queries; web encoder silent PNG fallback |
| `texture-formats` | 68 | solid | parseBasis field offsets untested against real files; no explain\* diagnostics |
| `tilemap-formats` | 68 | solid | Fidelity holes (object rotation/visible, layer tint/parallax, hex/stagger); serialization TMX-only |
| `shape-formats` | 62 | partial | No arity/type validation on parse; round-trip test covers 9 of 15 non-bitmap keys |

## Cross-Package Findings

### Stale Package Map Lines

The codebase map (`agents/index.md`) has several inaccurate lines for this cluster:

- `image` claims re-export of `detectImageMimeType` from image-codec — false (2026-07-09 charter decision rules it out)
- `glyphatlas` claims "binpack-backed batch repack" — false (binpack has zero in-repo consumers)
- `texture-formats` line omits ATF + `selectTextureContainer`
- `tilemap-formats` line misses the faithful-document/projection split + `formatTiledTmx`
- `path-formats` line omits `appendSvgPathData`
- `path-boolean`'s "full AAA set" overstates vs Clipper2

### Charter Drift

- `path-boolean` and `shape-formats` charters cite stale dependency lists
- `tilemap-formats`' "dropped-with-warning" decision landed as silent all-zero (no diagnostics)
- `texture-formats`' ATF identify-only decision is unimplemented; needs a `TextureContainerFormat` vocabulary ruling

### Cross-Package Unlocks

- `path`'s `flattenPath` losing per-subpath closedness blocks `path-boolean` open-path clipping
- `shape` lacks a public `forEachShapeCommand` iterator (shape-formats coupled to raw buffer)
- `ImageEncoder` type needs a failure channel
- `sprite`'s `TilemapData` has no per-tile flip capacity for Tiled GID flips

### Duplication Signal

`glyphatlas`' self-owned shelf packer is live demand-evidence for `binpack`'s chartered online-allocator direction.
