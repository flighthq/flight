---
package: '@flighthq/webcam'
status: minimal
score: 30
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - assessment.md
  - source
---

# webcam — Review

Evidence: `packages/webcam/src/` (4 files), `packages/types/src/MediaFileCapture*.ts` (2 files), `packages/webcam/package.json`, `packages/host-web/src/webMediaFileCapture.ts`. All claims verified against source at the paths named.

The prior review (score 74, 2026-06-24) was written against an incoming builder snapshot (`67dc46d64`) containing a live-streaming, device-enumeration, signals, and recording surface. That code never landed. The 2026-08-08 status rewrite confirmed this: every function the prior review described beyond the file-input capture (`startWebcamStream`, `getWebcamDevices`, `getWebcamPermissionState`, `grabWebcamFrame`, and the rest) has zero occurrences in `packages/*/src/`. Since then the package was renamed from `Webcam*` to `MediaFileCapture*` and further stripped. This review is against the tree that exists, not the tree that was proposed.

## Verdict

`minimal -- 30/100`. The package is a thin file-input capture wrapper: three user-facing action functions (`takeMediaFileCapturePhoto`, `selectMediaFileCaptureImage`, `recordMediaFileCaptureVideo`), one explain function, a backend seam with the standard platform-suite layering (custom > host > sentinel), and one web backend factory (`createWebMediaFileCaptureBackend`). The code is clean, the lane discipline is correct, and the tests cover every exported symbol. But the implementation is a fraction of the charter's scope (which names live streaming, video recording, and a Capacitor-class capture seam), a fraction of the type surface (which includes an unused `MediaFileCaptureFacingMode`), and missing real metadata decode for both photo dimensions and video duration. The 30 reflects how far the package is from an authoritative camera/media-capture capability; the code it has is well-structured.

## Present capabilities (verified against source)

**Backend seam** (`mediaFileCapture.ts`). Standard platform-suite shape: `getMediaFileCaptureBackend()` resolves `_custom ?? _host ?? _sentinel`, `setMediaFileCaptureBackend(backend | null)` sets the custom slot, `installMediaFileCaptureHostBackend(backend)` sets the host slot (first-write-wins, second-different-write sets `_hostConflict`), and `explainMediaFileCaptureBackend()` returns a `BackendExplanation`. The sentinel returns `null` from both methods without throwing. Module-level mutable state (`_custom`, `_host`, `_hostConflict`, `_hostObservation`) is the platform-suite convention. `resetMediaFileCaptureBackendForTest()` clears all slots for test isolation.

**Web backend** (`mediaFileCapture.ts:12-101`). `createWebMediaFileCaptureBackend()` returns an object with `capture` and `captureVideo`. Both create a transient `<input type="file">`, set `accept` (`image/*` or `video/*`), set `capture="environment"` when `options.source === 'camera'`, and resolve via `FileReader.readAsDataURL`. Settles `null` on absent `document`, user cancel (`oncancel`), missing file, or read error. Handler cleanup is correct: both `onchange` and `oncancel` are nulled in the `settle` helper. Each operation calls `observeMediaFileCaptureHostResult` to record viability.

**Photo dimensions and video duration are not decoded.** `capture` resolves `width: 0, height: 0` (`mediaFileCapture.ts:43-44`); `captureVideo` resolves `duration: 0` (`mediaFileCapture.ts:86`). The source comment at line 11 documents this honestly ("Real pixel dimensions are not decoded; width/height resolve to 0"). Decoding via `Image.onload` and `<video>.onloadedmetadata` is available on the web; the prior review noted the `0`s were fixed in the builder snapshot, but that fix never landed.

**Action functions** (`mediaFileCapture.ts:139-168`). Three thin wrappers over the backend:
- `takeMediaFileCapturePhoto(options?)` -- calls `capture` with `source: 'camera'`.
- `selectMediaFileCaptureImage(options?)` -- calls `capture` with `source: 'photos'`.
- `recordMediaFileCaptureVideo(options?)` -- calls `captureVideo` with `source: 'camera'`.

Each spreads the caller's options and overwrites `source`, so a caller-supplied `source` is always overridden. This is deliberate: each function encodes its intent.

**Public lane** (`index.ts`). Exports exactly 4 symbols: `explainMediaFileCaptureBackend`, `recordMediaFileCaptureVideo`, `selectMediaFileCaptureImage`, `takeMediaFileCapturePhoto`. Backend management (`get*`, `set*`, `install*`, `observe*`, `reset*`, `createWeb*`) is contract-only, consistent with how geolocation, haptics, and other platform-suite packages separate their lanes.

