# Filename Alignment: @flighthq/keyboard

**Verdict:** Clean. Single-implementation event capability (not a backend-variant package, so the backend-prefix-first rule does not apply); the lone source file carries the correct domain name and the test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

Borderline (not flagged): `keyboard.ts` could be `softKeyboard.ts` to match the package's central type `SoftKeyboard` (whose `soft` prefix is deliberate, avoiding the DOM `Keyboard`). The bare name is acceptable because it tracks the package name `@flighthq/keyboard` and the package disambiguates the domain — within this package, "keyboard" is unambiguously the on-screen/soft keyboard.

## Clean

- `src/index.ts` — thin barrel (`export * from './keyboard'`), the expected single root entry.
- `src/keyboard.ts` — names the soft-keyboard domain it covers (the `SoftKeyboard` entity, its `SoftKeyboardInfo` snapshot, the `SoftKeyboardBackend` seam, and the show/hide/attach/detach/dispose lifecycle). Not named after a single function; passes the remove-the-folder test.
- `src/keyboard.test.ts` — colocated, mirrors the `keyboard.ts` source filename.
