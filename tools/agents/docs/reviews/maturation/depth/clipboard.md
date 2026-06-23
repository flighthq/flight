# Maturation Roadmap: @flighthq/clipboard

**Current verdict**: solid — 78/100. A clean command-capability seam covering text/HTML/image/RTF/bookmark read+write, but the format model is fixed (no arbitrary MIME flavors, no atomic multi-flavor write, no format enumeration, no change events), which is what separates it from an authoritative clipboard library.

The package's seam shape is correct and on-spec; the work below is almost entirely about lifting the hard-coded flavor ceiling, fixing the asymmetric `has*` surface, replacing the data-URL image model with an SDK-typed flavor, and adding the event-capability and Rust-port layers. The depth review's four priorities map directly onto Bronze + early Silver.

## Bronze

The 20% that closes the most glaring depth gaps. Shippable, still backend-uniform, no new packages.

- **Generic format seam (the headline gap).** Add to `ClipboardBackend` and export as free functions:
  - `readClipboardFormat(format: string): Promise<string>` — read an arbitrary MIME/UTType flavor as text/string, `''` sentinel.
  - `writeClipboardFormat(format: string, data: string): Promise<boolean>` — write one arbitrary flavor.
  - `hasClipboardFormat(format: string): Promise<boolean>`.
  - `getClipboardFormats(): Promise<readonly string[]>` — enumerate available flavors (`[]` sentinel). Subsumes the ad-hoc `has*` probes and matches Electron `availableFormats()` / `NSPasteboard.types`. The existing `read*Html`/`read*RTF` become thin wrappers over `readClipboardFormat('text/html')` / `readClipboardFormat('text/rtf')` once the seam lands.
- **Complete the `has*` set to match the flavors offered.** Add `hasClipboardHtml`, `hasClipboardRTF`, `hasClipboardBookmark` so the probe surface is symmetric with read/write (today only `hasClipboardText`/`hasClipboardImage` exist). Implement each over `getClipboardFormats()` so they share one code path rather than per-flavor reads.
- **Define a `ClipboardFormat` `*Kind`-style constant set** in `@flighthq/types` (`ClipboardFormatText = 'text/plain'`, `ClipboardFormatHtml = 'text/html'`, `ClipboardFormatRtf = 'text/rtf'`, `ClipboardFormatImage = 'image/png'`, …) so callers and backends share canonical MIME strings instead of stringly-typed literals scattered across both packages. Vendor-prefix convention applies to custom flavors.
- **Web backend wiring for the generic seam**: implement `readClipboardFormat`/`writeClipboardFormat`/`getClipboardFormats` over `navigator.clipboard.read()` (iterate `item.types`) and `ClipboardItem`, guarding for missing API / non-secure context / jsdom and returning the documented sentinels, exactly as the existing flavor paths do.

## Silver

Competitive with a good cross-platform clipboard library (Electron `clipboard`, NSPasteboard, W3C Async Clipboard). Adds the atomic write model, the typed-image flavor, files, and the change-event capability.

- **Atomic multi-flavor write** (the "rich copy" gap). Add a plain-data item descriptor in `@flighthq/types`:
  - `ClipboardWriteItem` — `Readonly<{ format: string; text?: string; image?: Surface | null }>` or a `Readonly<Record<string, string>>` flavor map.
  - `writeClipboard(items: readonly Readonly<ClipboardWriteItem>[]): Promise<boolean>` and a matching `ClipboardBackend.write(items)`. One `ClipboardItem` carries plain+styled+image together so a paste target picks its best representation. The single-flavor `write*` functions stay as convenience wrappers that build a one-entry array.
  - `readClipboard(formats: readonly string[]): Promise<Readonly<Record<string, string>>>` — batch read across requested flavors in one round-trip.
- **Typed image flavor over the SDK's own image types** (replace the data-URL string shape). The SDK owns `@flighthq/surface` / `Surface` / `ImageSource`; route clipboard images through a pixel buffer, not base64:
  - `readClipboardSurface(out: Surface): Promise<boolean>` / `writeClipboardSurface(surface: Readonly<Surface>): Promise<boolean>` (explicit allocation via caller-provided `out`).
  - Add `ImageFormat` selection (`'png' | 'jpeg'`, already in `@flighthq/types`) to the image write path. Keep the data-URL functions as a thin compatibility layer; the typed path becomes the documented one.
- **File / file-path flavor.** `readClipboardFiles(): Promise<readonly string[]>` (`[]` sentinel) and `writeClipboardFiles(paths: readonly string[]): Promise<boolean>` — NSPasteboard file URLs / Electron `FileNameW`. Web backend returns the no-op sentinel (no web file-path flavor); native host implements it. Document as missing-by-design on web, like bookmark.
- **Change-notification event capability** (`onClipboardChange`). Follow the `@flighthq/network` event-capability pattern exactly — entity of signals + attach/detach/dispose, not a method on the command backend:
  - `@flighthq/types`: `ClipboardWatch` entity (`onChange: Signal<() => void>`), and extend `ClipboardBackend` with `getChangeCount(): number` (the `NSPasteboard.changeCount` poll) and `subscribeClipboardChange(listener): () => void`.
  - `@flighthq/clipboard`: `createClipboardWatch()`, `attachClipboardWatch(watch)`, `detachClipboardWatch(watch)`, `disposeClipboardWatch(watch)`. Web backend polls `getChangeCount()` (or wires the experimental `clipboardchange` event where present) and degrades to a no-op subscribe when unavailable.
