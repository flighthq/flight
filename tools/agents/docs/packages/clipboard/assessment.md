# clipboard — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Fix `ClipboardFormat` constant usage** — `hasClipboardBookmark`, `hasClipboardHtml`, `hasClipboardRTF`, and the `read*`/`write*` flavor paths use hardcoded MIME strings (`'text/x-moz-url'`, `'text/html'`, `'text/rtf'`) instead of the `ClipboardFormat` constants that were added for exactly this purpose. Route all internal references through the shared constants.

## Approved

1. **Fix `ClipboardFormat` constant usage** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

- **Image format (data-URL vs surface)** — open direction on whether clipboard image reads/writes should use a typed `Surface` (`out`-param, type-only `@flighthq/types` dependency) or keep data-URL strings as the permanent web-convenience layer.
