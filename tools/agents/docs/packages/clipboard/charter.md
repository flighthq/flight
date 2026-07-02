---
package: '@flighthq/clipboard'
crate: flighthq-clipboard
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clipboard — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

System clipboard transport across data flavors — plain text, HTML, RTF, image, bookmark/URL, files, and arbitrary MIME formats — behind a swappable `ClipboardBackend`. The package follows the suite's command-capability shape (`getClipboardBackend` / `setClipboardBackend` / `createWebClipboardBackend`) and additionally carries an event surface via the `ClipboardWatch` change-event entity (`createClipboardWatch` / `attachClipboardWatch` / `detachClipboardWatch` / `disposeClipboardWatch`), implementing the suite's event-entity pattern. The generic MIME format seam (`readClipboardFormat` / `writeClipboardFormat` / `hasClipboardFormat` / `getClipboardFormats`) is the floor; named-flavor functions are convenience over it. Clipboard owns the pasteboard transport — moving flavored data in and out of the system clipboard. It does not own the data types it carries (pixel buffers belong to `@flighthq/surface`). Drag-and-drop is a separate capability.

## Decisions

- **[2026-07-02] Fix `ClipboardFormat` constant usage.** The `ClipboardFormat` constants are defined in `@flighthq/types` but the implementation uses hardcoded MIME strings instead of referencing them. Fix to use the defined constants throughout.

## Open directions

1. **Image model: data-URL string vs `@flighthq/surface`.** Should clipboard images route through `@flighthq/surface` (caller-supplied `out: Surface`, type-only dependency from `@flighthq/types` to stay tree-shakable) or stay data-URL strings? If a `Surface` path lands, are the data-URL functions deprecated or kept as a permanent web-convenience layer?
2. **Scope of the seam.** Are secondary pasteboards (`ClipboardScope`: `'system' | 'selection' | 'find'` — Linux PRIMARY, macOS find pasteboard), binary buffers, and lazy/promised rendering in scope, or is "the system clipboard, all flavors" the boundary?
