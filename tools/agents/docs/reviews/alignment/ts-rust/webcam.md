# TS↔Rust Alignment: @flighthq/webcam

**Verdict:** Fully aligned — all 7 exported functions port 1:1 (camelCase→snake_case, full type words preserved), the `camera`→`webcam` rename is recorded in the divergence map, and conformance reports 7/7 functions with 10 tests and 0 gaps.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebWebcamBackend` / `webcam.ts` | `create_web_webcam_backend` / `webcam.rs` | None — 1:1, full type word preserved. |
| `getWebcamBackend` / `webcam.ts` | `get_webcam_backend` / `webcam.rs` | None — `get_` accessor preserved. |
| `pickWebcamImage` / `webcam.ts` | `pick_webcam_image` / `webcam.rs` | None. |
| `recordWebcamVideo` / `webcam.ts` | `record_webcam_video` / `webcam.rs` | None. |
| `requestWebcamPermission` / `webcam.ts` | `request_webcam_permission` / `webcam.rs` | None. |
| `setWebcamBackend` / `webcam.ts` | `set_webcam_backend` / `webcam.rs` | None — `set_` mutator preserved. |
| `takeWebcamPhoto` / `webcam.ts` | `take_webcam_photo` / `webcam.rs` | None. |
| `index.ts` (barrel `export *`) | `lib.rs` (named `pub use`) | None — expected per-language idiom; the seven names re-exported match exactly. |

No missing ports, no abbreviations, no extra Rust functions beyond the seven TS exports (the private `with_source` helper mirrors the TS `{ ...options, source }` spread and is not a public export).

## In sync

- **Crate name** is identity: `@flighthq/webcam` → `flighthq-webcam`. The `camera`→`webcam` rename (TS's old photo-capture `camera` became `webcam`; `camera` now means the 3D scene camera) is a recorded, non-stale entry in `conformance.md` (lines 52, 100, 126, 144, 156). No undocumented name divergence.
- **File names** track: `webcam.ts` ↔ `webcam.rs`; same domain basename. Test colocation matches (`webcam.test.ts` ↔ `#[cfg(test)] mod tests` in `webcam.rs`).
- **Conventions carry across:**
  - Sentinel `null` → `Option` (`Promise<WebcamPhoto | null>` → `async … -> Option<WebcamPhoto>`); `Promise<boolean>` → `async … -> bool`.
  - `Readonly<WebcamCaptureOptions>` → `&WebcamCaptureOptions` (immutable borrow).
  - `setWebcamBackend(backend | null)` → `set_webcam_backend(Option<Arc<dyn WebcamBackend>>)` — seam pattern preserved, `None` clears to web fallback.
  - Optional TS param (`options?`) → required `&WebcamCaptureOptions` with Rust `Default::default()` at call sites — standard, acceptable per the suite.
  - Async/`Send` seam: Rust returns `Pin<Box<dyn Future<… > + Send>>`, keeping the trait native-clean per the rust/index.md host-layer note.
- **Seam-plus-sentinel default** is faithful: TS web backend resolves to `null`/`0`-dimensioned data when no DOM substrate; Rust `WebWebcamBackend` resolves every method to its sentinel (`None`/`false`) since the box has no DOM. Both lazily create the web default in `get*Backend`; "there is always a backend" holds in both.
- **Shared types** live in `@flighthq/types` / `flighthq-types` (`platform.rs`): `WebcamSource`, `WebcamCaptureOptions`, `WebcamPhoto`, `WebcamVideo`, `WebcamBackend` — all present on both sides.
- **Conformance script sets** are consistent: `webcam` is in `WEB_PACKAGES` (governs gap classification only; webcam has 0 gaps so it is moot) and `WEB_PACKAGES`/`RENAMES` are aligned with the map.

Nothing to add to the divergence map; no stale entries observed for this pair.
