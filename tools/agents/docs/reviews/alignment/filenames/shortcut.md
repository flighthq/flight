# Filename Alignment: @flighthq/shortcut

**Verdict:** Clean. This is a single-implementation platform-integration domain (NOT a backend-variant package), so the plain domain name `shortcut.ts` is correct and no backend prefix applies; the colocated `shortcut.test.ts` mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/index.ts` — barrel; `export * from './shortcut'`. Correct thin root re-export.
- `src/shortcut.ts` — names the domain (`shortcut`), the global-hotkey capability. Holds the full command-capability surface — `registerGlobalShortcut`, `unregisterGlobalShortcut`, `unregisterAllGlobalShortcuts`, `isGlobalShortcutRegistered`, plus the backend seam (`getShortcutBackend`/`setShortcutBackend`/`createWebShortcutBackend`). This is a single-implementation domain, so a plain domain name with no backend token is the right rule. The web default backend builder living in the same domain file (not a separate `webShortcut.ts`) matches the platform-suite pattern where the web fill is part of the capability, not a separate backend variant.
- `src/shortcut.test.ts` — colocated test mirroring `shortcut.ts` exactly.

No generic dumping-ground names (`data.ts`, `utils.ts`, etc.). No single-function-named files. No missing/suffix-style backend tokens (none required here).
