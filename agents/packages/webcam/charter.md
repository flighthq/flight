---
package: '@flighthq/webcam'
crate: flighthq-webcam
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# webcam — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Device camera media capture -- take a photo, record a video, and pick an existing image from the photo library, over a swappable `WebcamBackend`. The web default wraps `navigator.mediaDevices` / `getUserMedia`; a native host replaces via `setWebcamBackend`. Distinct from `@flighthq/camera` (3D view/projection camera); this package is the OS/host camera-roll + capture capability, in the mold of Capacitor Camera / Cordova camera.

## Decisions

- **[2026-07-02] Package is unfinished, not blocked.** Types define 13 files but source implementation is minimal. This is incomplete work to be built out, not a design problem.
- **[2026-07-02] Fix `null as any` cast.** `WebcamStreamRuntime.mediaStream` is typed non-nullable but initialized as `null as any`. Fix by making the field nullable (`MediaStream | null`, initialized to `null`) or by deferring initialization to a factory that supplies the real value.

## Open directions

- Scope of the full capture API: photo, video recording, photo-library picker, device enumeration, torch/flash control.
- Whether stream lifecycle (start/stop/pause) warrants its own event entity or stays as plain callbacks.