**Contract lane** (`contract.ts`). `export * from './mediaFileCapture'` re-exports all 10 functions. `host-web` imports `createWebMediaFileCaptureBackend` and `installMediaFileCaptureHostBackend` from `@flighthq/webcam/contract` to wire the web backend via `enableHostWebMediaFileCapture()`.

**Types** (`packages/types/src/`). Two files:
- `MediaFileCapture.ts` -- `MediaFileCaptureSource` (`'camera' | 'photos'`), `MediaFileCaptureOptions` (`source?`, `quality?`, `allowEditing?`, `maxDurationMs?`), `MediaFileCapturePhoto` (`dataUrl`, `width`, `height`, `format`), `MediaFileCaptureVideo` (`dataUrl`, `duration`, `format`), `MediaFileCaptureBackend` (two methods: `capture`, `captureVideo`). Parameters typed `Readonly<MediaFileCaptureOptions>`.
- `MediaFileCaptureFacingMode.ts` -- `'back' | 'environment' | 'front' | 'user'`. Exported from both `.` and `./contract` barrels.

**Tests** (`mediaFileCapture.test.ts`). 20 `it` blocks across 11 `describe` blocks, one per exported function plus a `mediaFileCapture public API boundary` block. Coverage includes: cancel/dismiss settles null, handler cleanup, backend resolution, host-install conflict, explain layer/conflict/viability, observation recording, reset, source override, and backend method enumeration. Tests use a `fakeBackend()` helper recording `lastOptions`.

**Packaging** (`package.json`). `sideEffects: false`, two export lanes (`.` and `./contract`), dependencies: `@flighthq/entity` and `@flighthq/types`.

## Gaps

- **Live streaming is entirely absent.** No `getUserMedia`, no `startWebcamStream`, no `destroyWebcamStream`, no `grabWebcamFrame`, no `MediaStream` usage anywhere. The charter names live streaming; the status.md documents this as "header with no implementation." The previous review's live-streaming section described code that never landed.
- **No device enumeration.** No `getWebcamDevices` or equivalent.
- **No permission handling.** No `requestPermission`, no `getPermissionState`, no permission query of any kind.
- **No signals.** No signal entity, no `enableWebcamSignals`, no `attachWebcamSignals`. The `@flighthq/signals` dependency is absent.
- **No recording via MediaRecorder.** The `recordMediaFileCaptureVideo` function delegates to a file-input `<input type="file" accept="video/*">`, not to live `MediaRecorder` capture.
- **Photo dimensions and video duration resolve to `0`.** The web backend does not decode actual pixel dimensions or video duration. Decoding is straightforward on the web.
- **`MediaFileCaptureFacingMode` type is defined but unused.** The type exists in `@flighthq/types` and is exported from both barrels, but no source file in `packages/webcam/src/` or any other package references it. The web backend hardcodes `capture="environment"` for camera-source captures with no way to specify front vs back camera.
- **`MediaFileCaptureOptions.quality` and `allowEditing` are accepted but unused.** The web file-input backend reads `source` only; `quality`, `allowEditing`, and `maxDurationMs` are passed through but have no effect on the web. These are presumably for native backends, but no native backend exists.
- **No host backend beyond web.** `host-capacitor`, `host-electron`, and `host-tauri` have no media-file-capture integration.
- **No functional-test scene.**

## Charter contradictions

The charter is stale in three respects:

1. **Naming.** The charter refers to `WebcamBackend`, `setWebcamBackend`, `enableHostWebWebcam()`, and the `Webcam*` prefix throughout. The implementation uses `MediaFileCapture*` everywhere. The charter's naming does not match the current code.

2. **Scope.** The charter says "Device camera media capture -- take a photo, record a video, and pick an existing image from the photo library." The `package.json` description says "Webcam capture and photo picking over a swappable web/native backend." Neither mentions live streaming, but the charter's decisions section (2026-07-02) acknowledges the gap: "Types define 13 files but source implementation is minimal." Since that decision, the types themselves were also pared down from `Webcam*` to `MediaFileCapture*` (2 type files, not 13), so the charter's claim of 13 type files is stale.

