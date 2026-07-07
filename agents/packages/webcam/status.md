---
package: '@flighthq/webcam'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# webcam — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Ran the Recommended sweep. **No Recommended item was actionable: all five target source that is not present in the current worktree.**

The assessment (and the `[2026-06-24 · builder-67dc46d64]` status entry below) describe the richer live-streaming "bundle" — `webcamStream.ts`, `WebcamStreamRuntime`, `WebcamCapabilities`, `applyWebcamStreamConstraints`, `destroyWebcamStream`, `stopWebcamRecording`, the track-`ended` handler, etc. Those symbols survive only in the stale built `dist/` output. The live `src/` tree is the **picker-only** baseline:

- `packages/webcam/src/` contains only `index.ts` (`export * from './webcam'`), `webcam.ts`, and `webcam.test.ts`.
- `packages/types/src/Webcam.ts` is the picker-only seam (`WebcamSource`, `WebcamCaptureOptions`, `WebcamPhoto`, `WebcamVideo`, `WebcamBackend` with `capture`/`captureVideo`/`requestPermission`). No `WebcamCapabilities`, no `WebcamStream*`.

Item-by-item against the actual source:

- **Barrel leak of `./webcamStream`** — `src/index.ts` re-exports only `./webcam`; there is no `webcamStream` module to drop. Not applicable (nothing leaks).
- **`WebcamBackend.requestPermission` false doc** — the interface line in `Webcam.ts` has no doc comment at all; there is no "Returns the new state" text to correct. Also `Webcam.ts` lives in `packages/types/` — cross-boundary regardless.
- **`WebcamCapabilities` copy-paste comments** — no `WebcamCapabilities` type exists in the current `Webcam.ts`. Not applicable; would be cross-boundary (`packages/types`) if it did.
- **`WebcamStreamRuntime.mediaStream` slot** — no such type/file exists. Not applicable.
- **Three `(x as { active }).active = false` casts** — no `destroyStream` / `stopWebcamRecording` / track-`ended` handler exists. Not applicable.

`npm run test --workspace=packages/webcam` passes (10/10) on the picker-only baseline. No source edits made. `dist/` left untouched (build artifact). The assessment should be regenerated against the live `src/` once the bundle's claimed source changes are either re-applied or the assessment is re-pointed at the picker-only baseline.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/webcam

**Session date:** 2026-06-24 **Previous score:** 45/100 (partial) **Estimated new score:** 78/100 (Silver)

---

## Implemented APIs

### New types in `@flighthq/types`

- `WebcamPermissionState` (`WebcamPermissionState.ts`) — `'denied' | 'granted' | 'prompt' | 'unknown'`
- `WebcamFacingMode` (`WebcamFacingMode.ts`) — `'back' | 'environment' | 'front' | 'user'`
- `WebcamDevice` (`WebcamDevice.ts`) — `{ deviceId, facingMode, kind: 'audio'|'video', label }`
- `WebcamStreamOptions` (`WebcamStreamOptions.ts`) — `{ audio?, deviceId?, facingMode?, frameRate?, height?, width? }`
- `WebcamStream` (`WebcamStream.ts`) — entity with `{ active, deviceId, facingMode, frameRate, height, id, width }` + opaque runtime slot
- `WebcamCapabilityRange` (`WebcamCapabilityRange.ts`) — `{ max, min, step }`
- `WebcamCapabilities` (`WebcamCapabilities.ts`) — full hardware capabilities (zoom, torch, focus, exposure, white-balance, frame ranges)
- `WebcamConstraints` (`WebcamConstraints.ts`) — desired constraint values for `applyWebcamStreamConstraints`
- `WebcamRecording` (`WebcamRecording.ts`) — entity for an active `MediaRecorder` session
- `WebcamSignals` (`WebcamSignals.ts`) — `{ onWebcamDeviceChange, onWebcamPermissionChange, onWebcamStreamEnded }`
- Updated `Webcam.ts`: removed dead `'prompt'` source, added `hasAudio`/`size` to `WebcamVideo`, updated `WebcamBackend` with all new methods, added `WebcamBackendEvent` discriminated union

### New functions in `@flighthq/webcam`

#### `webcam.ts` (core)

