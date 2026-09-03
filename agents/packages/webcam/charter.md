---
package: '@flighthq/webcam'
role: package
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

Device camera media capture -- take a photo, record a video, and pick an existing image from the photo library, over a swappable `WebcamBackend`. The web backend (wrapping `navigator.mediaDevices` / `getUserMedia`) is installed explicitly via `enableHostWebWebcam()` from `@flighthq/host-web`; a native host replaces via `setWebcamBackend`. Resolution: custom > host > sentinel. Distinct from `@flighthq/camera` (3D view/projection camera); this package is the OS/host camera-roll + capture capability, in the mold of Capacitor Camera / Cordova camera.

## Decisions

- **[2026-07-02] Package is unfinished, not blocked.** Types define 13 files but source implementation is minimal. This is incomplete work to be built out, not a design problem.
- **[2026-07-02] Fix `null as any` cast.** `WebcamStreamRuntime.mediaStream` is typed non-nullable but initialized as `null as any`. Fix by making the field nullable (`MediaStream | null`, initialized to `null`) or by deferring initialization to a factory that supplies the real value.

- **[2026-09-02] One-shot media capture is absorbed into dialog.** The former ambient `MediaFileCapture` seam, setter, installer, sentinel, and web compatibility enabler are removed. `@flighthq/webcam` is reserved for future explicit-host live device streaming, device enumeration, and stream lifecycle.

## Open directions

The 2026-07-02 direction to scope one-shot photo capture, video recording, and photo-library picking is closed by the dialog absorption decision above.

- Live device streaming remains unimplemented: define device enumeration and start, stop, and pause lifecycle before this package gains exports.
