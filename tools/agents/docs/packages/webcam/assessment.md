---
package: '@flighthq/webcam'
updated: 2026-06-24
basedOn: ./review.md
---

# webcam — Assessment

Sorted from `review.md` (score `solid — 74`), absorbing `reviews/maturation/depth/webcam.md` (the Bronze/Silver/Gold roadmap — now superseded, its items below). The charter is still a stub (North star / Boundaries / Decisions all `TODO`), and the single largest question — _is the file-input picker and the live stream one package, and is live streaming blessed in scope?_ — is an open direction, not a sweep. The bundle already answered it _de facto_ by shipping both, so `Recommended` is healthy: it holds the genuinely sweep-safe correctness/hygiene fixes (barrel leak, stale header docs, the repeated `readonly` cast). Every roadmap feature gap (convenience setters, frame loop, formats neighbor, native backend, Rust crate) is either a design call or cross-package, so it is parked and routed to Open directions.

## Recommended

Strictly sweep-safe: within `@flighthq/webcam` (+ its types in `@flighthq/types`), no cross-package runtime coupling, no breaking consumer change, no open design decision.

- **Stop the two internal symbols leaking through the package barrel.** `index.ts` does `export * from './webcamStream'`, which publishes `createWebcamStreamEntity`, `getWebcamStreamRuntime`, and the `WebcamStreamRuntime` interface from the package root — the status doc itself calls these "internal." Drop `./webcamStream` from the barrel (the colocated `webcamStream.test.ts` imports the file directly, so coverage is unaffected) so the public surface is the intended seam only. A surface-shape correctness fix, not a feature. — review.md (Contract & docs fit, defect 1). _(Note: this pre-empts open direction 7; if the user instead wants these public, that is the inverse decision and belongs to the charter — flagged below.)_

- **Fix the false `WebcamBackend.requestPermission` doc.** The interface comment says "Returns the new state," but the method returns `Promise<boolean>` and the web backend returns `status.state === 'granted'`. Correct the comment to "Returns true when granted." Pure in-`types` doc fix. — review.md (Contract & docs fit, defect 2).

- **Fix the copy-paste comment errors in `WebcamCapabilities`.** `whiteBalanceModes` is commented "ISO sensitivity range" and the `zoom`/`whiteBalanceModes` doc lines are mismatched to their fields. These are header-layer doc errors in `@flighthq/types`, the codebase's navigable design surface — correct them to describe the actual fields. — review.md (Contract & docs fit, defect 3).

- **Make the `WebcamStreamRuntime.mediaStream` slot truthful, or pin the cast behind one helper.** The slot is typed non-nullable but initialized `null as any as MediaStream`. Either type it `MediaStream | null` and handle null at the (few) read sites, or keep the documented placeholder but centralize it. Within-package, no signature change to the public seam. — review.md (Contract & docs fit, defect 5).

- **Replace the three repeated `(x as { active: boolean }).active = false` `readonly`-bypass casts with one internal mutation helper.** The cast appears in `destroyStream`, the track-`ended` handler, and `stopWebcamRecording`. A small internal `setWebcamStreamActive` / `setWebcamRecordingActive` (or a mutable-runtime mirror) makes the entity-mutation idiom explicit and stops scattering the cast. Within-package; consistent with the "Readonly everywhere, opt out deliberately" rule. — review.md (Contract & docs fit, defect 4).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a within-package sweep. Each carries why.

- **Convenience constraint setters** — `setWebcamTorch` / `setWebcamZoom` / `setWebcamFocus` / `setWebcamExposure` / `setWebcamWhiteBalance`, each `Promise<boolean>` over `applyWebcamStreamConstraints`. **Parked:** the worker deliberately omitted them and whether the named, discoverable torch/zoom surface is part of the bar (vs. the single constraints function) is an API-surface design call. Routed to Open directions. _(If the charter blesses them, they become a clean sweep — five thin wrappers + tests.)_

- **`getWebcamStreamSettings(stream): WebcamStreamSettings`** — the live `MediaTrackSettings` round-trip (capabilities are ranges; settings are the negotiated truth). **Parked:** needs a new `WebcamStreamSettings` type and a North-star confirmation that the capabilities-vs-settings split is in scope. Roadmap Silver/Gold.

