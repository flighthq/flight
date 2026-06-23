# Filename Alignment: @flighthq/input

**Verdict:** Single-implementation domain package (deps: signals + types only — NOT a backend-variant package, so no backend prefix applies). The lone source file `inputManager.ts` is named after the central `InputManager` entity and passes the folder-removal test; filenames are clean. The only flag is structural, not naming: a single 554-line `inputManager.ts` carries six distinct input-source domains (keyboard, pointer, wheel, gamepad, text-input attach, DOM event translation), so the descriptive filename is wallpapering over a one-file dumping ground.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `inputManager.ts` | Filename is valid (names the `InputManager` object), but the file is a catch-all: it holds `attach/detach` for keyboard, pointer, relativePointer, wheel, gamepad, and textInput, plus `getKeyCodeFromDomKeyboardEvent` / `getKeyModifierFromDomKeyboardEvent` / `getMouseWheelModeFromDomWheelEvent` (DOM translation) and `pollGamepadInput`. None of those belong to "the manager object." Filename is not wrong; the structure should be split so per-domain filenames can exist. | Keep `inputManager.ts` for `createInputManager` / `createInputSignals` / the entity wiring; split source attach domains into `keyboardInput.ts`, `pointerInput.ts`, `wheelInput.ts`, `gamepadInput.ts`, `textInput.ts`, and DOM-event translation into `domKeyboardEvent.ts` / `domWheelEvent.ts`. Each new filename then self-describes its domain. |

## Clean

- `index.ts` — barrel re-export (`export * from './inputManager'`); conventional, no domain name required.
- `inputManager.ts` — descriptive object name; no backend prefix needed (single-implementation domain). Flagged above only for breadth, not for being a single-function name.
- `inputManager.test.ts` — colocated, mirrors source filename exactly per the one-test-file-per-source rule.
- No generic dumping-ground basenames (`data.ts`, `utils.ts`, `helpers.ts`, `format.ts`, `query.ts`, `math.ts`, `common.ts`) present.
- No suffix-style or bare backend names — correctly absent, since this is not a `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package.
