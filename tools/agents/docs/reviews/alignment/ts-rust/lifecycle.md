# TS↔Rust Alignment: @flighthq/lifecycle

**Verdict:** In sync — every portable TS export has a faithful snake_case Rust function, the one absent export (`createWebLifecycleBackend`) is a documented host-web divergence, and the shared types match; the only real gap is missing Rust tests for the three attach/detach/dispose verbs (the source `npm run rust:conformance` "4 missing" is a test-coverage artifact, not a missing port).

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `attachAppLifecycle` (`lifecycle.ts`) | `attach_app_lifecycle` (`lifecycle.rs`) | Ported and implemented faithfully. Conformance script lists it as "missing" only because no Rust test name contains it (the script measures coverage by test name, not by `pub fn`). **Add a Rust test** so it is no longer flagged. |
| `createAppLifecycle` (`lifecycle.ts`) | `create_app_lifecycle` (`lifecycle.rs`) | Aligned; covered by test. |
| `createWebLifecycleBackend` (`lifecycle.ts`) | — (none) | Intentionally absent. Web/DOM-bound verb; per conformance.md it belongs in `host-web`, with the seam (`get_/set_lifecycle_backend`) held here. Documented divergence — see note below; native fallback is the in-crate `StubLifecycleBackend`. |
| `detachAppLifecycle` (`lifecycle.ts`) | `detach_app_lifecycle` (`lifecycle.rs`) | Ported and implemented faithfully. Flagged "missing" only for lack of a test name match. **Add a Rust test.** |
| `disposeAppLifecycle` (`lifecycle.ts`) | `dispose_app_lifecycle` (`lifecycle.rs`) | Ported faithfully; `dispose_*` teardown verb preserved (detaches subscription, leaves signals to GC). Flagged "missing" only for lack of a test. **Add a Rust test.** |
| `getAppLifecycleState` (`lifecycle.ts`) | `get_app_lifecycle_state` (`lifecycle.rs`) | Aligned; covered by test. |
| `getLifecycleBackend` (`lifecycle.ts`) | `get_lifecycle_backend` (`lifecycle.rs`) | Aligned; covered. Returns `Arc<dyn LifecycleBackend>` vs TS object — idiomatic, the "always a backend" guarantee is preserved via the stub. |
| `setLifecycleBackend` (`lifecycle.ts`) | `set_lifecycle_backend` (`lifecycle.rs`) | Aligned; `null` → `Option<…>` sentinel convention preserved; covered. |

## In sync

- **Crate name** is identity (`@flighthq/lifecycle` → `flighthq-lifecycle`); no rename.
- **File name** tracks: TS `lifecycle.ts` ↔ Rust `lifecycle.rs`, same single-file domain basename. `index.ts` ↔ `lib.rs` barrel.
- **Function names** map 1:1 with camelCase→snake_case and full type words preserved (`AppLifecycle`, `LifecycleBackend` never abbreviated).
- **Convention carry-over** is clean: `null` → `Option`, `out`-free pure getters, `dispose_*`/`detach_*`/`attach_*` verbs preserved, sentinel "always a backend" guarantee.
- **Shared types match.** `@flighthq/types` `Lifecycle.ts` ↔ `flighthq-types` `platform.rs`: `AppLifecycleState` (`active`/`inactive`/`background` ↔ `Active`/`Inactive`/`Background`), `LifecycleBackend` (`getState`/`subscribe`), and the `AppLifecycle` entity's four signals (`onStateChange`/`onResume`/`onPause`/`onBackButton`).
- **Behavioral parity** in `attach`: reads previous state, emits `on_state_change` every change, `on_resume` on transition into `Active`, `on_pause` on leaving `Active`, idempotent (detaches first); stub/web never drives `on_back_button`.

## Divergence-map notes

- The `createWebLifecycleBackend` omission is **already covered** by conformance.md's blanket host-web entry (the platform-suite list explicitly names `lifecycle`): web-backend verbs live in `host-web`, the owning crate keeps only `get_/set_*_backend`. No per-symbol entry is required, and none is stale. Worth confirming the eventual `host-web` `create_web_lifecycle_backend` lands there so the seam is actually filled, not just deferred.
- The three "missing" verbs (`attach`/`detach`/`dispose`) are **not** divergences — they are ported. They are a test-coverage gap that inflates the script's count. Adding three Rust tests would zero out lifecycle's `⚠️` without any source change. No map entry needed.
