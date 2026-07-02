---
package: '@flighthq/share'
crate: flighthq-share
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# share — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Invoking the system share sheet — handing a content payload (title, text, url, files) to the OS/browser share UI and reporting the outcome. A Web-Share-Level-2-shaped command capability with flat free functions (`shareContent`, `shareText`, `shareUrl`, `canShareContent`, `isShareAvailable`, `isShareContentValid`) over a swappable `ShareBackend`, plus an opt-in `onShareResult` signals seam for async completion fan-out. The package only invokes the platform share UI with a payload it is given — it does not produce that payload. `ShareFile` is a portable data-URL descriptor, not a DOM `File`; conversion to host-native types happens inside the backend.

## Decisions

- **[2026-07-02] Remove dead `_signalSubscriptions` map.** `detachShareSignals` tears down a per-signals unsubscribe map that the web backend never populates — dead code kept "for pattern consistency." Remove per the pre-release "remove it when it's wrong" rule.

## Open directions

1. **Payload construction helpers.** The obvious graphics-SDK use case is "share a rendered screenshot," which wants a `createShareFileFromImageSource`-style helper — but that pulls `@flighthq/surface` into the dep tree. Does a `@flighthq/share-formats` neighbor earn its place, or does `share` stay a thin invoker?
2. **Result-variant symmetry.** `shareText`/`shareUrl` return `boolean` only; there is no `shareTextWithResult`/`shareUrlWithResult`. Is the boolean path the golden one, or should every convenience entry point have a `*WithResult` twin?
