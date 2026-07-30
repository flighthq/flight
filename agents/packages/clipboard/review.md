---
package: '@flighthq/clipboard'
status: solid
score: 80
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types
  - prior review (2026-07-09 merge gate)
---

# clipboard — Review

## Verdict

**Solid — 80/100.** The prior partial-40 merge-gate review is obsolete against the live tree. Its
missing-header blocker is resolved: `ClipboardBackend`, `ClipboardWatch`, `ClipboardWriteItem`, and the
canonical format constants all exist in `@flighthq/types`; the package compiles and passes its API,
export, type-home, portability, and test gates. The implementation is a coherent system-clipboard
transport with open MIME flavors, named conveniences, multi-flavor operations, host sentinels, and
opt-in change observation. Remaining distance is primarily successful web-API proof and native/browser
capability depth.

## Present capabilities

- Twenty-nine public functions cover text, HTML, RTF, image data URLs, bookmarks, native file paths,
  arbitrary MIME flavors, multi-format reads/writes, format queries, clearing, and change observation.
  The three backend lifecycle functions remain contract-only for host adapters.
- The generic `readClipboardFormat`/`writeClipboardFormat`/`hasClipboardFormat` seam is open to custom
  flavors. Named helpers are thin transport conveniences, and `readClipboard`/`writeClipboard` batch
  representations behind the same backend rather than creating a parallel abstraction.
- The web backend guards Clipboard API and DOM availability and converts expected absence, denial, or
  cancellation into `''`, `false`, `[]`, `{}`, `null`, `-1`, or no-op unsubscribe sentinels.
- `ClipboardWatch` follows the suite's event-entity lifecycle: create inert state, explicitly attach,
  detach idempotently, and dispose subscriptions without introducing import-time listeners.
- The package has no eager initialization, declares `sideEffects: false`, keeps its exported types in
  `@flighthq/types`, and depends only on `signals` and `types`.

## Stale-cell audit and live fixes

The sole assessment item was already implemented. `e115beddd` replaced the package's hardcoded HTML, RTF,
and bookmark MIME strings with `ClipboardFormatHtml`, `ClipboardFormatRtf`, and
`ClipboardFormatBookmark`; `3240ad45e` routed the test fixtures through the shared text, HTML, RTF, image,
and bookmark constants as well. The live tree contains no hardcoded named-flavor MIME literal in the
clipboard implementation.

The audit confirmed one smaller source defect preserved in the old review: change-event feature detection
accepted a nonstandard `window.clipboardchange` value in addition to the canonical
`onclipboardchange` handler property. `84bd1237b` removes that dead escape-hatch probe and adds a
regression proving a stray event-name property does not activate subscription.

The Package Map's text/HTML-only sentence was also stale. It now records the named flavors, open MIME and
batch seams, sentinel behavior, backend boundary, and watch lifecycle that actually ship.

## Remaining depth

- Successful Clipboard API reads and writes are not behaviorally mocked. Current web tests strongly cover
  unavailable-host sentinels but do not pin `ClipboardItem` construction, multi-item reads, image
  Blob/data-URL conversion, format de-duplication, or permission rejection after the API is present.
- Web change observation depends on the experimental `clipboardchange` event and otherwise intentionally
  becomes a no-op; web change counts remain unsupported. There is no polling fallback or capability query
  for callers that require notification.
- Images are string data URLs, which makes binary conversion implicit and memory-heavy. The charter
  correctly leaves a typed bitmap/buffer path and the fate of the convenience functions as a direction
  decision.
- Bookmark and file-list operations cannot be implemented by the web backend. Their cross-platform format
  mapping and multi-flavor atomicity depend on native host adapters and are not proven in this package's
  suite.
- Generic custom flavors are string-only. Binary buffers, secondary pasteboards, lazy/promised rendering,
  and explicit per-backend capabilities remain possible depth if the charter expands the seam.

## Charter and boundary conclusion

The live package matches its boundary: it owns pasteboard transport, not pixel types, filesystem I/O,
drag-and-drop, or host policy. Its string-keyed MIME seam is the correct extensible bedrock and its named
functions remain optional conveniences over backend operations. The approved format-constant cleanup is
complete; future work should focus on web success-path tests or a directed image/binary/scope decision,
not repeat the stale partial-40 task.