3. **`null as any` cast decision.** The charter's decision says "Fix `WebcamStreamRuntime.mediaStream` `null as any` cast." There is no `WebcamStreamRuntime` in the current code -- `webcamStream.ts` no longer exists, and neither `WebcamStream` nor `WebcamStreamRuntime` appear in types. This decision references deleted code.

The charter's core identity claim -- one-shot capture and pick in the mold of Capacitor Camera -- is roughly accurate for the current implementation's actual scope, even though the names have changed.

## Contract & docs fit

**Consistent with the contract:**
- Full unabbreviated names (`takeMediaFileCapturePhoto`, `selectMediaFileCaptureImage`, `recordMediaFileCaptureVideo`). Each function is globally self-identifying.
- Sentinel returns throughout (`null`, never throws on expected failure).
- Types defined in `@flighthq/types`, exported from both barrels.
- Two export lanes with correct separation: public lane has action + explain functions; contract lane adds backend management. Consistent with other platform-suite packages (geolocation, haptics).
- `sideEffects: false`. No top-level registration, no import side effects.
- Parameters typed `Readonly<MediaFileCaptureOptions>`.
- Module-level state (`_custom`, `_host`, etc.) at bottom of file, after exported functions.
- Exported functions alphabetized within the file.
- Test `describe` blocks mirror exported function names, alphabetized.

**Defects / revisions needed:**

- **Phantom dependency: `@flighthq/entity`.** `package.json` declares `@flighthq/entity` as a dependency, but no source file in `packages/webcam/src/` imports from `@flighthq/entity`. The dependency is unused -- likely a leftover from when the package had entity-based `WebcamStream` and `WebcamRecording` types. Should be removed.
- **Package name vs function prefix mismatch.** The package is `@flighthq/webcam` but all functions and types use the `MediaFileCapture` prefix. For a user importing from `@flighthq/webcam`, the `MediaFileCapture*` names do not echo the package name. This is a design question: either rename the package to `@flighthq/media-file-capture` (if webcam/live-streaming is truly a separate package), or revert the prefix to `Webcam*` (if the package will grow to cover the full webcam scope). The current state is a naming mismatch.
- **Unused type: `MediaFileCaptureFacingMode`.** Defined and exported from `@flighthq/types` but referenced in zero source files. No function or option accepts or returns it. Either the type is forward-looking (and should be connected to the `capture` attribute or an options field) or it should be removed until it has a consumer.
- **`status.md` is stale.** The status references `WebcamStream.ts`, `WebcamStreamOptions.ts`, `WebcamStreamRuntime.ts`, `WebcamCapabilities.ts`, and other types that no longer exist. It references functions (`startWebcamStream`, `destroyWebcamStream`, `getWebcamDevices`, `getWebcamPermissionState`, `grabWebcamFrame`, etc.) with the `Webcam*` prefix. The current code uses `MediaFileCapture*` throughout. The status needs a full rewrite to reflect the current source.
- **`assessment.md` references deleted code.** The approved item "Fix `null as any` cast" targets `WebcamStreamRuntime.mediaStream`, which no longer exists. The backlog item "types define 13 files" references the old Webcam type count. Both are stale.

## Candidate open directions

1. **Package identity: webcam or media-file-capture?** The package name says "webcam" (implying device camera, live streaming, the full OS camera capability). The function prefix says "MediaFileCapture" (implying the one-shot file-picker surface). Reconcile: either rename the package to match the prefix, or acknowledge that `MediaFileCapture` is one sub-capability within a `webcam` package that will grow to include live streaming, device enumeration, and signals.

2. **Live streaming scope.** The charter and status both reference live streaming as the major missing capability. If the package is to be a complete camera seam (getUserMedia, frame grab, device enumeration, constraints, recording), the type surface and implementation need to be rebuilt. If live streaming belongs in a separate package, document the split.

3. **Decode photo dimensions and video duration.** The web backend resolves `width`/`height`/`duration` as `0`. Decoding via `Image` / `<video>` is straightforward and would remove the sentinels.

4. **Connect `MediaFileCaptureFacingMode`.** Add a `facingMode` option to `MediaFileCaptureOptions` so callers can specify front vs back camera, rather than hardcoding `capture="environment"`.

5. **Permission handling.** Whether `requestMediaFileCapturePermission` / `getMediaFileCapturePermissionState` belong in this package (the charter mentioned permission in the backend seam) or in a shared `@flighthq/permissions` surface.

6. **Remove phantom `@flighthq/entity` dependency** once confirmed no planned work needs it imminently.
