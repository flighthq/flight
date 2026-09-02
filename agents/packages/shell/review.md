---
package: '@flighthq/shell'
status: solid
score: 93
updated: 2026-09-02
ingested:
  - packages/shell/src (live)
  - packages/shell/package.json (live)
  - packages/types/src/Shell.ts (live)
  - packages/types/src/Shell.test.ts (live)
  - packages/types/src/Host.ts (live)
  - packages/host-web/src/webShellHost.ts (live)
  - packages/host-electron/src/electronShell.ts (live)
  - packages/host-tauri/src/tauriShell.ts (live)
  - packages/host-capacitor/src/capacitorRegister.ts (live)
---

# shell -- Review

This review supersedes the 2026-08-30 review. Evidence is the live source named above.

## Verdict

`solid` -- 93/100. Shell is a bedrock command domain with seven Host capability slots, ten exported
functions, truthful per-host provider subsets, required per-call external URL policy, and
method-tight named outcomes. The original six bounded-command slots (beep, external, pathOpen,
pathReveal, shortcutLink, trash) are mature, well-tested, and match the charter precisely. A seventh
slot -- `process` -- adds child-process spawning with argument-vector semantics and Web Streams I/O.
The process slot is type-complete and tested, but has no host backend implementation in any of the
four hosts, and its trait shape (`ShellProcessHost` in `Shell.ts`) differs from the `HasShell*`
pattern used by the other six.

The score drops from 95 to 93 because the process slot introduces a structural asymmetry (trait
location, return convention) and has zero backend coverage, making it the one area whose design has
not been proven through a real host integration.

## Present capabilities

- **Core API -- ten functions.** `isShellUrlAllowed`, `moveShellItemToTrash`,
  `moveShellItemsToTrash`, `openShellExternalUrl`, `openShellPath`, `readShellShortcutLink`,
  `revealShellPath`, `shellBeep`, `spawnShellProcess`, and `writeShellShortcutLink`. Every
  bounded-command operation takes the narrow `HasShell*` trait it needs; process takes
  `ShellProcessHost`.
- **Security contract.** `openShellExternalUrl` requires a `ShellExternalUrlPolicy` argument naming
  allowed schemes on every call. Pure validation via `isShellUrlAllowed` runs before provider
  dispatch; malformed and blocked schemes produce `blocked-scheme` without reaching the host. There
  is no default policy, no ambient allowlist, and no allow-all sentinel.
- **Outcome fidelity.** External distinguishes `ok`, `blocked-scheme`, `popup-blocked`, and
  `operation-failed`. Path-open carries a provider failure message. Reveal, trash, and shortcut-write
  report `ok` or `operation-failed`. Shortcut-read returns either a `ShellShortcutLink` or a failure
  message. Batch trash (`moveShellItemsToTrash`) is an ordered `Promise.all` projection of the
  one-item provider operation.
- **Process spawning.** `spawnShellProcess` accepts a command, argument vector, and optional
  `ShellProcessOptions` (cwd, environment). Returns `ShellProcess | null` -- null when the host
  omits the process slot. `ShellProcess` is an Entity carrying `stdin` (WritableStream), `stdout`
  and `stderr` (ReadableStream), `exit` (Promise of exit status with code/signal), and a
  `terminate()` method. Byte-stream I/O uses the Web Streams convention shared with filesystem.
- **Ownership.** All bounded-command providers are Entities with no whole-provider destroy hook.
  Process lifetime belongs to each returned `ShellProcess`, so the spawning backend likewise owns
  no teardown.
- **Export lanes.** Two lanes: `.` (public) re-exports `./contract` (full surface). `contract.ts`
  re-exports `./shell`. No other subpaths exist.
- **Dependencies.** Runtime: `@flighthq/types` only. `@flighthq/entity` is correctly a
  devDependency (used only in tests for `createEntity`). `sideEffects: false` is declared.
- **Source style.** Exported functions are alphabetized in `shell.ts`. Test `describe` blocks are
  alphabetized and mirror function names. Module-scope constants and helpers sit below exported
  functions. No inline types are defined; all types import from `@flighthq/types/contract`.

## Gaps