- `applyWebcamStreamConstraints(stream, constraints): Promise<boolean>` — applies torch/zoom/focus/exposure/white-balance constraints via `applyConstraints({ advanced: [...] })`
- `destroyWebcamStream(stream): void` — stops all MediaStream tracks, marks stream inactive
- `getWebcamPermissionState(): Promise<WebcamPermissionState>` — real 4-state permission query (distinct from the boolean `requestWebcamPermission`)
- `getWebcamPhotoSurface(photo, out: Surface): Promise<boolean>` — decodes dataUrl into caller-provided Surface via OffscreenCanvas or HTMLCanvasElement; resolves false in 500ms if jsdom never fires onload/onerror
- `getWebcamStreamCapabilities(stream): WebcamCapabilities | null` — reads `MediaTrackCapabilities` from the live stream's video track
- `grabWebcamFrame(stream, out: Surface): boolean` — writes current video frame into Surface via OffscreenCanvas or HTMLCanvasElement
- `startWebcamStream(options?): Promise<WebcamStream | null>` — opens live camera via `getUserMedia`; populates stream entity from negotiated track settings
- `takeWebcamStreamPhoto(stream): Promise<WebcamPhoto | null>` — captures still from live stream via ImageCapture API (with canvas fallback)
- Updated `createWebWebcamBackend`: full implementation of all `WebcamBackend` methods; capture now decodes real image dimensions via `Image` element; video capture decodes real duration via `<video>` element; `WebcamVideo` now includes `hasAudio`/`size`

#### `webcamDevice.ts` (new file)

- `getWebcamDevices(): Promise<readonly WebcamDevice[]>` — enumerates camera and audio input devices

#### `webcamRecording.ts` (new file)

- `startWebcamRecording(stream): WebcamRecording | null` — starts `MediaRecorder` on an active stream; returns null when MediaRecorder is unavailable (jsdom)
- `stopWebcamRecording(recording): Promise<WebcamVideo | null>` — stops recording, decodes duration, encodes to dataUrl

#### `webcamSignals.ts` (new file)

- `attachWebcamSignals(signals): void` — subscribes to backend events and forwards to the three signals
- `detachWebcamSignals(signals): void` — stops delivery; idempotent
- `disposeWebcamSignals(signals): void` — detaches and releases for GC
- `enableWebcamSignals(): WebcamSignals` — allocates inert signal group (opt-in cost)

#### `webcamStream.ts` (new file — internal)

- `createWebcamStreamEntity(data): WebcamStream` — allocates entity with opaque runtime slot (`mediaStream` + `videoElement`)
- `getWebcamStreamRuntime(stream): WebcamStreamRuntime | null` — internal accessor for the runtime

### Package changes

- `package.json`: added `@flighthq/entity` and `@flighthq/signals` dependencies
- `tsconfig.json`: added `entity` and `signals` to `references`

---

## Deferred items and why

### Gold-tier items not yet implemented

- **`@flighthq/webcam-formats` neighbor package** — EXIF/HEIC parsing; deferred per roadmap (triggered by metadata-heavy weight, not feature count). No EXIF data in `WebcamPhoto` yet.
- **Zero-copy frame loop / `startWebcamFrameLoop`** — requires `requestVideoFrameCallback`; deferred to Gold. Current `grabWebcamFrame` works but allocates a new `OffscreenCanvas` per call.
- **Burst/sequence capture** — `takeWebcamPhotoSequence`, `grabWebcamFrames(stream, count, out[])` — Gold tier.
- **Full `MediaTrackSettings` round-trip** — `getWebcamStreamSettings(stream): WebcamStreamSettings` reporting actual negotiated values — Gold tier.
- **Scanner / pan-tilt / advanced ImageCapture axes** — `pan`, `tilt`, `pointsOfInterest`, `colorTemperature`, `iso`, `exposureCompensation` setters — Gold tier.
- **Exhaustive error handling** — `OverconstrainedError`, hot-unplug, permission revoked mid-stream — Gold tier.
- **Convenience setters** — `setWebcamTorch(stream, on)`, `setWebcamZoom(stream, v)`, `setWebcamFocus(stream, v)`, `setWebcamExposure(stream, v)`, `setWebcamWhiteBalance(stream, mode)`. These are thin wrappers over `applyWebcamStreamConstraints`; deferred because the general `applyWebcamStreamConstraints` already covers the use case and adding 5 tiny wrappers without tests would be noise. Add them when user demand is clear.
- **Rust parity (`flighthq-webcam` crate)** — requires a `host-web` wasm path and a native nokhwa backend; cross-worktree effort, deferred to the Rust worktree session.
- **`host-electron` webcam backend** — requires the Electron camera APIs; deferred to the `host-electron` package session.
- **Functional test scene** — a scene rendering a grabbed frame into a `Surface` for visual proof; deferred per `functional-test` skill scope (separate session).

