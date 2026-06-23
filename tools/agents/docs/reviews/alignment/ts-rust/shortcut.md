# TS↔Rust Alignment: @flighthq/shortcut

**Verdict:** In sync — all six core functions port 1:1 (camelCase→snake_case, full type words, sentinels/`Option` preserved); the only gap is the `createWebShortcutBackend()` factory, which Rust idiomatically reshapes into the `WebShortcutBackend` struct (covered in spirit by the web-relocated-functions clause), but that struct-vs-factory reshape is not an explicit divergence-map entry.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebShortcutBackend()` → `ShortcutBackend` (`shortcut.ts`) | `WebShortcutBackend` struct + `Arc::new(WebShortcutBackend)` (`shortcut.rs`) | Factory function reshaped into a public struct. This is the correct Rust idiom (no `Box<dyn Fn>` closure record to build; `impl ShortcutBackend for WebShortcutBackend`), and the seam itself (`get_/set_shortcut_backend`) is ported. The conformance script counts it as 1 unmatched extra and the "Web-relocated functions" clause in conformance.md lists `shortcut` generically, but that clause is about verbs relocated to `host-web`, not about a `create*Backend` factory becoming a struct. The reshape is justified, not drift, but it is not explicitly recorded. Suggest a one-line divergence-map note: "platform-suite `createWeb*Backend()` factories map to a public `Web*Backend` unit struct in Rust." |
| `getShortcutBackend()` (`shortcut.ts`) | `get_shortcut_backend()` (`shortcut.rs`) | None — 1:1, returns `Arc<dyn ShortcutBackend>` vs TS object. |
| `setShortcutBackend(backend: ShortcutBackend \| null)` | `set_shortcut_backend(backend: Option<Arc<dyn ShortcutBackend>>)` | None — `\| null` → `Option`, correct sentinel mapping. |
| `isGlobalShortcutRegistered(accelerator)` | `is_global_shortcut_registered(accelerator)` | None — `is_`/`has_` boolean prefix preserved, full type words intact. |
| `registerGlobalShortcut(accelerator, handler)` | `register_global_shortcut(accelerator, handler: Box<dyn Fn() + Send + Sync>)` | None — `() => void` → `Box<dyn Fn() + Send + Sync>`, the standard Rust callback mapping. |
| `unregisterAllGlobalShortcuts()` | `unregister_all_global_shortcuts()` | None — 1:1. |
| `unregisterGlobalShortcut(accelerator)` | `unregister_global_shortcut(accelerator)` | None — 1:1. |
| `shortcut.ts` | `shortcut.rs` | None — filename tracks exactly. |
| `index.ts` (barrel) | `lib.rs` (re-export) | None — expected TS-barrel↔Rust-`lib.rs` shape; all symbols re-exported. |

## In sync

- **Crate name** is identity: `@flighthq/shortcut` → `flighthq-shortcut`. No rename, none needed.
- **All six core free functions** map 1:1 with correct casing and unabbreviated type words. No abbreviations, no renames-without-reason, no extra Rust functions beyond the `WebShortcutBackend` struct.
- **Filename** `shortcut.rs` tracks `shortcut.ts`; module-per-source-file convention honored.
- **Sentinel convention** carries: every web-backend operation returns `false` / no-op in both languages; `register`/`unregister`/`is_registered` are sentinel-`false`, `unregister_all` is a no-op. No panics on the expected-failure path; the only `panic!`/`expect` is on a poisoned mutex (programmer-error path), which is correct.
- **Backend-seam pattern** matches the platform-integration suite: `get_*_backend` lazily installs the web default, `set_*_backend(None)` reverts. Module-level state is `Mutex<Option<Arc<dyn>>>`, the standard Rust expression of the TS lazy `_backend` singleton.
- **No teardown verbs** in this surface (no `dispose_`/`destroy_`/`acquire_`/`release_`), so nothing to mismatch.
- **Tests** are colocated and mirror exported function names with alphabetized `describe`-equivalent ordering (Rust `#[test]` fns grouped under `// fn_name` comments, alphabetical).

### Suggested divergence-map addition

Add a single shared note (not per-package) to `tools/agents/docs/rust/conformance.md` clarifying that the platform suite's `createWeb*Backend()` factory functions are intentionally realized in Rust as a public `Web*Backend` unit struct constructed with `Arc::new(...)`. This converts the recurring per-crate "1 ⚠️" (shortcut, statusbar, storage, surface, textinput, tray all show `createWeb*`/`create*From*` as the unmatched extra) from apparent drift into a recorded, intentional shape mapping that the conformance script's denominator can account for.
