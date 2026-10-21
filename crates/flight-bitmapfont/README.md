# flight-bitmapfont

Static bitmap-font entities, glyph-source adapters, live-glyph-atlas snapshots, diagnostics, and
coverage/byte summaries. The crate retains caller-owned texture-atlas, glyph, and metrics identities;
it performs no GPU upload, native font work, file access, or network access.

## Precision

- Kerning keys use `u64` arithmetic with a `0x110000` radix so every Unicode pair remains distinct.
- Guard clocks use `f64` millisecond timestamps required by `flight-log`.