### Design decisions surfaced

- **`'prompt'` source removed:** The dead `WebcamSource = 'prompt'` value was dropped. No function used it; the backend design (file input) could never honor it. Callers who want to prompt the user for source should use platform-specific UI.
- **`setWebcamTorch`/`setWebcamZoom` etc. not added:** The roadmap listed these as Silver conveniences over `applyWebcamStreamConstraints`. They are intentionally omitted for now — `applyWebcamStreamConstraints` already covers the use case with a single, composable function. A future session can add thin wrappers with tests once there's clear demand.
- **`grabWebcamFrame` allocates OffscreenCanvas per call:** The Gold-tier zero-copy path (reused canvas + `requestVideoFrameCallback`) is not yet implemented. This is a known regression for high-frequency use.

---

## Concerns / surprises

- **`MediaStream` absent in jsdom:** `new MediaStream()` in `createWebcamStreamEntity` would throw in jsdom since jsdom does not implement the Media Capture API. Fixed by using `null as any as MediaStream` as a placeholder (always overwritten before use by `startStream`). The recording/stream tests work because they test the sentinel path (no MediaRecorder in jsdom → returns null).
- **`Image.onerror` not firing in jsdom:** For invalid `data:image/png;base64,xx` URLs, jsdom's `Image` never fires `onload` or `onerror`, causing `getWebcamPhotoSurface` to hang. Fixed with a 500ms timeout fallback that resolves `false`. The test has a 2000ms budget.
- **`WebcamVideo.hasAudio`** is always `false` in the file-input web backend (the `<input type="file">` path cannot introspect audio tracks). This is documented in the type; native hosts report the real value.
- **`WebcamBackend` interface is now larger:** Native host backends need to implement all 11 methods. This is correct for a complete seam but could be a friction point for minimal adapter authors. Consider splitting into a required core and optional extension in a future session.

---

## Suggestions for future sessions

1. **Add `setWebcamTorch`/`setWebcamZoom`/`setWebcamFocus`/`setWebcamExposure`/`setWebcamWhiteBalance`** as thin convenience wrappers over `applyWebcamStreamConstraints`, each returning `Promise<boolean>`. Straightforward, ~5 minutes each.
2. **Zero-copy frame loop** (`startWebcamFrameLoop(stream, onFrame): () => void`) using `requestVideoFrameCallback` for continuous capture without per-frame canvas allocation.
3. **`getWebcamStreamSettings(stream): WebcamStreamSettings`** — reports the actual negotiated resolution/frame-rate/facing/torch (capabilities are ranges; settings are the live truth).
4. **`webcam-formats` neighbor package** — EXIF orientation parsing and HEIC decode, triggered when the metadata weight justifies a separate entry point. Analogous to `spritesheet-formats`.
5. **Functional test** — a `tests/functional/webcam-frame-grab/` scene that mocks a fake `WebcamBackend` returning test pixels, grabs a frame into a Surface, and renders it; proves the `grabWebcamFrame` → `Surface` → render pipeline visually.
6. **Permission-state unification across the platform suite** — `WebcamPermissionState` introduced here matches `GeolocationPermissionState` but is a separate type. A suite-wide `PermissionState = 'denied' | 'granted' | 'prompt' | 'unknown'` in `@flighthq/types` would unify all capabilities; worth suggesting as a future types-layer pass.
7. **`host-electron` webcam backend** — `createElectronWebcamBackend(electron)` implementing device enumeration, real permission prompt, torch/zoom via Electron's `desktopCapturer`/native modules.
