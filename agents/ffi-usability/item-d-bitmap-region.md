# Item D: BitmapRegion shared ownership

Design: `agents/ffi-usability.md` section 3. The owner approved changing the frozen `agents/rust/manifests/flight-bitmap.api` for this on 2026-11-18. This replaces flight-hx patch 0009.

## Goal

A `BitmapRegion` is a rectangle into a shared bitmap, as in TypeScript. Any number of regions may reference one bitmap, writes through a region are visible to every holder, and in-place operations work. Proves scenario G5.

## The defect

`crates/flight-bitmap/src/types.rs:186` declares `pub bitmap: Bitmap` inline. Consequences on current code:

- `create_bitmap_region` and `set_bitmap_region` move the bitmap in (`bitmap_region.rs:39`, `:56`).
- `is_same_region` compares inline bitmaps by address (`bitmap_flip.rs:138`) and is never true.
- The 20 destination-and-source functions clone the whole source buffer defensively (`bitmap_copy.rs:56,88`, `bitmap_alpha.rs:56`, `bitmap_flip.rs:50`, `bitmap_palette_map.rs:61`, and others).
- The Rust "in place" test passes a clone (`tests/bitmap_flip_test.rs:42-51`), so aliasing is untested.
- `flight-glyphatlas` holds `Ref<Bitmap>` and writes pixels by hand (`glyph_atlas_entry.rs:65-76`) where TypeScript uses `createBitmapRegion` + `writeBitmapPixels`.
- `flight-bitmap-wasm/src/lib.rs:535` copies in and copies back.

## What to build

1. **Type.** `pub bitmap: Ref<Bitmap>`. Update the doc comment: it currently justifies the inline form.
2. **Factory.** `create_bitmap_region(bitmap: &Ref<Bitmap>, x, y, width, height)` and `set_bitmap_region` share the `Arc`; the caller keeps its bitmap.
3. **One access helper.** All locking lives in crate-private helpers, not in the operation bodies. Operations receive pixel slices plus geometry. Shapes needed:
   - source only → read lock;
   - destination only → write lock;
   - `out: &mut Uint8Array` + source → read lock;
   - destination + source, **different bitmaps** → write lock on destination, read lock on source, acquired in a fixed order (by allocation address) so two threads cannot deadlock; zero copy;
   - destination + source, **same bitmap** (`Arc::ptr_eq`) → one write lock; copy only the source **rectangle** to scratch and read from that.
   - `BitmapDisplacementOptions.map` and any other third region follow the same rule: every distinct bitmap is locked once.
     Recover from lock poisoning consistently with the rest of the crate.
4. **Remove the defensive whole-buffer clones.** After this item, no destination-and-source function clones a full bitmap. The same-bitmap path copies the rectangle only.
5. **`is_same_region`** becomes pointer equality plus rectangle equality, and the in-place fast paths that depend on it become live. Check each one against its TypeScript counterpart.
6. **Overlap semantics.** Keep each operation's documented rule from TypeScript (`bitmapCopy.ts`, `bitmapAlpha.ts`, `bitmapPaletteMap.ts` allow same-bitmap when regions do not overlap; `bitmapAffine.ts` forbids overlap; flip and histogram equalise support identical rectangles). Where the scratch copy makes an overlapping case well-defined, that is acceptable; do not add validation TypeScript does not have.
7. **Callers.**
   - `flight-glyphatlas`: use `create_bitmap_region` + `write_bitmap_pixels` on `runtime.bitmap`, matching TypeScript, and delete the hand-written pixel loop. Watch for a lock held by the caller around the call; the region helper takes the lock itself.
   - `flight-bitmap-wasm`: wrap in a `Ref` and remove the copy-back only if the wasm ABI allows; otherwise keep its copy-in/copy-out and say why.
   - Any `object-api` method forms on regions.
8. **Emitted TypeScript.** Rust is the source and `flight-compiler` emits TypeScript. The emitted `BitmapRegion` shape must stay `{ bitmap, x, y, width, height }` with `bitmap` a plain reference. Regenerate and show that `packages/bitmap` has no behavioural diff beyond what follows from this change; if the compiler maps `Ref<Bitmap>` fields differently from what TypeScript has today, stop and report rather than hand-editing output.
9. **Manifest.** Update `agents/rust/manifests/flight-bitmap.api` for the changed signatures and nothing else.
10. **FFI.** `flight_create_bitmap_region` now takes a `Ref<Bitmap>` handle and shares it. Update `crates/flight-ffi/src/by_value_ownership_test.rs` and `tests/c_consumer/consumer.c` (near line 395), which pin the old consume behaviour. A consumer holding an owned `Bitmap` needs a way to obtain a `Ref<Bitmap>`; confirm one is reachable (Item A's graph) and add the producer in `flight-bitmap` if it is not.

## Tests

- Convert existing region tests from `region(bmp.clone())` to shared bitmaps.
- New aliasing tests, mirroring `bitmapFlip.test.ts:28` and `bitmapHistogram.test.ts:22`: same bitmap with identical rectangles (in place); same bitmap, disjoint rectangles, for copy, copy-alpha and palette-map; two regions on one bitmap where a write through one is read through the other.
- A concurrency test: two threads running destination/source operations on the same pair of bitmaps in opposite roles complete without deadlock.
- A test that a destination-and-source operation on different bitmaps does not allocate a full-size copy (assert through a counting allocator or by structure, whichever the crate already supports; otherwise review by inspection and state that).
- Strict-C scenario **G5**: create one bitmap, two regions on it, fill through one, read through the other, flip in place, free both regions then the bitmap.
- Run the TypeScript `packages/bitmap` and `packages/glyphatlas` tests.

## Not in scope

- Whole-bitmap functions that take `&Bitmap` / `&mut Bitmap` directly.
- The general "type produced both owned and in a `Ref`" lowering question (Item B reports it).
- Performance work beyond removing the full-buffer clones.

## Acceptance

- G5 passes; all aliasing and concurrency tests pass.
- `grep` shows no `.bitmap.data.clone()` left in destination-and-source functions.
- `flight-glyphatlas` uses regions.
- Emitted TypeScript and both languages' tests pass; `npm run api:check` and `npm run check bitmap` / `npm run test bitmap` pass on the TypeScript side.
- `cargo fmt`, lint, `cargo test -p flight-bitmap -p flight-glyphatlas -p flight-bitmap-wasm -p flight-ffi`.

## Dependencies

None on the other items. Independent of A, B and C.
