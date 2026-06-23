# Breadth Review: Cross-Cutting Architect — Absent Categories

**Lens:** From a 1000-foot view, judge whether the package set covers the _entire categories_ a mature graphics/application SDK is expected to offer, and flag whole capability classes that are missing or notably thin rather than auditing any one package's depth.

**Coverage: 68/100**

## What a complete SDK owes this perspective

A complete graphics-plus-application SDK that targets OpenFL/Lime feature parity _and_ a full platform layer (web, native via Electron/Tauri/Capacitor, plus a Rust port) is expected to have a coherent answer for each of these category-level concerns:

- **Networking transport** — HTTP/fetch, request/response, WebSockets, streaming/SSE, retry/timeout (OpenFL ships `URLLoader`, `URLRequest`, `Socket`, `URLStream`).
- **Asset loading transport** — a network/file fetch layer underneath the resource/loader packages, with progress, caching, and abort.
- **Scene serialization, save/load, and versioned migration** — the persistence seam for the scene graph.
- **Accessibility (a11y)** — accessible names/roles/focus order; OpenFL has an `accessibility` package.
- **Internationalization / localization** — message catalogs, number/date/plural formatting, locale resolution (distinct from the bidi/shaping already in the text stack).
- **Physics / collision** — at minimum broad-phase collision and overlap queries; ideally a rigid-body integrator (commonly paired with particle/game SDKs).
- **Audio DSP / spatial audio** — gain/pan beyond a channel, filters, an analyser/FFT, 3D positional audio (OpenFL has `SoundTransform`, `SoundMixer`, `computeSpectrum`).
- **Math beyond geometry** — curves/splines, noise, interpolation, statistics, fixed-step accumulators, color-space math.
- **State / data binding** — a reactive or observable layer for app data (optional, but expected by app-layer breadth).
- **Debugging / devtools / profiling** — frame stats, a scene inspector, draw-call counters, a logging spine.
- **Security** — input sanitization, safe-URL handling, CSP/permission helpers for the platform layer.
- **Testing utilities** — fixtures/mocks/golden-image helpers exposed for _consumers_ of the SDK, not just internal CI.

## Well covered

The breadth here is genuinely strong on the dimensions the SDK foregrounds:

- **Rendering breadth** is excellent and clearly the design center: a backend-agnostic `render` core, two GPU cores (`render-gl`, `render-wgpu`), per-subject leaf renderers (`displayobject-*`, `scene-*`), filters and effects each split across canvas/css/surface/gl/wgpu backends. This is more renderer breadth than OpenFL/Lime expose.
- **Platform / OS integration suite** is unusually complete — clipboard, dialog, filesystem, notification, menu, tray, shortcut, screen, storage, device, share, haptics, geolocation, webcam, statusbar, power, lifecycle, keyboard, sensors, plus an app/process layer (`app`, `protocol`, `updater`, `ipc`) and a `host-electron` adapter. Few SDKs cover this surface at all.
- **2D content pipeline** — display objects, shape, path, sprite/tilemap, text + textlayout + textshaper + textinput, particles (+ formats), spritesheet (+ formats), timeline, tween, easing, velocity. This maps cleanly onto OpenFL feature parity.
- **3D scaffolding** — `scene`, `mesh`, `lighting`, `texture`, `camera`, `materials` exist as a coherent (if early) family.
- **A logging spine exists** (`log`), covering part of the debugging category.

## Gaps & missing capabilities

These are whole categories that are absent or thin, ordered by how load-bearing they are for the stated targets.

1. **Networking transport is missing entirely.** `@flighthq/network` is _only_ the connectivity-status event capability (online/offline signals) — confirmed: its `src/` is just `network.ts`. There is no HTTP/fetch, no WebSocket, no SSE/streaming, no request/abort/retry layer anywhere in the set. For an OpenFL-parity SDK this is a glaring hole: `URLLoader`, `URLRequest`, and `Socket` have no home. The name `network` is also already consumed by the connectivity event, so a transport package needs a distinct name (`http`, `fetch`, `socket`).

2. **No asset-loading transport beneath `resources`/`loader`.** `loader` is a batch _queue_ and `resources` builds resources from URLs via browser primitives (`FontFace`, `new Image`), but there is no shared, backend-swappable fetch layer with progress/abort/caching — and nothing for the Rust/native side where `fetch` does not exist. The transport seam that the platform suite applies everywhere else is absent precisely where asset loading needs it.

3. **No scene serialization / save-load / migration package.** The architecture docs describe scenes as "versioned intent, migrated at load" and lean on string kinds being "the serialized form," but _no package implements scene serialization, deserialization, or the versioned migration step._ `particles-formats` and `spritesheet-formats` cover narrow sub-domains; the core scene graph has no persistence. This is the single biggest structural blind spot relative to the SDK's own stated design.

