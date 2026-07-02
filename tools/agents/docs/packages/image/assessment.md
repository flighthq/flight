---
package: '@flighthq/image'
updated: 2026-07-02
basedOn: status.md
---

# image — Assessment

Verified against the live tree (2 source files, 2 test files, 49 tests, 18 exports) and the direction session (2026-07-02). Six charter decisions blessed — package is at its natural scope ceiling, image-codec blessed as the DOM-free neighbor, byte input standardized on `Uint8Array`.

The package is small, focused, and well-tested (100% export coverage). The only within-package action item is the `ArrayBuffer` → `Uint8Array` migration on `loadImageResourceFromArrayBuffer`.

## Recommended

Sweep-safe: within `@flighthq/image`, no open design decision beyond what the charter has blessed.

1. **Migrate `loadImageResourceFromArrayBuffer` to accept `Uint8Array`.** Per charter Decision #4. Change the `buffer` parameter from `ArrayBuffer` to `Uint8Array`. Rename the function to `loadImageResourceFromBytes` (the old name with `ArrayBuffer` in it would be misleading with a `Uint8Array` parameter). Update the barrel, tests, and any in-package callers. Run `npm run fix`, `npm run packages:check`, `npm run exports:check`.

2. **Update Package Map description for image.** Per charter Decision #5. The Resources section lists `@flighthq/image` without description detail. Add a concise description: ImageResource entity lifecycle — create, clone, dispose, invalidate, DOM-based loading (URL/ArrayBuffer/Base64/Blob), MIME detection, same-origin check.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **`detectImageMimeType` migration to image-codec.** _Parked — image-codec doesn't exist yet._ Per charter Decision #3. When `@flighthq/image-codec` is built, magic-byte detection moves there. Image either re-exports or drops the function.

- **image-codec package creation.** _Parked — new package, needs its own direction session._ Per charter Decision #2. The breadth review has a detailed Bronze/Silver/Gold spec. Key design questions (registry shape, web fallback, worker pool, alpha convention, animation) are image-codec charter questions.

- **Downstream `ArrayBuffer` → `Uint8Array` migration.** _Parked — cross-package._ The rename from `loadImageResourceFromArrayBuffer` to `loadImageResourceFromBytes` will require updating callers in downstream packages (surface, textureatlas, etc.).

- **Rust `flighthq-image` crate.** _Parked — global posture._ Already exists from the resources split (2026-06-25). Function-level parity gap tracked separately.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: loadImageResourceFromArrayBuffer → Uint8Array/rename, Package Map description update