1. **Process slot has no host backend.** `HostShellCapabilities.process` is declared optional, but
   none of the four hosts (Web, Electron, Tauri, Capacitor) populate it. The feature is type-level
   and test-level complete but has never been exercised through a real provider. Electron and Tauri
   both have native child-process APIs that could fill it.
2. **`ShellProcessHost` trait lives in `Shell.ts`, not `Host.ts`.** The other six command traits
   (`HasShellBeep`, `HasShellExternal`, `HasShellPathOpen`, `HasShellPathReveal`,
   `HasShellShortcutLink`, `HasShellTrash`) are defined in `Host.ts` alongside every other
   `Has*` trait. `ShellProcessHost` is defined in `Shell.ts` using
   `Pick<HostShellCapabilities, 'process'>` rather than the literal inline-object pattern the
   others use. This works but breaks the structural convention that all `Has*` host traits live in
   `Host.ts`.
3. **Process return convention differs.** The six bounded commands return async outcomes
   (`Promise<Shell*Outcome>`). `spawnShellProcess` returns `ShellProcess | null` synchronously.
   The difference is justified (a process is a live entity, not a one-shot result), but no
   `ShellProcessOutcome` or `ShellSpawnOutcome` exists for spawn failures that are distinct from
   "capability absent" -- a backend that exists but fails to launch a process has no way to report
   why.
4. **`getFileIcon` unbuilt.** Noted in charter and status. No type, function, or backend exists.
5. **Untrusted local-path policy undesigned.** External URLs require explicit scheme policy, but
   `openShellPath` and `revealShellPath` accept any string path with no validation. The charter
   acknowledges this needs cross-platform canonicalization before it can be portable.

## Charter contradictions

- The charter describes "six explicit Host command capabilities" and "six top-level explicit Host
  slots." The actual `HostShellCapabilities` has seven (the `process` slot was added after the
  charter was written). The charter's slot enumeration (external, pathOpen, pathReveal, trash,
  shortcutLink, beep) is correct for the original six; it does not mention `process`. The package
  description in `package.json` already says "seven."
- The charter's decision `[2026-08-30]` says "Outcomes are awaited, named, and method-tight." The
  process slot's null-return convention does not produce an awaited named outcome; it is a different
  pattern for a different kind of operation, but the charter does not acknowledge this exception.

## Contract and docs fit

- `sideEffects: false` is declared and accurate -- no top-level side effects exist.
- The two export lanes (`.` and `./contract`) are correctly wired. `index.ts` re-exports from
  `./contract`; `contract.ts` re-exports from `./shell`.
- All types are in `@flighthq/types`. No inline type definitions exist in the package source.
- `@flighthq/entity` is a devDependency, not a runtime dependency, matching its test-only usage.
- The types test file (`Shell.test.ts` in types) covers `ShellProcess` stream types, exit status,
  terminate, and `ShellProcessBackend.spawn` parameter/return shapes.
- Host coverage is truthful: Web implements only `external`; Electron implements
  `beep`/`external`/`pathOpen`/`pathReveal`/`trash` plus `shortcutLink` only when the injected
  platform is Windows; Tauri implements `external`/`pathOpen`/`pathReveal`; Capacitor implements
  none. No host populates `process`.

## Candidate open directions

1. **Electron and Tauri process backends.** Electron's `child_process` and Tauri's shell plugin both
   support argument-vector child processes. Implementing these would validate the `ShellProcess` /
   `ShellProcessBackend` design through real usage.
2. **Move `ShellProcessHost` to `Host.ts`.** Align with the other six `HasShell*` traits by defining
   `HasShellProcess` in `Host.ts` with the same inline-object pattern, or rename `ShellProcessHost`
   and keep it where it is with a documented rationale for the different shape.
3. **Spawn failure reporting.** Consider a `ShellSpawnOutcome` or equivalent so that a present-but-
   failing backend can report why a process did not start, rather than collapsing backend-absent and
   spawn-failed into the same `null`.
4. **Charter update.** Reflect the process slot: seven slots, seven providers, the process exception
   to the awaited-outcome pattern.
5. **`getFileIcon` and local-path policy.** Unchanged from charter open directions.
