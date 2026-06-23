# TS↔Rust Alignment: @flighthq/filesystem

**Verdict:** In sync — all 16 native verbs map 1:1 (camelCase→snake_case, full type words, sentinel/teardown conventions preserved); the only TS-side absentee (`createWebFileSystemBackend`) is a documented web-relocation, and the only Rust-side addition (`NativeFileSystemBackend`) is the documented in-crate native default. Two map-coverage nits below, no code drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebFileSystemBackend` (`filesystem.ts`) | — (no `create_web_file_system_backend`) | Expected per the divergence map's [Web-relocated functions](../../../rust/conformance.md) section (lists `filesystem`): the OPFS backend belongs in `host-web`, and Rust's ambient default is native/std (rust/index.md "Host layer"). **Map nit:** that section frames relocation as "verbs validated in the browser," but this is a _factory_, not a verb — its Rust home is a future `create_web_file_system_backend` in `host-web`, distinct from the in-crate native default. Worth a one-line note so the factory is not mistaken for an uncovered gap. |
| — (no TS equivalent) | `NativeFileSystemBackend` (struct, `filesystem.rs` / re-exported in `lib.rs`) | Rust-only public struct: the in-crate native default backend gated behind the std path (rust/index.md "Host layer": capabilities std can serve ship a native default in-crate). Legitimate Rust-port decision, but it is a `struct`, so the function-name-based conformance script neither credits nor flags it. Not currently named in the divergence map's `RUST_ONLY` discussion (which only calls out `displayobject-skia`); native default backends are a category the map could acknowledge. |
| all 17 TS fns return `Promise<…>` | all 16 Rust fns are synchronous | Suite-wide async→sync flip. Justified by the "Async/`Send` seam note" in rust/index.md (keep the seam native-clean, sync where native is sync; `host-web` bridges `!Send` internally). **Map nit:** this rationale lives only in rust/index.md, not in `conformance.md`'s auditable divergence registry. The async→sync stance for the whole platform suite should be a recorded entry there, not only narrative in the index. |

## In sync

- **Package→crate name:** `@flighthq/filesystem` → `flighthq-filesystem`, identity. Cargo `description` matches package.json verbatim.
- **File names:** `filesystem.ts` ↔ `filesystem.rs`, identity basename.
- **16 verbs map 1:1** with full unabbreviated type words: `appendTextFile`/`append_text_file`, `copyFile`/`copy_file`, `fileExists`/`file_exists`, `getFileSystemBackend`/`get_file_system_backend`, `getFileSystemPath`/`get_file_system_path`, `makeDirectory`/`make_directory`, `readBinaryFile`/`read_binary_file`, `readDirectory`/`read_directory`, `readTextFile`/`read_text_file`, `removeFile`/`remove_file`, `renameFile`/`rename_file`, `setFileSystemBackend`/`set_file_system_backend`, `statFile`/`stat_file`, `watchPath`/`watch_path`, `writeBinaryFile`/`write_binary_file`, `writeTextFile`/`write_text_file`.
- **Sentinel convention preserved:** TS `null`/`false`/`[]` → Rust `Option`/`bool`/`Vec` (`readTextFile`→`Option<String>`, `readDirectory`→`Vec<FileEntry>`, etc.). Both treat absent files as expected outcomes, not errors.
- **Backend seam preserved:** `get_file_system_backend`/`set_file_system_backend` mirror the TS getter/setter; shared types (`FileEntry`, `FileStat`, `FileSystemBackend`, `FileSystemPathKind`, `FileWatchEvent`) live in `flighthq-types` on both sides, with `FileWatchEventType` also surfaced in Rust.
- **`watch_path` teardown:** TS returns `() => void` unsubscribe; Rust returns `Box<dyn Fn() + Send + Sync>` — the same release-closure shape.
- **`Readonly<Uint8Array>` → `&[u8]`** for `write_binary_file`; immutable-borrow-by-default convention honored.

### Minor non-alignment observations (not drift)

- `setFileSystemBackend(null)` in TS resets to the lazy web default and can be called repeatedly; the Rust `set_file_system_backend` takes a non-nullable `Box<dyn …>` over a `OnceLock` and **panics if called twice**. Behaviorally divergent (re-installation impossible, no null-reset), a consequence of `OnceLock`. Acceptable for a native default seam but not a 1:1 of the TS reset semantics — note it if the map ever tightens backend-swap conformance.
- Native `watch` is a no-op stub (returns no-op unsubscribe), matching the web no-op; full OS watching (inotify/kqueue) is deferred. Consistent with TS web behavior, so not a conformance gap today.