4. **No accessibility category at all.** No a11y/aria/focus/role package; OpenFL has `accessibility`. For an application-layer SDK shipping to the web, this is a category-level omission.

5. **No internationalization / localization.** The text stack handles bidi/shaping/layout (rendering correctness), but there is no message-catalog, plural/number/date formatting, or locale-resolution package. `platform`/`device` expose a `locale` string but nothing consumes it for formatting.

6. **No physics / collision package.** `interaction` does hit testing and overlap detection, and `velocity` does motion, but there is no collision-system or rigid-body package. For an SDK with particles + tilemaps + game-shaped ambitions, broad-phase collision and a simple integrator are an expected category.

7. **Audio is thin (no DSP / spatial).** `media` is `audioChannel` + `videoChannel` only — playback channels, no gain/pan graph, no analyser/FFT (`computeSpectrum` equivalent), no positional/3D audio, no audio bus/mixer. OpenFL's `SoundMixer`/`SoundTransform`/spectrum has no parity here.

8. **`math` is a stub.** Only `nextPowerOfTwo` and `random`. No curves/splines (despite `path` existing), no noise (Perlin/simplex — expected alongside particles/effects), no interpolation/statistics, no fixed-step accumulator, no color-space math. This is "too thin" by the SDK's own AAA-completeness rule.

9. **No debugging/devtools/profiling beyond `log`.** No frame-stats/FPS overlay, no draw-call/triangle counters, no scene inspector, no GPU timing capture exposed to consumers. The internal capture/parity tooling is CI-facing, not a shippable devtools surface.

10. **No security helpers.** No safe-URL/sanitization/permission-policy helpers, which a platform layer that opens external URLs (`shell`), registers protocols (`protocol`), and runs IPC (`ipc`) would benefit from.

11. **No consumer-facing testing utilities.** Rich internal test tooling exists, but nothing is exported for _users_ of the SDK to test their own scenes (fixtures, mock backends, golden-image helpers). Given the swappable-backend design, a `testing`/mock-backends package would be a natural and high-value cell.

12. **No state/data-binding layer** (lower priority). `signals` covers events, but there is no reactive/observable data model for app state. Defensible as out-of-scope, but worth a deliberate decision rather than an accidental gap.

## Missing or too-thin packages I would expect

- `@flighthq/http` (or `fetch`) — request/response, progress, abort, retry, over a swappable transport backend (web `fetch`, native, Rust `reqwest`). The OpenFL `URLLoader`/`URLRequest` home.
- `@flighthq/socket` (or `websocket`) — WebSocket/streaming transport over the same backend pattern.
- `@flighthq/scene-format` (or `serialization`) — scene save/load and the _versioned migration_ step the docs already promise; the persistence seam for the string-kind model.
- `@flighthq/accessibility` (a11y) — accessible name/role/focus tree over a backend (DOM ARIA on web).
- `@flighthq/intl` (or `localization`) — message catalogs + number/date/plural formatting + locale resolution.
- `@flighthq/physics` (or `collision`) — broad-phase collision/overlap queries and a minimal integrator, complementing `velocity`/`interaction`/`particles`.
- Audio depth — either grow `media` or add `@flighthq/audio` for a gain/pan/mixer graph, analyser/FFT, and spatial audio.
- `math` depth — curves/splines, noise (Perlin/simplex), interpolation/statistics, fixed-step accumulator, color-space conversions; bring it to the AAA bar the docs require.
- `@flighthq/devtools` (or `profiler`/`inspector`) — frame stats, draw-call counters, scene inspection, GPU timing.
- `@flighthq/testing` — mock backends, scene fixtures, and golden-image helpers exported for SDK consumers.

## Verdict

The set hangs together impressively along its chosen spine — rendering breadth and OS/platform integration are best-in-class and exceed the OpenFL/Lime target there. But for a _cross-cutting_ architect, three category-level holes undercut the "complete SDK" claim: **no networking/asset transport, no scene serialization/migration, and no accessibility.** The first two are doubly notable because the SDK's own documentation assumes them (URL-based resource loading; versioned scene round-tripping) yet ships no package for either, and because the native/Rust port has _no_ `fetch` to fall back on. Secondary gaps (i18n, physics/collision, audio DSP, a stubbed `math`, consumer testing utilities, devtools) are each a recognizable absent category for a mature SDK. None of these are deep-in-one-package problems; they are missing cells in an otherwise well-bounded cellular architecture, and each fits cleanly as a new tree-shakable package following the existing backend-seam pattern. Closing the transport, serialization, and accessibility gaps would move coverage from "strong but blind in three places" to "complete."
