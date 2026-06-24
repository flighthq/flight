---
package: '@flighthq/clipboard'
crate: flighthq-clipboard
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
draft: true
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# clipboard — Charter

## What it is

`@flighthq/clipboard` is the system-clipboard capability of the platform-integration suite: read and write of the OS pasteboard across data flavors — plain text, HTML, RTF, image, bookmark/URL, files, and arbitrary MIME formats — behind a swappable `ClipboardBackend`. It follows the suite's **command-capability** shape (flat free functions + `getClipboardBackend` / `setClipboardBackend` / `createWebClipboardBackend`), with a lazily-available web/DOM backend so every function works on the web and a native host (Electron today) replacing the seam. It additionally carries a small **event** surface — the `ClipboardWatch` change-event entity — mirroring `@flighthq/network`'s event-entity pattern (`create*`/`attach*`/`detach*`/`dispose*`).

Where it ends: clipboard owns _the pasteboard transport_ — moving flavored data in and out of the system clipboard. It does **not** own the data types it carries. Pixel buffers belong to `@flighthq/surface` / `ImageSource`; it is an open question (below) whether clipboard images route through `Surface` or stay data-URL strings. Drag-and-drop, which shares flavor vocabulary with the clipboard, is a separate capability and not in this package.

## North star (proposed)

_Proposed durable principles, inferred from the design and the structural forks. Confirm or revise._

- **The system clipboard, all flavors, one transport.** The package is complete when every flavor a real OS pasteboard carries is reachable through one consistent seam — not a fixed set of convenience getters. The generic MIME format seam (`readClipboardFormat` / `writeClipboardFormat` / `hasClipboardFormat` / `getClipboardFormats`) is the floor; named-flavor functions are convenience over it, never the only way in.
- **Backend seam, web-by-default, sentinels not throws.** One `ClipboardBackend` trait in `@flighthq/types`; a lazy web backend always available; native hosts swap it via `setClipboardBackend`. Every path guards for missing API / non-secure context / jsdom and returns the documented sentinel (`''` / `false` / `[]` / `{}` / `null` / `-1` / no-op) rather than throwing. This is the suite-wide rule, honored throughout (fork D — the runtime-backend seam).
- **Atomic multi-flavor write.** A "rich copy" (plain + styled + image together) lands in one pasteboard transaction so a paste target picks its best representation. `writeClipboard(items)` is the canonical write; single-flavor writers are shorthand.
- **Self-identifying, alphabetized, types-first surface.** Every export carries the full `Clipboard` word and a correct verb (`read*`/`write*`/`has*`/`get*`/`create*`/`attach*`/`detach*`/`dispose*`); the seam types live in `@flighthq/types`; a single root export, `"sideEffects": false`, no top-level registration.
- **Honest about platform limits.** The web backend never pretends. Where the browser cannot deliver (the unshipped `clipboardchange` event, file flavors, change counts), it degrades to the documented sentinel rather than emulating.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighbors. Confirm or revise — the open directions below carry the genuinely undecided ones._

**In scope (proposed):**

- The system clipboard transport across all flavors: text, HTML, RTF, image, bookmark/URL, files, arbitrary MIME formats.
- Atomic multi-flavor write and batch read.
- The `ClipboardWatch` change-event capability (entity of signals; attach/detach/dispose).
- The web backend (lazy default) and the contract every `host-*` backend implements.

**Non-goals (proposed):**

- Owning the data types it carries (pixel buffers → `@flighthq/surface`; the image-model question is open below).
- Drag-and-drop, even though it shares flavor vocabulary — a separate capability.
- Decoding/encoding flavor payloads beyond what the transport requires (no HTML sanitizer, no image transcoder living here).

**Undecided (parked in Open directions, not yet a boundary):** secondary pasteboards (`ClipboardScope`), binary/buffer flavors, lazy/promised rendering, `getClipboardCapabilities()`.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. This is where the uncertainty lives — an agent asks here rather than assuming._

1. **Image model: data-URL string vs typed `Surface`.** The single highest-value question. Should clipboard images route through `@flighthq/surface` (caller-supplied `out: Surface`, type-only dependency from `@flighthq/types` to stay tree-shakable) or stay data-URL strings? If a `Surface` path lands, are the data-URL functions deprecated or kept as a permanent web-convenience layer? This is the difference between solid and authoritative for the image flavor, and a cross-package dependency decision — relates to fork D's value-leaf `surface` seam.
2. **Dependency posture.** The package gained an `@flighthq/signals` dependency this session (for the `ClipboardWatch` entity), moving it from a `@flighthq/types`-only package to a two-dependency one. The codebase map calls signals "effectively always present," so this is defensible — but it was decided-by-doing without a blessing. Bless it, or move the watch entity to a neighbor so a read-only `readClipboardText` import stays dependency-light? Decide the tree-shake floor.
3. **Scope of the seam.** Are secondary pasteboards (`ClipboardScope`: `'system' | 'selection' | 'find'` — Linux PRIMARY, macOS find pasteboard), binary buffers, and lazy/promised rendering in scope for this package, or is "the system clipboard, all flavors" the boundary with scopes/promised-data parked? The Boundaries section above leaves these undecided. (Fork F — is this domain thin-by-design at its current surface, or under-built toward these axes?)
4. **Atomic-write contract for native hosts.** Should `ClipboardBackend.writeItems` _require_ true atomicity (forcing Electron to add a `clipboard.write({ text, html, rtf })` path) or is per-format looping an acceptable backend-defined fallback? This sets the contract every future `host-*` backend implements.
5. **Binary canonical type.** If buffer flavors land (`readClipboardBuffer` / `writeClipboardBuffer` over Electron's existing `readBuffer`/`writeBuffer`), is `ArrayBuffer` or `Uint8Array` the SDK-canonical binary type for the clipboard — and ideally SDK-wide?
6. **Rust-port timing.** The front matter declares `crate: flighthq-clipboard`, but the crate does not exist yet. Confirm the seam is frozen enough to port Bronze+Silver to `flighthq-clipboard` (native default over `arboard`/`copypasta` behind the `native` feature), or hold until the `Surface` image decision (1) lands to avoid re-porting a moving contract. (Fork D — runtime-backend seam; not a wasm-mixable leaf, being stateful host-bound transport.)
7. **`getClipboardCapabilities()` introspection.** Once scopes and buffers exist, should the package expose a query for which flavors/scopes the active backend supports? Parked until the seam grows.
