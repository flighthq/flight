---
package: '@flighthq/webcam'
updated: 2026-08-08
by: principal
---

# webcam — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/webcam/src/` and `packages/types/src/` on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **Live streaming is a header with no implementation.** `packages/types/src/` carries
  `WebcamStream.ts`, `WebcamStreamOptions.ts`, `WebcamStreamRuntime.ts`, `WebcamCapabilities.ts`,
  `WebcamCapabilityRange.ts`, `WebcamConstraints.ts`, `WebcamDevice.ts`, `WebcamRecording.ts`,
  `WebcamPermissionState.ts`, and `WebcamFacingMode.ts` — and `@flighthq/webcam` implements only
  `createWebcamStreamEntity` (`webcamStream.ts:8`) and `getWebcamStreamRuntime` (`webcamStream.ts:39`).
  No `startWebcamStream`, `destroyWebcamStream`, `applyWebcamStreamConstraints`,
  `getWebcamStreamCapabilities`, `grabWebcamFrame`, `getWebcamDevices`, or `*WebcamRecording` exists
  anywhere in `packages/`; `getUserMedia` is never called. The types are the design surface, so the
  gap is effort, not a ruling.
- **The stream constructor is public but unusable.** `createWebcamStreamEntity` is re-exported
  through the `.` lane (`index.ts:2`), yet an app has no function that acquires or releases a
  `MediaStream` to put in the runtime slot. Either the acquisition functions land or the constructor
  drops back to `./contract`.
- **`WebcamSignals` has no signal group.** `packages/types/src/WebcamSignals.ts` declares the three
  signals, and no `enableWebcamSignals` / `attachWebcamSignals` / `detachWebcamSignals` /
  `disposeWebcamSignals` exists. The event-capability half of the Platform Integration Suite pattern
  is absent for this cell.
- **The backend seam carries three methods** — `capture`, `captureVideo`, `requestPermission`
  (`packages/types/src/Webcam.ts:29-33`). Device enumeration, four-state permission query, and stream
  acquisition have no seam to route through, which is why the header types above have nowhere to bind.
- **`WebcamSource = 'prompt'` is unreachable and unhonored.** The value is declared at
  `Webcam.ts:6`; the web backend branches only on `'camera'` (`webcam.ts:18`, `:53`), and
  `takeWebcamPhoto` / `selectWebcamImage` / `recordWebcamVideo` overwrite `source` unconditionally
  (`webcam.ts:122`, `:112`, `:102`), so a caller-supplied `source` never reaches a backend at all.
  Either the option is honored or it leaves `WebcamCaptureOptions`.
- **Web photo/video metadata is zeroed, not decoded.** The file-input backend resolves `width`/
  `height` as `0` (`webcam.ts:29-30`) and `duration` as `0` (`webcam.ts:65`) rather than decoding
  through an `Image` / `<video>` element. Documented at `webcam.ts:4-5` and `:64`, but a decode pass
  is available on the web and would remove the sentinel.
- **No host backend implements webcam.** `host-capacitor/src/` covers thirteen capabilities and has
  no `capacitorWebcam.ts`; `host-electron` and `host-tauri` likewise. The seam has exactly one
  implementation.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 "Implemented APIs" bundle
  checked out **false**: `startWebcamStream`, `getWebcamDevices`, `getWebcamPermissionState`,
  `grabWebcamFrame`, `takeWebcamStreamPhoto`, `applyWebcamStreamConstraints`, `getWebcamPhotoBitmap`,
  `start`/`stopWebcamRecording`, and the four `*WebcamSignals` functions have **zero** occurrences
  across `packages/*/src/`. Two of its subsidiary claims are also false — `'prompt'` was never removed
  (`Webcam.ts:6`) and `WebcamBackend` is three methods, not eleven (`Webcam.ts:29-33`). The
  2026-06-25 correction is itself now stale: `src/` also carries `contract.ts` and `webcamStream.ts`.
- **2026-06-25** — Recommended sweep found all five items targeting source absent from `src/`; the
  richer stream bundle survived only in stale `dist/` output.
- **2026-06-24** — Claimed a Silver-tier live-streaming, recording, device, and signals bundle; see
  the 2026-08-08 entry for what of it is actually in the tree.
