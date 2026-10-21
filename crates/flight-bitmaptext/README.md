# flight-bitmaptext

Glyph-source-backed bitmap text layout, page-local atlas regions, retained instance buffers, dynamic
glyph-placement refresh, and opt-in diagnostics. The crate performs no rasterization, shaping, GPU
upload, renderer selection, native font access, file access, or network access.

## Precision

- Guard clocks use `f64` millisecond timestamps required by `flight-log`.