- **`createWebClipboardBackend` hardening**: respect the Permissions API (`navigator.permissions.query({ name: 'clipboard-read' })`) to avoid throwing prompts in probe paths, and de-duplicate the now-many `getWebClipboard()`/try-catch blocks behind one internal helper.

## Gold

Authoritative / AAA. Exhaustive flavor coverage, the secondary pasteboards, full edge-case + error handling, and 1:1 Rust-port parity.

- **Secondary pasteboards.** A `ClipboardScope`-style selector so a single seam addresses more than the system clipboard:
  - `ClipboardScope = 'system' | 'selection' | 'find'` (`*Kind` string constants in `@flighthq/types`) — Linux X11/Wayland PRIMARY selection, macOS find pasteboard. Add an optional `scope` parameter (defaulting to system) to the read/write/has/format/watch surface, threaded through `ClipboardBackend`. Web backend serves only `'system'` and returns sentinels for the others.
- **Custom-data / binary flavors.** `readClipboardBuffer(format): Promise<ArrayBuffer | null>` / `writeClipboardBuffer(format, buffer: Readonly<ArrayBuffer>): Promise<boolean>` for non-text custom formats (Electron `readBuffer`/`writeBuffer`), so apps with binary paste payloads are fully served — the string-only generic seam from Bronze is the convenience layer over this.
- **Delayed / lazy rendering (promised data).** `writeClipboardLazy(formats: readonly string[], provider): Promise<boolean>` — register formats now and render the bytes on demand when a target requests them (NSPasteboard's promised types). Web backend returns the no-op sentinel; native hosts implement it.
- **Full edge-case + error-handling sweep**: large-payload streaming for images/buffers, MIME normalization between platform UTTypes ↔ Windows clipboard formats ↔ web MIME, HTML fragment sanitization markers (the `<!--StartFragment-->` convention), and a documented matrix of which flavors each scope/backend supports. A `getClipboardCapabilities()` introspection returning the supported flavor/scope set per active backend.
- **Tests + docs**: backend-roundtrip + web-sentinel case for every new export (already the package's norm), atomic-write/read-batch alias cases, `Surface` out-param aliasing tests, watch attach/detach/dispose lifecycle tests, and a `tools/agents/docs` note documenting the flavor/scope support matrix and the data-URL→`Surface` migration.
- **Rust-port mirror — `flighthq-clipboard`** with the same seam: a `ClipboardBackend` trait in `flighthq-types`, `set_clipboard_backend`, and a native-default backend gated behind the `native` cargo feature (e.g. `arboard`/`copypasta` over the OS pasteboard), since std-adjacent crates can serve this without a host (per the host-layer "native ambient default" rule). Free functions `read_clipboard_text` / `write_clipboard_format` / `get_clipboard_formats` / `read_clipboard_surface(out: &mut Surface)` etc., snake_case with full type words, `Option`/`bool` sentinels, alias-safe out-params. Conformance-mapped 1:1 against the TS exports. Surface-as-pixel-buffer makes the image flavor a clean value-typed boundary (and a future mixing candidate).

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze, generic format seam + `ClipboardFormat` constants** (small, ~1 day). Touches `@flighthq/types` first (extend `ClipboardBackend`, add format constants), then `clipboard.ts` and web backend, then tests. Everything else builds on this — do it first. Refactor `read*Html`/`read*RTF` to wrap the generic seam in the same pass.
2. **Bronze, complete `has*` set** (trivial once `getClipboardFormats` exists). Implement all `has*` over enumeration so there is one probe path.
3. **Silver, atomic multi-flavor write + batch read** (medium). Requires the `ClipboardWriteItem`/item-map type in `@flighthq/types`. Rework single-flavor `write*` into wrappers — this is an API reshape, fine pre-release, but it changes the backend contract so do it before native hosts are written against it.
4. **Silver, typed-image flavor over `Surface`** (medium). **Cross-package dependency: introduces a `@flighthq/surface` / `Surface` dependency into `@flighthq/clipboard`.** This is a design decision to surface — clipboard currently depends only on `@flighthq/types`, and pulling in `Surface` (or even just the `Surface` _type_ from `@flighthq/types`, which is the tree-shakable option) affects bundle shape. Recommend depending on the **type only** from `@flighthq/types` and accepting a caller-provided `out: Surface`, so no runtime surface code is pulled into a text-only clipboard import. Confirm with `npm run size`.
5. **Silver, file flavor** (small; mostly a native-host concern, web is a sentinel).
6. **Silver, change-event capability** (medium). Independent of the format work; mirror `@flighthq/network` precisely (entity + attach/detach/dispose, `getChangeCount` poll). Decide whether to add `@flighthq/signals` as a dependency — it is "effectively always present" per the codebase map, so acceptable, but it does add a dependency to a previously dependency-light package; gate the watch entity so a read-only clipboard import still tree-shakes the signal code.
7. **Gold tiers** (large, ordered): secondary pasteboards → binary buffers → lazy/promised rendering → capability introspection + edge-case sweep → Rust mirror. The Rust crate should track the TS seam only after Silver settles, to avoid re-porting a moving contract.

**Items to surface to the user (design decisions, not autonomous):**

- The `Surface`/`ImageSource` clipboard-image dependency (step 4) — type-only vs runtime, and the bundle-size implication.
- Whether the data-URL image functions are deprecated outright or kept indefinitely as a web-convenience layer.
- The atomic-write API reshape (step 3) demoting single-flavor `write*` to wrappers — confirm before native `host-*` backends commit to the old contract.
- Whether `@flighthq/clipboard` should gain a `@flighthq/signals` dependency for the change-event capability, or whether the watch entity belongs in a separate neighbor to keep the command package dependency-free.
