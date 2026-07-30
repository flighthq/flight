---
package: '@flighthq/share'
crate: flighthq-share
draft: false
lastDirection: 2026-07-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# share — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Invoking the system share sheet — handing a content payload (title, text, url, files) to the OS/browser share UI and reporting the outcome. A Web-Share-Level-2-shaped command capability with flat free functions (`shareContent`, `shareText`, `shareUrl`, `canShareContent`, `isShareAvailable`, `hasShareContentFields`) over a swappable `ShareBackend`, plus an opt-in `onShareResult` signals seam for async completion fan-out. The package only invokes the platform share UI with a payload it is given — it does not produce that payload. `ShareFile` is a portable data-URL descriptor, not a DOM `File`; conversion to host-native types happens inside the backend.

## Decisions

- **[2026-07-02] Remove dead `_signalSubscriptions` map.** `detachShareSignals` tears down a per-signals unsubscribe map that the web backend never populates — dead code kept "for pattern consistency." Remove per the pre-release "remove it when it's wrong" rule. *(Done; the surviving vestige — a `Map<ShareSignals, true>` standing in for a set — was collapsed 2026-07-30.)*

- **[2026-07-30] Attached signal groups are a set, and attach is idempotent by construction.** The membership *is* the whole state, so a `Map` to a dummy `true` was a set wearing a map's clothes, and `attachShareSignals` opened with a defensive `detachShareSignals` call to get idempotence a set gives for free. Expressing the structure correctly removed the guard rather than documenting it. User-directed.

- **[2026-07-30] `shareFiles` completes the convenience trio.** `shareText` and `shareUrl` existed; files — the third payload kind Web Share Level 2 carries, and the only one needing a descriptor — had no shorthand, so the hardest payload to build was also the one with the most ceremony. `ShareContent.files` became `readonly` at the same time, per the repo's default-to-`Readonly` rule: a payload handed to the share sheet is read and mapped to host types, never written back through. This is *not* a ruling on Open direction 2 — `shareFiles` returns `boolean` like its siblings, and whether any of the three earns a `*WithResult` twin is still open. User-directed.

- **[2026-07-30] A malformed data URL fails the share rather than sending the wrong bytes.** `shareFileToDomFile` split on `indexOf(',')` without checking for `-1`, so a `dataUrl` with no comma produced an empty header and a body of the whole string — a plausible-looking `File` containing the URL text, silently shared. It now throws, which the backend's existing `try`/`catch` turns into the ordinary `false` sentinel. Sending the wrong bytes is worse than reporting that the share did not happen. User-directed.

## Open directions

1. **Payload construction helpers.** The obvious graphics-SDK use case is "share a rendered screenshot," which wants a `createShareFileFromImageSource`-style helper — but that pulls `@flighthq/bitmap` into the dep tree. Does a `@flighthq/share-formats` neighbor earn its place, or does `share` stay a thin invoker?
2. **Result-variant symmetry.** `shareText`/`shareUrl` return `boolean` only; there is no `shareTextWithResult`/`shareUrlWithResult`. Is the boolean path the golden one, or should every convenience entry point have a `*WithResult` twin?
