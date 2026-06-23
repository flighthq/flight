# TS↔Rust Alignment: @flighthq/share

**Verdict:** Fully in sync — all 5 TS exports (including `createWebShareBackend`) map 1:1 to `flighthq-share` with correct snake_case and full type words; the conformance script's `share (5) ⚠️` is a false positive from a transient `cargo test --list` failure, not a real gap (the crate lists 8 tests covering all 5 functions).

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `canShareContent` / `share.ts` | `can_share_content` / `share.rs` | None — 1:1. `Readonly<ShareContent>` → `&ShareContent`; `boolean` → `bool`. |
| `createWebShareBackend` / `share.ts` | `create_web_share_backend` / `share.rs` | None — 1:1. Notably **present** in Rust (unlike most platform-suite `createWeb*Backend`, which are web-relocated to `host-web`). Correct: in `share` this is the sentinel default that returns `false` everywhere — it has no browser-only body to relocate, so it is genuinely native-applicable. Returns `Arc<dyn ShareBackend>` vs the TS `ShareBackend` object literal. |
| `getShareBackend` / `share.ts` | `get_share_backend` / `share.rs` | None — 1:1, and behavior matches exactly. Both lazily install the web default ("There is always a backend"). Rust does **not** take the clipboard/dialog panic-until-installed flip — `get_share_backend` lazily creates `create_web_share_backend()`, mirroring TS line-for-line, because the web default here is a pure sentinel with no host dependency. |
| `setShareBackend` / `share.ts` | `set_share_backend` / `share.rs` | None — 1:1. `ShareBackend \| null` → `Option<Arc<dyn ShareBackend>>` (`null`→`Option` carried). |
| `shareContent` / `share.ts` | `share_content` / `share.rs` | None — 1:1. `Promise<boolean>` → `async -> bool`; `Readonly<ShareContent>` → `&ShareContent`. |

No abbreviations, no renamed-without-reason, no extra Rust functions. The only non-exported Rust item is `WebShareBackend` (the private sentinel struct backing `create_web_share_backend`), which has no TS counterpart by design — TS uses an inline object literal for the same role.

## In sync

- **Crate name** is identity: `@flighthq/share` → `flighthq-share`. No rename; not in (and does not need to be in) the divergence map.
- **File names** track: `share.ts` ↔ `share.rs`; `index.ts` ↔ `lib.rs` (the standard barrel↔crate-root mapping). `lib.rs`'s `pub use share::{…}` re-exports the full verb set, mirroring `index.ts`'s `export * from './share'`.
- **Verb set**: all 5 TS exports present with correct snake_case and full type words preserved (`can_share_content`, `create_web_share_backend`, `get_share_backend`, `set_share_backend`, `share_content`).
- **Sentinel / async conventions** carry across: `false`/`Promise<boolean>` → `bool`/`async -> bool`; `null`→`Option`. Both `lib.rs` and `share.rs` doc comments state the rule explicitly ("an expected-failure surface, not a programmer error").
- **Backend seam shape** matches the platform-suite pattern: `get_*_backend` / `set_*_backend` over a `ShareBackend` trait in `flighthq-types` (`crates/flighthq-types/src/platform.rs:821`), with `ShareContent` (`platform.rs:815`) mirroring TS `packages/types/src/Share.ts`. Native/mobile host installs its own via `set_share_backend`.
- **Out-param / teardown verbs**: none apply (all value-returning sync/async verbs); nothing to misalign. No `dispose_`/`destroy_`/`acquire_`/`release_` in scope.
- **Test alignment**: Rust `mod` test names mirror the exported function names exactly (`mod can_share_content`, `mod create_web_share_backend`, `mod get_share_backend`, `mod set_share_backend`, `mod share_content`), all alphabetized — matching the TS describe-block convention.

### Conformance-script note (false positive — no divergence-map change needed)

`npm run rust:conformance` reports `share | 5 | 0 | 8 | 5 ⚠️` and lists all 5 functions as unmatched. This is **not** real drift. The script measures coverage by running `cargo test -p flighthq-share -- --list` and matching snake_case TS names against the returned test names; its `catch` returns `[]` on any failure, so a transient/parallel `cargo` build hiccup during the full-workspace run produces a spurious 0-covered. Running the same command in isolation succeeds and lists all 8 tests, each covering one of the 5 functions:

```
share::tests::can_share_content::reflects_the_backend_result: test
share::tests::create_web_share_backend::returns_false_for_share_and_can_share_when_the_api_is_absent: test
share::tests::get_share_backend::falls_back_to_a_web_backend: test
share::tests::set_share_backend::clears_back_to_the_web_fallback_when_passed_none: test
share::tests::share_content::shares_via_the_active_backend: test
...  (8 tests, 0 benchmarks)
```

No divergence-map entry is warranted — there is nothing to record. `share` is correctly listed as in-scope (mobile capability with native substrate) in `conformance.md` line 100/126. If the conformance script's reliability matters, the real follow-up is on the **tooling** side (make `rustTestNames` resilient to build contention / surface cargo stderr instead of silently returning `[]`), not on the crate.
