---
package: '@flighthq/shell'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - packages/shell/src/shell.ts
  - packages/shell/src/shell.test.ts
  - packages/types/src/Shell.ts (head + base)
  - changes.patch (packages/shell hunks)
---

# Review: @flighthq/shell (merge gate, delta only)

Frame: the approved floor is `origin/main (eb73c3d74)` = `incoming/integration-b2824e3d8/base/packages/shell/`. This review judges **only** the delta to the integration head (`b2824e3d8`) as a merge gate. Findings cite `b2824e3d8:<path>`. The base is not under review.

## Verdict

**revise — 45/100. The delta does not compile in this head and must not merge as-is.** The shell _source_ and _docs_ for the expanded surface were carried into integration head, but the `@flighthq/types` _contract_ they depend on was **not**. The change is internally inconsistent: `shell.ts` imports four types and calls four backend methods that do not exist in `b2824e3d8:packages/types/src/Shell.ts`. The design intent of the delta is good (options objects, the Windows `.lnk` family, batch trash, an `openPathResult` error channel, a URL-scheme safety seam — all sentinel-clean and tree-shake-clean), but a partial integration that fails `tsc` is a hard merge blocker regardless of intent.

This is **not** a critique of the approved base. The base shell package compiles cleanly against the base 5-method `ShellBackend`. The defect is introduced by the delta: it advances `shell.ts`/`shell.test.ts` past a types contract the same head still pins at base.

## Blocker: the delta references a types contract absent from this head

`b2824e3d8:packages/shell/src/shell.ts:1-7` imports four types:

```ts
import type {
  ShellBackend,
  ShellOpenExternalOptions,
  ShellOpenPathOptions,
  ShellShortcutLink,
  ShellShortcutWriteOperation,
} from '@flighthq/types';
```

But `b2824e3d8:packages/types/src/Shell.ts` is **byte-identical to base** — it still declares only:

```ts
export interface ShellBackend {
  openExternal(url: string): Promise<boolean>;
  openPath(path: string): Promise<boolean>;
  showItemInFolder(path: string): Promise<boolean>;
  moveToTrash(path: string): Promise<boolean>;
  beep(): void;
}
```

A grep across the entire `b2824e3d8` head `packages/types/` tree for `ShellOpenExternalOptions`, `ShellOpenPathOptions`, `ShellShortcutLink`, `ShellShortcutWriteOperation`, `moveItemsToTrash`, `openPathResult`, `readShortcutLink`, `writeShortcutLink` returns **zero** matches. Consequences, all grounded in the delta:

- **Four missing type imports.** `ShellOpenExternalOptions`, `ShellOpenPathOptions`, `ShellShortcutLink`, `ShellShortcutWriteOperation` are imported but undefined in `@flighthq/types` → `tsc` error TS2305 ("has no exported member").
- **Four missing backend methods.** `b2824e3d8:packages/shell/src/shell.ts` calls `getShellBackend().moveItemsToTrash(paths)` (L78-80), `.openPathResult(...)` (L102-104), `.readShortcutLink(...)` (L108-110), and `.writeShortcutLink(...)` (L139-145). None exist on the base `ShellBackend` → `tsc` error TS2339 ("Property … does not exist on type 'ShellBackend'").
- **The test file breaks identically.** `b2824e3d8:packages/shell/src/shell.test.ts:1` imports `ShellOpenExternalOptions, ShellOpenPathOptions` from `@flighthq/types`, and the fixture implements `moveItemsToTrash`, `openPathResult`, `readShortcutLink`, `writeShortcutLink` against a `ShellBackend` type that has none of them. The test does not type-check either.

The barrel (`b2824e3d8:packages/shell/src/index.ts` — `export * from './shell'`) re-exports all of `shell.ts`, so the package's `dist/index.d.ts` cannot be produced. `npm run packages:check` / `tsc -b` would fail at the shell workspace. **This is a broken-build merge, not a quality nit.**

## Honesty failure: the delta's own docs assert the missing contract is present

`b2824e3d8:tools/agents/docs/packages/shell/review.md` (a new file in this delta) states under "Status-doc verification":

