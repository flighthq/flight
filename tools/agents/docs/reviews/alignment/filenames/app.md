# Filename Alignment: @flighthq/app

**Verdict:** Clean. This is a single-implementation domain package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package — it uses a swappable `AppBackend` seam internally rather than per-file backend variants), so files take plain domain/object names with no backend prefix; all three source files pass the bare-filename test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `app.ts` — names the domain/object exactly. The package is `@flighthq/app` and its central entity is `App`; the file covers the whole `app` domain (identity, lifecycle control, single-instance locking, dock/badge control, app event signals). Folder-removed, the bare name `app` is self-describing. Not a single-function file — it holds the full app surface.
- `app.test.ts` — colocated test mirroring `app.ts` per the one-test-file-per-source convention.
- `index.ts` — conventional package root barrel (`export * from './app'`), a thin re-export and not a dumping ground; the codebase's single-`.`-entry rule expects exactly this.
