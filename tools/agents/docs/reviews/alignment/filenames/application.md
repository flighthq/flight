# Filename Alignment: @flighthq/application

**Verdict:** Single-implementation domain package (not a backend-variant `*-canvas`/`-dom`/`-gl`/`-wgpu` package), so plain domain/object filenames with NO backend prefix are correct. The two core files (`application.ts`, `window.ts`) are clean; the two `web*` alias files carry a `web` backend-token prefix that does not belong in a single-implementation package and name no real module.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `webApplication.ts` | Misleading backend-style `web` prefix in a non-backend-variant package — implies a web-specific variant module that does not exist. The file is alias-only (`export { createApplication as createWebApplication }`), is not wired into `index.ts` (not public API), and is unused elsewhere in the repo. The `web` token belongs to the platform default-backend convention, which here is already covered by `createWebWindowBackend` inside `window.ts`. The filename names no domain/object of its own. | Fold the alias into `application.ts` (or drop the alias entirely) and delete this file. If alias re-exports must live in a dedicated file, no descriptive single-domain name exists for an alias-only module — that is the signal the file should not exist. |
| `webWindow.ts` | Same as above: `web` prefix on a single-implementation package, alias-only content (`createApplicationWindow as createAppWindow`, `as createWebWindow`), absent from `index.ts`, unused externally. Filename advertises a "web window" variant that is not a distinct implementation. | Fold the aliases into `window.ts` (or drop them) and delete this file. |

Note: the build output also retains a stale `dist/html5Window.d.ts` from a prior name for the same alias module, confirming this alias file has churned through misleading platform-token names (`html5Window` → `webWindow`) rather than settling on a real domain/object name — additional evidence the module should not exist as its own file.

## Clean

| File | Why |
| --- | --- |
| `application.ts` | Names the `Application` object/domain it owns (entity, lifecycle signals, main loop). Bare filename is self-describing; no backend prefix needed. |
| `window.ts` | Names the `Window`/`ApplicationWindow` object/domain (window entity, all window-control commands, event attach/detach, the web window backend). Bare filename is self-describing; no backend prefix needed. |
| `application.test.ts` | Colocated, mirrors `application.ts`. |
| `window.test.ts` | Colocated, mirrors `window.ts`. |
| `webApplication.test.ts` / `webWindow.test.ts` | Correctly mirror their sources; would be removed alongside the source files above. |
| `index.ts` | Thin barrel re-exporting `application` and `window` only. Correct conventional name. |
