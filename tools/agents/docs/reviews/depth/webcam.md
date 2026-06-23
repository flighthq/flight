# Depth Review: @flighthq/webcam

**Domain:** Device camera media capture — take a photo, record a video, and pick an existing image from the photo library, over a swappable web/native backend. (Distinct from `@flighthq/camera`, which is the 3D view/projection camera; this package is the OS/host "camera roll + capture" capability, in the mold of Capacitor `Camera` / Cordova `camera`.)

**Verdict:** partial — 45/100

This is a thin but coherently-designed capture seam. It implements the most common single-shot operations (take photo, pick image, record video, request permission) with a correct sentinel-returning web backend and a clean `*Backend` injection point. But for a domain whose authoritative reference is a _live_ camera stream (getUserMedia / `MediaStream`), it is missing the entire live-preview and frame-grab dimension, plus device enumeration, constraints, and most capture metadata. As an isolated "webcam" library it would surprise a user who expects a video feed.

## Present capabilities

- `takeWebcamPhoto(options?)` — single-shot photo capture from the device camera, resolves `WebcamPhoto | null`.
- `pickWebcamImage(options?)` — pick an existing image from the library (`source: 'photos'`).
- `recordWebcamVideo(options?)` — record a video clip, resolves `WebcamVideo | null`.
- `requestWebcamPermission()` — resolves `boolean`.
- `getWebcamBackend()` / `setWebcamBackend()` / `createWebWebcamBackend()` — the backend seam: always-available lazily-created web default, native override via `set*`, web factory exported for granular use. This matches the platform-suite command-capability pattern exactly.
- Web backend implemented over a transient `<input type="file" accept="image/*"|"video/*" capture="environment">`, with `FileReader` → data URL. Correctly returns `null` in jsdom / on cancel / on read error rather than throwing.
- Permission check via the Permissions API (`navigator.permissions.query({ name: 'camera' })`), honestly documented as state-only (does not prompt).
- Options type carries `source` (camera/photos/prompt), `quality`, `allowEditing`, `maxDurationMs`.
- Result types `WebcamPhoto` (dataUrl/width/height/format) and `WebcamVideo` (dataUrl/duration/format).

## Gaps vs an authoritative camera-capture library

The canonical reference here is a combination of the WebRTC `getUserMedia`/`MediaStream` API and the mobile camera plugins (Capacitor `Camera`, Cordova). Against that bar, large pieces are missing-by-omission:

- **No live preview / stream.** There is no `MediaStream`, no "start the camera and show a feed" path, no attach-to-element/surface. This is the defining feature of a _webcam_ (vs a one-shot photo picker). Missing.
- **No frame grab from a live stream.** No `grabFrame`/`captureFrame` into an `ImageSource`/`ImageBitmap`/pixel buffer for processing — the natural bridge to `@flighthq/surface`. Notably the photo result is a `dataUrl` string, not a Flight `ImageSource`, so even the still capture does not integrate with the SDK's pixel layer.
- **No device enumeration / selection.** No `enumerateDevices`/`getCameras`, no `deviceId` selection. Missing.
- **No facing-mode beyond an implicit `environment`.** No front/back/user toggle in the options; the web backend hardcodes `capture="environment"`. No torch/flash, zoom, focus, exposure, or white-balance controls (the `MediaTrackCapabilities`/`applyConstraints` surface).
- **No capture constraints.** No requested resolution/aspect/frame-rate; `quality` exists in the type but the web backend ignores it (file input cannot honor it).
- **Thin metadata.** Web photo `width`/`height` resolve to `0` (not decoded) and video `duration` is `0`. No EXIF/orientation, no captured timestamp, no byte size. A robust library decodes at least dimensions.
- **No explicit permission-state query distinct from a request.** `requestWebcamPermission` only reports `granted` via the state API; there is no `getWebcamPermissionState()` returning prompt/granted/denied, and the web path can never actually prompt.
- **No live events.** No device-change / stream-ended / permission-change notification (would be the event-capability shape if a stream existed).
- **No audio dimension for video.** No mic toggle / audio-only options on video recording.

Some of these are reasonably **missing-by-design** for the _photo-picker_ reading of the domain (e.g. EXIF stripping, editing UI), and the web file-input limitations (0 dimensions, ignored quality) are honestly documented and legitimately deferred to native hosts. But the absence of any live-stream/frame-grab path is missing-by-omission, not by design — it is the core of the domain, and the SDK already has a `surface`/`ImageSource` pixel layer this should feed.

## Naming / API-shape notes

- Function names are fully spelled and self-identifying (`takeWebcamPhoto`, `recordWebcamVideo`, `pickWebcamImage`), consistent with the design rules and the rest of the platform suite. Good.
- The verb split is sensible: `take*` (capture new), `record*` (capture new video), `pick*` (choose existing). This reads correctly.
- `WebcamSource` includes `'prompt'` but no exported function uses it; only `'camera'`/`'photos'` are wired by the helpers. The backend could honor `prompt` but there is no first-class entry for it.
- Result as `dataUrl: string` is a deliberate plain-data choice, but it diverges from the SDK's `ImageSource` convention; a robust capture library in this codebase would return (or offer) an `ImageSource` so captured pixels flow into `surface`/filters without a re-decode.
- Naming collision risk with `@flighthq/camera` is handled well by the `Webcam*` prefix on every symbol — the two domains stay grep-distinct.
- Backend seam (`get`/`set`/`createWeb*`) is textbook for the suite. No notes.

## Recommendation

Treat the current package as the **capture-and-pick** half of the domain and decide explicitly whether live streaming is in scope. If "webcam" is meant to be authoritative, the live-stream dimension is required: add a `WebcamStream` entity (start/stop over `getUserMedia`), a `grabWebcamFrame(stream, out)` that writes into an `ImageSource`, device enumeration (`getWebcamDevices`), facing-mode/torch/zoom constraints, and a real permission-state query. At minimum, decode photo dimensions and return (or expose) an `ImageSource` so captures integrate with `@flighthq/surface`. As it stands the package is a competent single-shot media-picker seam, not an authoritative webcam library — partial, with a clean foundation to build the missing live-capture half onto.
