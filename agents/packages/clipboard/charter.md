---
package: '@flighthq/clipboard'
role: package
crate: flighthq-clipboard
draft: false
lastDirection: 2026-08-29
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# clipboard — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

System clipboard transport across five provider-derived slots on the explicit top-level `Host.clipboard`
group: text/clear, image data URLs, HTML/RTF/arbitrary formats and items, bookmarks, and change events.
Every free operation takes the narrow `HasClipboard*` trait it needs. The Web implementation is the
importable `webClipboardBackend` const in `@flighthq/host-web`; Electron provides text, image, formats,
and bookmarks; Capacitor provides text and image; Tauri provides text. File-list and change-count
operations are absent because no shipped provider implements them. `ClipboardWatch` retains the
create/attach/detach/dispose signal lifecycle, with attach requiring a change provider that supplies
both subscribe and unsubscribe. Clipboard owns pasteboard transport, not the data types it carries;
drag-and-drop remains a separate capability.

## Decisions

- **[2026-07-02] Fix `ClipboardFormat` constant usage.** The `ClipboardFormat` constants are defined in `@flighthq/types` but the implementation uses hardcoded MIME strings instead of referencing them. Fix to use the defined constants throughout.
- **[2026-08-29] Derive slots from provider coverage.** Promote clipboard to a top-level Host group
  because its text, image, formats, bookmark, and change operations have distinct provider vectors;
  remove ambient backend resolution and unsupported sentinel methods.

## Open directions

1. **Image model: data-URL string vs `@flighthq/bitmap`.** Should clipboard images route through `@flighthq/bitmap` (caller-supplied `out: Bitmap`, type-only dependency from `@flighthq/types` to stay tree-shakable) or stay data-URL strings? If a `Bitmap` path lands, are the data-URL functions deprecated or kept as a permanent web-convenience layer?
2. **Scope of the seam.** Are secondary pasteboards (`ClipboardScope`: `'system' | 'selection' | 'find'` — Linux PRIMARY, macOS find pasteboard), binary buffers, and lazy/promised rendering in scope, or is "the system clipboard, all flavors" the boundary?
