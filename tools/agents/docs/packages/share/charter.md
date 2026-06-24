---
package: '@flighthq/share'
crate: flighthq-share
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# share — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/share` is the platform-integration cell for **invoking the system share sheet** — handing a content payload (title, text, url, files) to the OS/browser share UI and reporting what the user did with it. It is a Web-Share-Level-2-shaped command capability: flat free functions (`shareContent`, `shareText`, `shareUrl`, `canShareContent`, `isShareAvailable`, `isShareContentValid`) over a swappable `ShareBackend` (`get*`/`set*`/`createWeb*`), with an opt-in signals seam (`enableShareSignals`/`attach*`/`detach*`/`disposeShareSignals`, payload `onShareResult`) so native sheets that complete on a later runloop tick can fan their result out to listeners.

Where it ends: `share` only _invokes_ the platform share UI with a payload it is given. It does not _produce_ that payload — turning a rendered frame or a loaded resource into a `ShareFile` is a neighbor's job (see Open directions). It is one capability in the Platform Integration Suite, sitting beside `clipboard`, `dialog`, and `filesystem`; the line against `clipboard` is the share _sheet_ (user-chosen target app) vs. the system _clipboard_ (a single named buffer). Delivery on native hosts lives in `host-electron`/`host-tauri`/`host-capacitor`, not here; the Rust mirror is `flighthq-share`.

## North star (proposed)

- **A thin, canonical invocation seam — not a content factory.** The package's job is to hand a payload to the platform and report the outcome; the durable value is a complete, correctly-named Web-Share-Level-2 surface, not breadth of payload-construction helpers.
- **Sentinels, never throws.** Every entry point returns `boolean`/`ShareResult` on the expected failure paths — API absent (jsdom/unsupported), user cancels, empty payload, host denies. The web backend guards every browser API. `isShareContentValid` is the deliberate pre-check that keeps an empty payload from reaching an engine that would throw.
- **Two honest probes, kept distinct.** `isShareAvailable` (can this platform share _at all_?) and `canShareContent` (is _this content_ shareable?) answer different questions and must never be collapsed into one.
- **Portable payloads at the header layer.** Content crosses the boundary as plain data — `ShareFile` is a portable data-URL descriptor, not a DOM `File`; conversion to a host-native type happens _inside_ the backend so `@flighthq/types` stays browser-File-agnostic and the Rust port shares the same seam.
- **The platform-suite command+event shape, exactly.** Match the suite's `get*Backend`/`setBackend`/ `createWeb*Backend` command shape and the `enable*`/`attach*`/`detach*`/`dispose*` event shape so a reader who knows one capability knows this one — and carry no speculative machinery the seam does not actually use.

## Boundaries (proposed)

In scope:

- Invoking the share sheet with a `ShareContent` payload (title/text/url/files), with and without a full `ShareResult` (`completed`/`activityType`/`dismissed`).
- The two probes (`isShareAvailable`, `canShareContent`) and the validity precondition (`isShareContentValid`).
- The backend seam (`getShareBackend`/`setShareBackend`/`createWebShareBackend`) and the default web backend over `navigator.share`/`navigator.canShare`.
- The `onShareResult` signals seam for async completion fan-out.
- Forward-declared native presentation options (`parentWindow`/`sourceRect`/`chooserTitle`/ `excludedActivityTypes`) as _types_ the native backends will realize.

Non-goals (candidates — see Open directions):

- Constructing payloads from SDK assets (screenshot → `ShareFile`, resource → `ShareFile`). That pulls `surface`/`resources` into the dep tree and is a cross-package design call, not this cell's default.
- Realizing the native presentation options — that is host-backend work (`host-electron` et al.).
- Validating URL well-formedness beyond non-emptiness (a malformed URL is an expected failure the platform swallows, not a programmer error to throw on).
- Clipboard, dialog, or filesystem behavior (neighboring suite cells).

## Decisions

None blessed yet.

## Open directions

The charter is silent on all of these; each is something the review had to assume, plus the structural forks that touch this cell.

1. **Thin `share`, or a `@flighthq/share-formats` neighbor?** The obvious graphics-SDK use case is "share a rendered screenshot," which wants a `createShareFileFromImageSource`-style helper — but that pulls `@flighthq/surface`/`@flighthq/resources` into the cell. This is structural-fork A (source-data vs. participation) and the triad's `-formats` question (fork B / plurality guard): does payload-construction have enough plurality to earn a sibling cell, or does `share` stay a thin invoker and leave `ShareFile` construction to the caller? Needs a ruling.
2. **Keep or cut the `_signalSubscriptions` stub?** `detachShareSignals` tears down a per-signals unsubscribe map that the web backend never populates — admitted dead code kept "for pattern consistency." Per the pre-release "remove it when it's wrong" rule this is a smell. A North-star line settling _no speculative scaffolding_ vs. _a forward-compatible event-capability template_ would decide this for `share` and every sibling event capability that copied the pattern.
3. **Result-variant symmetry.** `shareText`/`shareUrl` return `boolean` only; there is no `shareTextWithResult`/`shareUrlWithResult`. Is the boolean path the golden one with `shareContentWithResult` as the escape hatch, or should every convenience entry point have a `*WithResult` twin? A Boundaries note would fix the surface size deliberately.
4. **Canonicalize the two-probe model.** `isShareAvailable` (capability-level) + `canShareContent` (content-level) is the right pair. Worth recording as a Decision so other suite capabilities copy it rather than re-deriving it — this cell would be the reference.
5. **Stub triage (fork F) and delivery.** `share`'s logic is solid, but "share works natively" is not demonstrable end-to-end until a native host backend realizes the forward-declared options and the `flighthq-share` Rust crate exists. Is `share` blessed as a thin command capability whose delivery is intentionally deferred, or does it want a push toward an end-to-end native proof?
6. **Stale Package Map line.** `tools/agents/docs/index.md` still lists `@flighthq/share` as just "native share sheet," behind the realized surface (files + result + options + the `onShareResult` event seam). The map line should be widened and the new event seam noted — a doc revision for the user's gate, not an autonomous edit.
