# Depth Review: @flighthq/shell

**Domain**: OS shell integration — launching external URLs/files in their default handler, revealing items in the OS file manager, moving files to the trash, and the system beep. The canonical reference for this domain is Electron's `shell` module (the de-facto desktop-SDK standard), with Tauri's `shell`/`opener` plugins and Capacitor's `Browser` as secondary references.

**Verdict**: solid — 78/100

The package is a faithful, complete implementation of the scope the Package Map declares for it ("open external URLs/paths, reveal in folder, move to trash, beep"). Every documented capability is present, correctly typed, and routed through the swappable-backend seam exactly as the platform suite's command-capability pattern prescribes. It is not a stub: the web backend is real (a guarded `window.open`), the sentinels are correct, and the surface is coherent. It falls short of "authoritative" only because the canonical shell domain (Electron's `shell`) carries a handful of additional, widely-used operations that are not represented here.

## Present capabilities

Five free functions over a `ShellBackend` seam, plus the seam's lifecycle:

- `openExternalUrl(url)` → `shell.openExternal`. Web backend uses `window.open(url, '_blank', 'noopener')` and reports success/failure (returns `false` when popup-blocked or `window` is absent). Correctly guarded and wrapped in try/catch.
- `openShellPath(path)` → `shell.openPath`. Open a local path with its default OS application. Web returns `false` (native-only) — correct.
- `showItemInFolder(path)` → reveal in the OS file manager. Web returns `false` — correct.
- `moveItemToTrash(path)` → move a path to the OS trash. Web returns `false` — correct.
- `shellBeep()` → system beep. Web no-op — correct.
- Backend lifecycle: `getShellBackend()` (lazy web default, always returns a backend), `setShellBackend(backend | null)` (install native host / reset to web), `createWebShellBackend()` (granular web backend factory). This is exactly the command-capability shape (`get*Backend` / `set*Backend` / `createWeb*Backend`) the platform-suite docs mandate, and it matches the other capability cells.

The `ShellBackend` interface lives in `@flighthq/types` (header-layer rule honored), the package is `"sideEffects": false`, the default backend is lazily created rather than registered at module load (opt-in side effects honored), and the only dependency is `@flighthq/types`. Sentinels (`false` / no-op) are used for expected web-unavailability instead of throwing, exactly as the design rules require. The web `openExternal` distinguishes blocked-vs-opened, which is more honest than a fire-and-forget.

## Gaps vs an authoritative shell library

Measuring against Electron's `shell` (the canonical surface), these operations are absent. Most are native-host concerns that the web backend would simply sentinel — but they are part of what a developer reaching for a "shell" library expects to find, so their absence is by-omission, not by-design:

- **`writeShellShortcutLink` / `readShellShortcutLink`** (Windows `.lnk` create/read) — Electron's `shell.writeShortcutLink` / `readShortcutLink`. A standard shell capability; entirely missing.
- **Open-with options on `openPath`** — Electron's `openExternal(url, { activate })` and `openPath` returning an error string. Here `openExternal`/`openPath` take only the URL/path with no options object (no `activate`, no `workingDirectory`, no "open with specific app"). The boolean return also loses the OS error message that `openPath` conventionally surfaces.
- **`trashItem` result distinction** — present as `moveToTrash`, good; but there is no batch form and no restore. (Restore is rarely offered, so this is a minor gap.)
- **`getFileIcon(path)`** — Electron's `app.getFileIcon` / `nativeImage` adjacency; querying the OS icon for a path is a common shell-adjacent need. Absent (arguably out of scope for a pure "shell" cell).
- **No URL-scheme validation / safety guard surface.** `openExternal` of attacker-controlled URLs is the classic shell security footgun; an authoritative library typically documents or offers a scheme allowlist hook. Not present (acceptable for a thin seam, but worth a doc note).
- **No `beep` variants.** A single `beep()` is the full Electron surface, so this is complete, not a gap.

None of these are large; the domain is genuinely small. The package covers the four highest-frequency operations (open URL, open path, reveal, trash) plus beep, which is the 80% of real-world usage.

## Naming / API-shape notes

- Naming is strong and self-identifying: `openExternalUrl`, `openShellPath`, `showItemInFolder`, `moveItemToTrash`, `shellBeep` all carry their object word and read unambiguously at a call site. They follow the project's "full unabbreviated type word" and globally-unique-export rules well.
- One mild asymmetry: three functions are namespaced with the domain word (`openShellPath`, `shellBeep`, `getShellBackend`) while two are not (`openExternalUrl`, `showItemInFolder`, `moveItemToTrash`). `showItemInFolder` and `moveItemToTrash` are the Electron-canonical names, so the inconsistency buys instant recognizability — a defensible trade, but worth noting that `openExternalUrl` vs `openShellPath` mixes conventions within the same file.
- The backend method names (`openExternal`, `openPath`, `showItemInFolder`, `moveToTrash`, `beep`) mirror Electron 1:1, which is good for porting Electron apps and good for the `host-electron` adapter.
- Return shapes are consistent: `Promise<boolean>` for the four IO ops, `void` for `beep`. Reasonable. Promoting `openPath`'s return to carry an error string (as Electron does) would be a small fidelity win.

## Recommendation

Keep as-is for the current milestone; this is a correct, well-shaped cell that meets its declared scope. To reach "authoritative" for the shell domain, add the remaining canonical operations as native-only capabilities that sentinel on the web: shortcut-link write/read (`writeShellShortcutLink` / `readShellShortcutLink`), an options object on `openExternalUrl` (`activate`) and `openShellPath` (working directory / open-with), and consider surfacing `openPath`'s OS error string instead of a bare boolean. These are additive and tree-shakable, so they cost nothing for users who do not import them. Until then the package is a robust, honest "solid," not a stub — it simply stops a few functions short of the full Electron-class surface.
