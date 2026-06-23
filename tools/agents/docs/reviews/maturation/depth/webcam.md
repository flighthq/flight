# Maturation Roadmap: @flighthq/webcam

**Current verdict:** partial — 45/100. A competent single-shot capture-and-pick seam (take photo / record video / pick image / request permission over a clean swappable `WebcamBackend`), but missing the entire live-stream / frame-grab dimension that defines a _webcam_, plus device enumeration, capture constraints, real permission-state, and any integration with the SDK's `Surface`/`ImageSource` pixel layer.

The single biggest design decision to surface before Bronze: **is live streaming in scope?** The package name and the Package Map entry ("take photo / pick image") read as the photo-picker half, but the depth review is right that a domain called `webcam` is authoritatively a _live feed_. This roadmap assumes live streaming **is** in scope (the name demands it); if the user decides otherwise, Bronze/Silver collapse to metadata + `Surface` integration polish and the package should arguably be renamed `camera-capture` to free `webcam` for the streaming reading. Treat that as the first cross-package question (see Sequencing).

All type additions land in `@flighthq/types` first (the header layer): `Webcam.ts` plus new files `WebcamDevice.ts`, `WebcamStream.ts`, `WebcamConstraints.ts`, `WebcamPermissionState.ts`. Every symbol keeps the `Webcam*` prefix to stay grep-distinct from `@flighthq/camera` (the 3D view camera).

## Bronze

The minimum viable, genuinely-useful webcam: a live preview stream and a frame grab that feeds `@flighthq/surface`, plus the metadata and permission honesty the current package fakes.

- **`WebcamStream` entity + runtime** in `@flighthq/types` (`WebcamStream.ts`): a plain-data handle (`id`, `width`, `height`, `frameRate`, `deviceId`, `facingMode`, `active: boolean`) with an opaque runtime slot holding the underlying `MediaStream` / native handle. No methods on the entity — free functions only.
- **`startWebcamStream(options?: Readonly<WebcamStreamOptions>): Promise<WebcamStream | null>`** — opens the live camera over `getUserMedia` (web backend) / native; resolves `null` on deny/cancel/absent (sentinel, never throws).
- **`stopWebcamStream(stream: Readonly<WebcamStream>): void`** — `destroy*`-class teardown of the live `MediaStream` tracks (frees a non-GC resource). Name it **`destroyWebcamStream`** to match the teardown-verb rule (it stops tracks / releases device), not `stopWebcamStream`.
- **`grabWebcamFrame(stream, out: Surface): boolean`** — snapshots the current live frame into a caller-allocated `Surface` (the `@flighthq/surface` RGBA buffer), returns `false` when no frame is available. Out-param, no allocation, alias-safe. This is the bridge the depth review calls the core missing feature.
- **`getWebcamStreamSurface(stream, out: Surface): boolean`** — alias-free convenience that sizes `out` to the stream and grabs; keep only if `grabWebcamFrame` + a sizing helper feels too low-level. (Decide one; do not ship both as redundant surface.)
- **`WebcamStreamOptions`** in types: `facingMode?: 'user' | 'front' | 'environment' | 'back'`, `width?`, `height?`, `frameRate?`, `deviceId?: string`, `audio?: boolean`. Replaces the hardcoded `capture="environment"`.
- **Real permission state** — `WebcamPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'` in types; `getWebcamPermissionState(): Promise<WebcamPermissionState>` distinct from the existing boolean `requestWebcamPermission()`. Add `getPermissionState` to the `WebcamBackend` interface; web backend maps the Permissions API result, returns `'unknown'` in jsdom.
- **Decode still dimensions** — web backend decodes the picked/captured image (via an `Image`/`createImageBitmap`) so `WebcamPhoto.width`/`height` are real, not `0`. Same for `WebcamVideo.duration` via a transient `<video>` `loadedmetadata`.
- **`WebcamPhoto.surface?: Surface`** (optional) and a **`getWebcamPhotoSurface(photo, out): boolean`** decode helper so a still capture flows into `surface`/filters without a re-decode from the `dataUrl`. Keep `dataUrl` as the plain-data default; `surface` is the bridge.
- **Wire the unused `'prompt'` source** — either expose a first-class `captureWebcamMedia(options)` that honors `source: 'prompt'`, or drop `'prompt'` from `WebcamSource`. The depth review flags it as dead today; resolve it rather than leave it dangling.

## Silver