> "New `@flighthq/types` shapes (`ShellOpenExternalOptions`, `ShellOpenPathOptions`, `ShellShortcutLink`, `ShellShortcutWriteOperation`) **are present in `Shell.ts`** and the `ShellBackend` interface gained `moveItemsToTrash`, `openPathResult`, `readShortcutLink`, `writeShortcutLink` … Header-first rule honored."

`b2824e3d8:tools/agents/docs/packages/shell/status.md` repeats it ("New types in `@flighthq/types` (`packages/types/src/Shell.ts`)"). Both were verified against the **builder** SHA `67dc46d64` (the review explicitly cites `67dc46d64:packages/shell/`, `/types/src/Shell.ts`), **not** the integration head `b2824e3d8` they were committed into. The claim is true of the builder worktree and **false of this head** — the types change was left behind during integration while the source, tests, and docs were carried forward. A merge-gate doc that asserts a contract is present when the same head's types file proves it is not is exactly the "claims match code" failure the standard tests for.

## What is sound (so the fix is small, not a redesign)

The _design_ of the delta is good and would pass cleanly once the types land in the same head:

- **Sentinels, not throws.** `createWebShellBackend` returns `false` / `null` / `[]` / `'unavailable on web'` per method (`b2824e3d8:packages/shell/src/shell.ts:12-56`); `isShellUrlAllowed` returns `false` for an unparseable URL via try/catch (L66-74) rather than throwing. Matches the contract's expected-failure rule.
- **URL-scheme safety seam is correct.** `openExternalUrl` consults `isShellUrlAllowed` and returns `Promise.resolve(false)` _before_ reaching the backend for a blocked scheme (L89-92); default `_urlSchemeAllowlist = null` = allow-all, so no base-caller behavior changes. Genuine footgun closure.
- **Tree-shaking clean.** `b2824e3d8:packages/shell/package.json` keeps the single root `.` export, `"sideEffects": false`, and sole dependency `@flighthq/types`. No top-level side effect: the web default is lazily built in `getShellBackend` (L59-62). Module state (`_backend`, `_urlSchemeAllowlist`) sits at file bottom (L147-148). Exports are alphabetized.
- **Command-capability shape honored** — `getShellBackend` / `setShellBackend` / `createWebShellBackend`, exactly the platform-suite seam.
- **Tests, once they compile, are well-shaped** — colocated, alphabetized `describe` blocks mirroring exports, covering allowlist allowed/blocked/null/unparseable, options forwarding (distinct + omitted), batch results, and the `''`-vs-error split.

## Carry-over context (corroborates the partial-integration diagnosis; not a shell-scoped objection)

`b2824e3d8:packages/host-electron/src/electronShell.ts` is the **base 5-method** adapter (`openExternal`/`openPath`/`showItemInFolder`/`moveToTrash`/`beep` only) — it implements none of `moveItemsToTrash`/`openPathResult`/`readShortcutLink`/`writeShortcutLink`. So even if the expanded `ShellBackend` interface _had_ landed in head, `host-electron` would also fail to satisfy it. host-electron is outside this package's review scope, but its base state confirms the integration carried the shell+docs change without its types and host wiring — the change set is incomplete, not merely mis-ordered.

## Charter contradictions

None against the _design_. The charter's "What it is" (open URLs/paths, reveal, trash, beep, Windows shortcut links, URL-scheme allowlist over a host-shaped `ShellBackend`) matches the delta's intent. The contradiction is mechanical, not directional: the charter and the delta's docs describe a surface the head's types layer does not yet provide.

## Pre-release latitude applied

No back-compat duty is invoked anywhere here. The base-vs-domain naming asymmetry (`openExternalUrl`/`showItemInFolder`/`moveItemToTrash` un-prefixed vs `openShellPath`/`shellBeep`/`getShellBackend` prefixed) is a real open question, but it is a **base** property (those four names pre-date this delta) — surfaced to the user, not charged against the delta. The closed `ShellShortcutWriteOperation` union is a fork-B closed-union exception (a fixed Electron-mirrored set) and in any case lives in the unlanded types file, so it is not a delta objection.
