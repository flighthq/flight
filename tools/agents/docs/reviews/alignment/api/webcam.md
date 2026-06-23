# API Alignment: @flighthq/webcam

**Verdict:** Strong — a clean command-capability seam that matches its siblings (`clipboard`, `shell`, `share`) on backend verbs, `Readonly` inputs, and sentinel-not-throw failure; only minor naming and option-override nits worth noting.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `takeWebcamPhoto`, `recordWebcamVideo`, `pickWebcamImage` | Each spreads `{ ...options, source: 'camera' \| 'photos' }`, so a caller-supplied `options.source` is silently overridden. The `WebcamSource` field (`'camera' \| 'photos' \| 'prompt'`) then becomes unreachable through any function — `'prompt'` in particular has no way to be selected, and passing `source` to these helpers is a no-op. | Either drop `source` from `WebcamCaptureOptions` (since the verb already fixes the source) or stop overriding it and let the helper supply only a default (`{ source: 'camera', ...options }`). Decide whether `'prompt'` needs a dedicated entry point. |
| Low | `createWebWebcamBackend` | The doubled token "WebWebcam" reads awkwardly. It is the literal application of the `createWeb<Type>Backend` convention (cf. `createWebClipboardBackend`), so it is consistent and not wrong — flagged only because the type word already begins with "Web". | Keep for cross-package symmetry; no change recommended. Noted so a future reviewer does not "fix" it into divergence. |
| Low | `WebcamBackend.capture` / `captureVideo` (in `@flighthq/types`) | The backend contract types `options` as non-optional `Readonly<WebcamCaptureOptions>`, but the public functions type it `options?` and pass spread objects. This is internally consistent (the public layer always supplies `source`), but the backend method name `capture` is generic relative to the package's `Webcam` type word. | Optional: consider `captureWebcamPhoto`/`captureWebcamVideo` on the backend for the full-type-word rule, though backend method names are interface-internal and not package-root exports, so impact is low. |

## Clean

- **Full, unabbreviated type word.** Every exported function carries `Webcam` in full (`getWebcamBackend`, `setWebcamBackend`, `takeWebcamPhoto`, `recordWebcamVideo`, `pickWebcamImage`, `requestWebcamPermission`). No abbreviation.
- **Command-capability seam parity.** `createWebWebcamBackend` / `getWebcamBackend` / `setWebcamBackend` exactly mirror the `clipboard`/`shell`/`share` trio (`createWeb*Backend` / `get*Backend` / `set*Backend`, with `set*` taking `Backend | null` to fall back to the web default). Verb choice is consistent within the platform suite.
- **Sentinels, not throws.** All capture paths resolve `null` (or `false` for `requestWebcamPermission`) on cancel/deny/absent rather than throwing — the documented expected-failure posture for platform seams. No validation of unreachable invariants.
- **`Readonly<T>` on inputs.** `WebcamCaptureOptions` is taken as `Readonly<WebcamCaptureOptions>` at every public entry point and in the `WebcamBackend` contract.
- **Accessor verbs.** `getWebcamBackend` is a true getter; `requestWebcamPermission` returns `Promise<boolean>` and correctly uses an action verb (`request*`) rather than a `get*` boolean accessor — appropriate since it performs work.
- **Cross-package types.** `WebcamBackend`, `WebcamCaptureOptions`, `WebcamPhoto`, `WebcamVideo` all live in `@flighthq/types` (`Webcam.ts`); none are redefined inline. The single import is `import type { ... }` on its own line.
- **Side-effect-free seam.** The active backend is a lazily-created module-private `_backend` (placed at file bottom per source style); no registration or backend creation runs at import time. `"sideEffects": false` is declared; only dep is `@flighthq/types`.
- **Rust conformance.** Crate `flighthq-webcam` exists and is identity-mapped (no rename); the `camera`-vs-`webcam` semantic split is documented in `conformance.md`.