Competitive and solid: matches what a well-regarded WebRTC/Capacitor-class capture library offers — device selection, the constraints/capabilities surface, live events, and audio for video.

- **Device enumeration** — `WebcamDevice` type (`deviceId`, `label`, `kind: 'video' | 'audio'`, `facingMode?`); `getWebcamDevices(): Promise<readonly WebcamDevice[]>` (returns `[]` when unavailable). Backend gains `enumerateDevices`.
- **`WebcamFacingMode` kind selection wired end-to-end** — `setWebcamStreamFacingMode(stream, mode): Promise<boolean>` (re-acquires / applies constraints), `getWebcamStreamFacingMode(stream)`.
- **Capability + constraint surface** (the `MediaTrackCapabilities`/`applyConstraints` map): `WebcamCapabilities` (ranges for zoom, torch, focus, exposure, white-balance, resolution, frame-rate) and `WebcamConstraints` (the requested values). `getWebcamCapabilities(stream): WebcamCapabilities | null`; `applyWebcamConstraints(stream, constraints: Readonly<WebcamConstraints>): Promise<boolean>`.
- **Torch / flash** — `setWebcamTorch(stream, on: boolean): Promise<boolean>` (returns `false` when unsupported). High-value, widely-requested, distinct from generic constraints.
- **Zoom / focus / exposure / white-balance setters** — `setWebcamZoom`, `setWebcamFocus`, `setWebcamExposure`, `setWebcamWhiteBalance`, each `Promise<boolean>` over `applyWebcamConstraints`, each returning `false` when out of the capability range (sentinel, not throw).
- **Take photo _from a live stream_** — `takeWebcamStreamPhoto(stream, options?): Promise<WebcamPhoto | null>` using `ImageCapture.takePhoto()` where available, falling back to a `grabWebcamFrame` + encode. Distinct from the file-input `takeWebcamPhoto` (which stays the picker path).
- **Live events as an opt-in signal group** — `enableWebcamSignals()` in this package (not in `@flighthq/signals`), exposing a `WebcamSignals` entity: `onDeviceChange`, `onStreamEnded`, `onPermissionChange`. Backend gains a `subscribe`-style seam mirroring `Screen`'s `subscribe(listener): () => void`. Keeps cost off the default bundle.
- **Audio dimension for video** — `audio?: boolean` / mic device selection on `recordWebcamVideo`; `WebcamVideo` gains `hasAudio`, byte `size`.
- **Recording from a live stream** — `startWebcamRecording(stream, options?): WebcamRecording | null` / `stopWebcamRecording(recording): Promise<WebcamVideo | null>` over `MediaRecorder`, so video capture is not limited to the one-shot file input. `WebcamRecording` entity with a runtime slot for the `MediaRecorder`.
- **Richer still metadata** — `WebcamPhoto` gains `orientation` (EXIF), `timestampMs`, byte `size`, and `pixelFormat`. A `webcam-formats` neighbor package is _not_ yet warranted; revisit at Gold if EXIF/HEIC parsing grows.
- **Cross-backend consistency contract** — document and test that web and a fake native backend return the same sentinel/shape for every function (the suite's parity expectation).

## Gold

Authoritative / AAA: exhaustive coverage, performance, full error handling, the formats neighbor, and 1:1 Rust parity.

- **`@flighthq/webcam-formats` neighbor package** — EXIF orientation/metadata parsing, HEIC/HEIF → RGBA decode, and image-format normalization, kept out of the core bundle per the `-formats` pattern (sibling to `spritesheet-formats`). Core `webcam` stays tree-shakable; metadata-heavy importers live here.
- **Zero-copy / high-frequency frame grab** — `grabWebcamFrame` path that uses `requestVideoFrameCallback` + a reused `Surface` for per-frame processing without re-allocation; document the acquire/release bracket for any pooled scratch surface. A `WebcamFrameLoop` helper (`startWebcamFrameLoop(stream, onFrame): () => void`) for continuous capture.
- **`takeWebcamPhotoSequence` / burst capture** and **`grabWebcamFrames(stream, count, out: readonly Surface[])`** for multi-frame use (HDR, motion).
- **Full `MediaTrackSettings` round-trip** — `getWebcamStreamSettings(stream): WebcamStreamSettings` reporting the _actual_ negotiated resolution/frame-rate/facing/torch (capabilities are ranges; settings are the live truth).
- **Scanner / barcode + pan-tilt + ImageCapture photoSettings** — expose the remaining `MediaTrackCapabilities` axes (`pan`, `tilt`, `pointsOfInterest`, `colorTemperature`, `iso`, `exposureCompensation`) for completeness; each a `set*`/`get*` pair returning sentinels when unsupported.
- **Exhaustive error/edge handling** — `OverconstrainedError`, device-in-use, hot-unplug mid-stream (fires `onStreamEnded`), permission revoked mid-stream, tab-backgrounded track-mute. All surface as sentinels/events, never thrown except on genuine API misuse (e.g. grabbing from a destroyed stream).
- **Full test coverage** — colocated `*.test.ts` per source file: a fake `WebcamBackend` driving every function, an aliased-`out` test for `grabWebcamFrame`, jsdom sentinel paths, and the signal-group enable/disable lifecycle. Add a functional-test scene that renders a grabbed frame into a `Surface` and displays it (visual proof the bridge works).
- **Native host backends** — `host-electron` / future `host-capacitor` implementations of the full `WebcamBackend` (device enumeration, torch, real permission prompt, native recording), with `createElectronWebcamBackend(electron)` granular export.
- **Rust parity — `flighthq-webcam` crate** mirroring the seam: `start_webcam_stream`, `destroy_webcam_stream`, `grab_webcam_frame(&WebcamStream, &mut Surface) -> bool`, device enumeration, constraints, over a `WebcamBackend` trait in `flighthq-types` with a `native` default backend (nokhwa-class capture) gated behind the `native` cargo feature, and `host-web` filling the wasm seam. Recorded in the conformance map; `grab_webcam_frame` is value-in/value-out and thus mixable for the conformance instrument. Pair a `flighthq-functional` scene by name with the TS functional scene.

## Sequencing & effort

**Order:**

1. **Design decision first (blocking):** confirm live streaming is in scope. If no, rename the package and demote this roadmap to metadata + `Surface` polish. Surface this to the user before any code.
2. **Bronze, in order:** permission-state + dimension/duration decode (cheap, no new entities, fixes the dishonest `0`s) → `WebcamStream` entity + `startWebcamStream`/`destroyWebcamStream` → `grabWebcamFrame` into `Surface` (the keystone). Resolve the dead `'prompt'` source as part of this pass.
3. **Silver:** device enumeration → constraints/capabilities + torch/zoom/focus → `takeWebcamStreamPhoto` → `enableWebcamSignals` event group → live recording + audio.
4. **Gold:** `webcam-formats`, zero-copy frame loop, exhaustive constraints/errors, native host backends, Rust crate.

**Effort:** Bronze is ~medium — the type additions are small but `getUserMedia` + `Surface` integration and decode helpers are real work; the keystone `grabWebcamFrame` depends on `@flighthq/surface` and `@flighthq/types` `Surface` (both already exist). Silver is the largest single jump (the constraints/capabilities surface and the signal group roughly double the API). Gold is long-tail: the `-formats` package, native backends, and the Rust crate are each independent multi-session efforts.

**Dependencies & cross-package items to surface:**

- **`@flighthq/types` first** for every tier — `WebcamStream`, `WebcamDevice`, `WebcamConstraints`, `WebcamCapabilities`, `WebcamPermissionState`, `WebcamStreamOptions`. The header is the design surface; implement against it.
- **`@flighthq/surface`** is a new runtime dependency the moment `grabWebcamFrame` lands (Bronze). Confirm webcam may depend on `surface` (it is user-facing, not a renderer-internal coupling) — likely fine, but it grows the default bundle, so verify with `npm run size`. Consider keeping the `Surface` bridge in helpers so a user who only picks images does not pull `surface`.
- **`@flighthq/signals`** dependency arrives at Silver via `enableWebcamSignals`; cost is opt-in.
- **Naming guard against `@flighthq/camera`** — keep `Webcam*` on every new symbol; the `WebcamStream` vs the 3D `Camera` distinction must stay grep-clean.
- **Permission-state shape** should match whatever the rest of the platform suite settles on (`Geolocation`/`Notification` currently expose only `Promise<boolean>`). Introducing `WebcamPermissionState` is arguably a suite-wide improvement — surface as a suggestion to unify all permission capabilities on a shared `PermissionState` type in `@flighthq/types` rather than a webcam-only one.
- **`webcam-formats` split** is a Gold-time decision; do not pre-split. The trigger is EXIF/HEIC parsing weight, not feature count.
