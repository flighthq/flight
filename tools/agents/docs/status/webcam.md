# @flighthq/webcam — status

## 2026-06-25 — builder R2-4 lost-source recovery

### Summary

The integration curation pruned `packages/webcam/src/` down to a single live module (`webcam.ts` — the capture/permission/backend seam). The gitignored build output proves four additional modules previously existed and compiled:

- `dist/webcamDevice.js` — `getWebcamDevices()` (device enumeration)
- `dist/webcamStream.js` — `createWebcamStreamEntity()`, `getWebcamStreamRuntime()` (+ `WebcamStreamRuntime`)
- `dist/webcamRecording.js` — `startWebcamRecording()`, `stopWebcamRecording()` (MediaRecorder live capture)
- `dist/webcamSignals.js` — `attachWebcamSignals()`, `detachWebcamSignals()`, `disposeWebcamSignals()`, `enableWebcamSignals()`

All four are genuine functionality, not prune-fossils. None of them touches a deliberately-dropped concept. They are the natural AAA build-out of a webcam capability (live stream, recording, device enumeration, event signals) layered on the capture seam.

### Recovered

None.

### Fossils skipped

None — no module mapped to a deliberately-dropped/deprecated concept.

### Parked (blocked on @flighthq/types — hard boundary forbids editing it)

Every lost module imports one or more Webcam types that are **absent** from `packages/types/src/`. The current `packages/types/src/Webcam.ts` defines only `WebcamSource`, `WebcamCaptureOptions`, `WebcamPhoto`, `WebcamVideo`, and a `WebcamBackend` whose surface is `capture` / `captureVideo` / `requestPermission` only. The recovered modules require additional types and an extended backend surface that the curation also pruned from `@flighthq/types`:

- **webcamDevice** — needs `WebcamDevice` in `@flighthq/types`, and `WebcamBackend.enumerateDevices(): Promise<readonly WebcamDevice[]>`.
- **webcamStream** — needs `WebcamStream` and `WebcamFacingMode` in `@flighthq/types`. (`EntityRuntime` / `EntityRuntimeKey` it also uses DO exist, in `Entity.ts`.)
- **webcamRecording** — needs `WebcamRecording` in `@flighthq/types`, the stream runtime slot from `webcamStream` (itself parked), and `WebcamVideo` extended with `hasAudio` and `size` fields (the recovered impl resolves a video object carrying both, but the live `WebcamVideo` is `{ dataUrl, duration, format }` only).
- **webcamSignals** — needs `WebcamSignals` in `@flighthq/types`, plus a `WebcamBackend.subscribe(listener)` method and a `WebcamEvent` union (`DeviceChange` / `PermissionChange` / `StreamEnded`) — none present.

Recovering any of these would require editing `@flighthq/types` (new type files + extending `WebcamBackend` / `WebcamVideo`), which is outside this task's hard boundary. They are parked as a unit pending a types-layer pass that restores the pruned Webcam type surface. Once those types exist, the dist `.js` + `.d.ts` here are sufficient to reconstruct all four `.ts` modules and their tests via the camera pattern.

### Test result

`npm run test --workspace=packages/webcam` — PASS (1 file, 10 tests). No source changes were made (all candidates parked), so this matches the pre-task baseline.

## 2026-06-25 — builder R2-4 second-pass recovery

### Summary

The types-recovery pass restored the standalone Webcam entity types (`WebcamStream`, `WebcamFacingMode`, `WebcamDevice`, `WebcamRecording`, `WebcamSignals`, `WebcamCapabilities`, `WebcamCapabilityRange`, `WebcamConstraints`, `WebcamPermissionState`, `WebcamStreamOptions`). That unblocks exactly one of the four parked modules. The extended `WebcamBackend` surface (stream/device/recording methods + `subscribe`), the `WebcamEvent` union, and the extra `WebcamVideo` fields (`hasAudio`, `size`) are still NOT in `@flighthq/types` (`Webcam.ts` still defines the pruned three-method backend and the `{ dataUrl, duration, format }` video). The hard boundary forbids editing `@flighthq/types`, so the modules depending on that missing surface stay parked.

### Recovered

- `webcamStream.ts` — `createWebcamStreamEntity()`, `getWebcamStreamRuntime()`, and the `WebcamStreamRuntime` interface. All its type deps (`WebcamStream`, `WebcamFacingMode`, `EntityRuntime`, `EntityRuntimeKey`, `createEntity`) are now present. Added `@flighthq/entity` as a package dependency and a `../entity` tsconfig project reference (the module needs `createEntity`); added `export * from './webcamStream'` to `src/index.ts`. Colocated test recovered from `dist/webcamStream.test.js` (5 tests; `rt.videoElement` accesses made null-safe with `?.` since TS does not narrow through `expect().not.toBeNull()`).

### Fossils skipped

None — no module mapped to a deliberately-dropped/deprecated concept.

### Parked (still blocked on absent `@flighthq/types` surface — hard boundary forbids editing it)

- **webcamDevice** (`getWebcamDevices`) — needs `WebcamBackend.enumerateDevices(): Promise<readonly WebcamDevice[]>`. The `WebcamDevice` type now exists, but the `WebcamBackend` interface in `types/src/Webcam.ts` was not extended with `enumerateDevices`. Reason: needs `WebcamBackend.enumerateDevices` (extended backend surface in `Webcam.ts`).
- **webcamRecording** (`startWebcamRecording`, `stopWebcamRecording`) — the recovered impl resolves a `WebcamVideo` carrying `hasAudio` and `size`, but the live `WebcamVideo` is `{ dataUrl, duration, format }` only, so the object literal would be a TS excess-property error. Also consumes the `webcamStream` runtime slot, which is fine now. Reason: needs `WebcamVideo` extended with `hasAudio`/`size`.
- **webcamSignals** (`attachWebcamSignals`, `detachWebcamSignals`, `disposeWebcamSignals`, `enableWebcamSignals`) — `WebcamSignals` exists, but the impl calls `getWebcamBackend().subscribe(listener)` over a `WebcamEvent` union (`DeviceChange` / `PermissionChange` / `StreamEnded`); neither `WebcamBackend.subscribe` nor a `WebcamEvent` type is present. Would also add a `@flighthq/signals` dependency. Reason: needs `WebcamBackend.subscribe` + `WebcamEvent` type.
- **richer `webcam.ts`** (`applyWebcamStreamConstraints`, `destroyWebcamStream`, `getWebcamPermissionState`, `getWebcamPhotoSurface`, `getWebcamStreamCapabilities`, `grabWebcamFrame`, `startWebcamStream`, `takeWebcamStreamPhoto`, plus the full live-stream/getUserMedia backend) — the live `webcam.ts` is the pruned capture-only seam. The richer dist version needs the extended `WebcamBackend` (all stream methods), the `Surface` out-param plumbing, and the extended `WebcamVideo`. Left the pruned `webcam.ts` untouched. Reason: needs extended `WebcamBackend` + `WebcamVideo` fields in `Webcam.ts`.

These four are the cohesive live-stream/recording/device/signals feature unit; they all hinge on the extended `WebcamBackend` (and `WebcamVideo`/`WebcamEvent`) surface that the types pass did not restore. Once `Webcam.ts` regains that surface, the dist `.js` + `.d.ts` here are sufficient to reconstruct all four modules and their tests.

### Test result

`npm run test --workspace=packages/webcam` — PASS (2 files, 15 tests; was 1 file / 10 tests pre-task). Package `tsc -b` build also succeeds (exit 0), confirming `webcamStream.ts` typechecks against `@flighthq/entity` + `@flighthq/types`.
