---
package: '@flighthq/shortcut'
role: package
crate: flighthq-shortcut
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shortcut — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Global OS hotkey (system-wide accelerator) cell with two deliberately separate halves. The pure value half parses, normalizes, compares, validates, and formats accelerators against an explicit platform. The resource half creates a `GlobalShortcut` Entity and attaches its trigger signal through an explicit top-level `Host.shortcut.trigger` provider; registration-state queries use the independently optional `Host.shortcut.query` provider. Provider absence is represented only by the Host shape. Electron and Tauri publish both slots, while Web and Capacitor publish exact empty groups. It registers global OS hotkeys, not in-app key-binding maps or multi-key sequence chords — those belong to `@flighthq/input`.

## Decisions

- **[2026-08-30] Global shortcuts are explicit, awaited, per-registration resources.** `Host.shortcut` is required and contains independent optional `trigger` and `query` slots. `createGlobalShortcut` parses before any provider is consulted; `attachGlobalShortcut` returns explicit outcomes for native refusal/collision, same-chord work already in progress, and an attempted provider fault. A successful registration owns the exact origin provider and opaque token used to create it; detach, disposal, and provider teardown await native work, attempt all distinct obligations, retain failed obligations for retry, and never redirect through a replacement provider. Same-chord attach is serialized and transactional, so neither overlap nor a late acquisition can overwrite or resurrect a registration. Enumeration, enable/disable, suspend/resume, ambient backend selection, diagnostic guards, and web sentinels are deleted rather than emulated. This ruling supersedes the 2026-07-30 diagnostics/installed-backend decisions and the 2026-08-21 explicit web-backend decision below.
- **[2026-07-02] Remove dead `'Enter'` display entry.** The `_keyDisplayNames` map has an `'Enter' -> '↵'` entry that is unreachable because `enter` aliases to `'Return'` during normalization. Remove it. *(Done.)*
- **[2026-07-30] A separator character separates only when it terminates a token.** `+` and `-` are both chord separators *and* key names, and the naive `split(/[+-]/)` made the key names unreachable — `CommandOrControl+-` and `CommandOrControl++`, the conventional zoom pair, did not parse. The tokenizer keeps a separator that opens a token as part of that token, so a trailing `+`/`-` survives as the key while `Ctrl-Shift-K` is unaffected. A separator glued to a name (`Ctrl+-K`) is now a parse error rather than a silent success.
- **[2026-07-30] The key vocabulary tracks Electron's accelerator key codes, no wider.** `ShortcutKeyName` admits only keys a native host can actually register. Keys Electron cannot register (`Pause`, `ContextMenu`, `Clear`, `Help`) stay out, because admitting them would let a chord parse cleanly and then fail silently on every backend. Names are physical-key style (`BracketLeft`, `Backquote`), not the shifted glyph a layout produces, so a chord means the same key on every layout.
- **[2026-07-30] Diagnostics follow the inversion rule.** The commands keep returning bare `false`/`null`; the caller-facing text lives in the separately-importable `enableShortcutGuards`, reached through a nullable `setShortcutDropGuard` slot, and `explainGlobalShortcutRegistration` is the plain-data pull query in its own file so it sheds independently of `@flighthq/log`. Only the two knowable drop causes are reported (`unparseable`, `no-native-backend`) — a native backend answering `false` is a legitimate answer, not a drop.
- **[2026-07-30] The installed backend and the web fallback occupy separate slots.** `getShortcutBackend` used to cache the lazily-built web default into the installed-backend slot, which made "a host installed a backend" indistinguishable from "we fell back" after the first command, and left `hasNativeShortcutBackend` unable to answer honestly.
- **[2026-08-21] Explicit host-web installation supersedes the lazily-built web default.** There is no lazily-built web default to cache: `enableHostWebShortcut()` from `@flighthq/host-web` installs the web implementation explicitly, custom > host > sentinel resolves order-independently, and `setShortcutBackend(null)` reveals the host rather than a web fallback. This is the 2026-08-21 user ruling; rationale is recorded in the [host-web architecture](../../host-web-architecture.md).

## Open directions

1. **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** Do `menu` / `tray` depend on `shortcut` (dependency direction menu/tray -> shortcut), or does the vocabulary live in `@flighthq/types` with all three depending only on the header?
2. **Rust port as a value-typed mixable leaf.** The deterministic value core (parse/normalize/format/validate) is exactly the value-typed leaf the Rust map flags as a best first conformance target — no GPU, headlessly fingerprintable.
3. **Shifted-punctuation glyphs as key names.** Electron accepts `~ ! @ # $ % ^ & * ( ) _ { } | : " < > ?` as accelerator key codes; `ShortcutKeyName` carries only the unshifted physical names. Admitting them means either folding each onto its unshifted key (dropping the implied Shift) or admitting glyph-identity names beside physical ones — a decision about what a key name *is*, not an alias to add.
