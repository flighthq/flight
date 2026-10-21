# flight-bitmap

CPU pixel operations on RGBA `Bitmap` data: compositing, filters, resampling, gradients, noise, fingerprints and readback.

## Precision

Every `f64` item is declared with `allow(f64)`; `cargo run -p cargo-flight-lint -- allows --crate flight-bitmap --rule f64` lists all of them (including private helpers). Public items:

- `transform_bitmap` (bitmap_affine.rs): resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1).
- `blur_bitmap_pixels_horizontal` (bitmap_blur.rs): integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does.
- `blur_bitmap_pixels_vertical` (bitmap_blur.rs): integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does.
- `get_bitmap_mismatch` (bitmap_compare.rs): pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps.
- `get_bitmap_coverage` (bitmap_coverage.rs): pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps.
- `trim_bitmap` (bitmap_crop.rs): mirrors TS RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle.
- `displace_bitmap` (bitmap_displacement.rs): resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1).
- `compare_bitmap_fingerprints` (bitmap_fingerprint.rs): pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps.
- `create_bitmap_fingerprint` (bitmap_fingerprint.rs): integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does.
- `fill_bitmap_noise` (bitmap_noise.rs): value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1).
- `fill_bitmap_perlin_noise` (bitmap_noise.rs): value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1).
- `fill_bitmap_turbulence` (bitmap_noise.rs): value/Perlin lattice hashing and octave sums in double to reproduce TS noise bytes; f32 sufficiency not yet confirmed (D1).
- `pixelate_bitmap` (bitmap_pixelate.rs): integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does.
- `get_bitmap_color_bounds_rectangle` (bitmap_query.rs): mirrors TS RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle.
- `resize_bitmap` (bitmap_resize.rs): resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1).
- `rotate_bitmap` (bitmap_rotate.rs): resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1).
- `warp_bitmap` (bitmap_warp.rs): resampling coordinates and weights kept in double (TS number) so Math.round/floor boundaries match TS bytes; f32 sufficiency not yet confirmed (D1).
- `warp_bitmap_quad` (bitmap_warp.rs): perspective homography solve (8x8 linear system / 3x3 inverse) needs double precision.
- `BitmapMismatch` (types.rs): BitmapMismatch.fraction mirrors TS number; pixel-count ratio exceeding f32 exact range.
- `RectangleLike` (types.rs): mirrors TS RectangleLike (number) pixel bounds; D8 candidate for flight-geometry Rectangle.