- **Zero-copy / high-frequency frame loop** — `startWebcamFrameLoop(stream, onFrame): () => void` over `requestVideoFrameCallback` + a reused scratch canvas/`Surface`, fixing the per-call `OffscreenCanvas` allocation in `grabFrame`. **Parked:** a representation decision that affects the Rust `flighthq-webcam` frame mirror. Routed to Open directions (frame-loop / zero-copy). Roadmap Gold.

- **Burst / sequence capture** — `takeWebcamPhotoSequence`, `grabWebcamFrames(stream, count, out[])`. **Parked:** larger than a sweep; depends on the frame-loop representation above. Roadmap Gold.

- **Richer still metadata + `@flighthq/webcam-formats` neighbor** — `orientation`/EXIF, `timestampMs`, byte `size`, `pixelFormat`; HEIC/HEIF decode. **Parked:** the `-formats` split is cross-package (new triad cell) under the plurality guard, triggered by metadata weight not feature count — correctly deferred. Routed to Open directions.

- **Advanced ImageCapture axes** — `pan`, `tilt`, `pointsOfInterest`, `colorTemperature`, `iso`, `exposureCompensation` setters. **Parked:** completeness long-tail; depends on the convenience-setter scope decision. Roadmap Gold.

- **Exhaustive error/edge handling** — `OverconstrainedError`, device-in-use, hot-unplug, permission-revoked-mid-stream; and wiring the web backend to actually emit `PermissionChange` / `StreamEnded` (today only `DeviceChange` is produced). **Parked:** `StreamEnded`/`PermissionChange` emission spans the backend-event contract and is partly a native-host concern; larger than a sweep.

- **Permission-state unification across the platform suite** — fold `WebcamPermissionState` and `GeolocationPermissionState` into a shared `PermissionState` in `@flighthq/types`. **Parked:** cross-package types-layer decision touching every permission-bearing capability. Routed to Open directions; belongs to the types-layout owner.

- **Native host backend + Rust crate** — `createElectronWebcamBackend(electron)` (in `host-electron`) and the `flighthq-webcam` crate (nokhwa native + `host-web` wasm). **Parked:** both out-of-worktree, multi-session, cross-package. Roadmap Gold.

- **Functional-test scene** — `tests/functional/webcam-frame-grab/` rendering a grabbed frame into a `Surface` via a fake `WebcamBackend`. **Parked:** belongs to a separate `functional-test` session (its own skill scope), not a within-package source sweep.

- **Package Map line update** — `tools/agents/docs/index.md` still reads "take photo / pick image." **Parked:** the Map is admin-doc owned by the user, and the expansion should follow the charter blessing live streaming in scope, not precede it. Flagged for the Map owner.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the forks that keep the feature backlog parked:

1. **Scope: one package or two, and is live streaming blessed?** The bundle shipped the file-input picker _and_ the live getUserMedia stream together; the `package.json` description and the Rust port both assume live streaming is in scope, but the charter (seeded from the old picker-only depth review) still under-describes it. This is the package's defining open question — bless the larger scope as the North star, or split. (The whole feature backlog hangs off this.)
2. **Convenience setters** — ship `setWebcamTorch`/`setWebcamZoom`/… as named wrappers, or keep the single `applyWebcamStreamConstraints` as the intended surface.
3. **Permission-state unification** — a shared `PermissionState` in `@flighthq/types` vs. per-capability `WebcamPermissionState`/`GeolocationPermissionState` (types-layout owner).
4. **`webcam-formats` neighbor** — approve/deny the EXIF/HEIC split and its weight trigger (triad / plurality guard).
5. **Frame-loop / zero-copy frame representation** — pooled scratch + `requestVideoFrameCallback`; affects the Rust mirror.
6. **Internal-symbol policy** — confirm `createWebcamStreamEntity`/`getWebcamStreamRuntime` are hidden (the Recommended barrel fix) rather than public; if public is wanted, that reverses the fix and is a charter decision.
7. **Promote the `'prompt'`-source removal to a Decision** — the worker's well-justified drop of the dead `WebcamSource = 'prompt'` value is a permanent ruling worth recording once the charter exists.
