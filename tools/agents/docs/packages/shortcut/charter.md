---
package: '@flighthq/shortcut'
crate: flighthq-shortcut
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# shortcut — Charter

## What it is

`@flighthq/shortcut` is the global OS hotkey (system-wide accelerator) cell. Past the prior 28/100 stub, it is no longer just a registration shim over a host backend — it now owns the **accelerator domain**: the canonical accelerator vocabulary and value logic. That means parsing and normalization of accelerator strings (alias-insensitive: Ctrl/Control, Cmd/Command/Meta, Option/Alt, Win/Super, `+`/`-` separators), platform-aware display formatting (macOS symbol form `⌘⇧K` vs `Ctrl+Shift+K`), chord equality, validation, enumeration, and conflict detection — all over a swappable `ShortcutBackend` (web default returns sentinels; native hosts like Electron fill the seam). The accelerator types themselves (`Accelerator`, `ParsedAccelerator`, `ShortcutModifier`, `ShortcutKeyName`, `ShortcutEvent`, `AcceleratorParseError`) live in `@flighthq/types`.

Where it ends: it registers **global** OS hotkeys, not in-app key-binding maps and not multi-key sequence chords (`"g then i"`) — those belong to `@flighthq/input`. It produces the accelerator _display_ string and _value_ logic, but it does not own the native menu/tray surfaces that render those strings (`@flighthq/menu`, `@flighthq/tray` are the consumers). Whether the accelerator vocabulary it owns is shared with those neighbors, and in which direction, is an open question below.

## North star (proposed)

- **Accelerator value logic is the deterministic, headless core; the OS seam is thin.** Parse, normalize, format, validate, and compare are pure value functions with no host dependency — the part that is a real hotkey _library_. Global registration is the swappable `*Backend` seam on top. The value core is what makes this cell mixable and conformance-testable; keep that boundary sharp.
- **One canonical chord per slot.** Every accepted spelling of a chord normalizes to a single canonical string before it touches the registry, so registration, lookup, conflict detection, and equality all key off one form. Aliases are an input convenience, never a stored ambiguity.
- **Command-capability seam discipline.** Flat free functions over a `ShortcutBackend` with `get*Backend` / `set*Backend(null→web)` / `createWeb*Backend`; the web backend guards every API and returns sentinels (`false` / `[]` / no-op) rather than throwing. Import is side-effect-free; signals are opt-in via `enableGlobalShortcutSignals` and cost nothing until enabled.
- **Types-first, in `@flighthq/types`.** The accelerator model is the header layer's property, not inline here — so any neighbor that needs to speak "accelerator" reads the same vocabulary.
- **Platform behavior is explicit and overridable.** Display/formatting takes an optional `platform?` override so golden tests are deterministic without mocking `navigator.platform`.

## Boundaries (proposed)

In scope:

- The accelerator value core: `parseAccelerator` / `parseAcceleratorDetailed` / `normalizeAccelerator` / `isAcceleratorValid` / `areAcceleratorsEqual`, accessors, and the platform-aware display formatters.
- Global OS hotkey registration/unregistration/enumeration over the backend seam, with enable/disable and suspend/resume.
- Conflict detection over the registered set, and the opt-in `onTrigger` signal group.

Non-goals (proposed):

- In-app key-binding maps and multi-key sequence chords (`"g then i"`) — `@flighthq/input`.
- Rendering native menus/trays that _display_ accelerators — `@flighthq/menu` / `@flighthq/tray` (consumers of this cell's formatter, not part of it).
- Owning a concrete native backend implementation — host crates (`host-electron` today) fill the seam; this cell defines it.

## Decisions

None blessed yet.

## Open directions

1. **Thin-by-design vs. fully built-out (structural fork F).** `structural-forks.md` fork F still cites `shortcut` as the canonical example of "blessed-as-intentionally-minimal (the domain is genuinely thin)" — but pass-2 took it to a full accelerator library. Is the accelerator value model (parse/normalize/format/validate) permanently in scope here, or was that scope creep to be trimmed back to a registration shim? This charter assumes in-scope-and-good; confirm. (Fork F's `shortcut` citation should also be revisited as an under-built-stub-that-got-the-push, not a thin-by-design example.)
2. **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** `formatAcceleratorForDisplay` and the key-name table are the obvious shared source. Do `menu` / `tray` depend on `shortcut` (dependency direction menu/tray → shortcut), or does the vocabulary live in `@flighthq/types` with all three depending only on the header? And should `ShortcutKeyName` and `@flighthq/input`'s key names be one shared `types` table so a physical key is not spelled two ways? Needs a ruling.
3. **`CommandOrControl` in the canonical form.** Should `normalizeAccelerator` _resolve_ `CommandOrControl` to the concrete platform modifier (making the normalized string platform-specific), or _preserve_ it (keeping the chord portable but leaving a sort-tie when a chord contains both `Control` and `CommandOrControl`, so the canonical form is not fully canonical)? Current code preserves it; bless one.
4. **Platform-detection strategy.** The package deliberately reads `navigator.platform` directly to avoid a `@flighthq/platform` dependency (and circular-dependency risk). Is dependency-freedom a North-star value for this cell, or should it consume the `platform` seam once stable? The `platform?: string` override is a clean escape hatch either way.
5. **Native (non-Electron) backends.** The seam is host-agnostic but only Electron fills it today. Is a `host-winit` / `host-sdl` global-hotkey backend part of this package's definition of "done," or owned entirely by the host crates?
6. **Registration-change observability.** Only `onTrigger` exists today. The status doc suggests a `ShortcutRegistrationSignals` (registered/unregistered) for conflict-detection UIs — add it, or leave registration changes unobserved?
7. **Rust port — `flighthq-shortcut` (structural fork D, the Wasm-mixable leaf).** `crate: flighthq-shortcut` is declared but deferred. The deterministic value core (parse/normalize/format/ validate) is exactly the value-typed mixable leaf the Rust map flags as the best first conformance target (no GPU, headlessly fingerprintable). Build it, and when built, record the `ShortcutSignals.onTrigger` shape divergence: TS uses a function-typed `Signal<(event) => void>` while the Rust map specifies payload-parameterized `Signal<ShortcutEvent>` — an intentional, recorded mapping for the conformance divergence map.
8. **Type-honesty / sharp edges to settle (quality, not design forks — but flag if any imply a ruling).** `getRegisteredGlobalShortcuts` casts the backend's `readonly string[]` to `readonly Accelerator[]` assuming the registry is already normalized; a `normalizeAccelerator` pass over the list would make the type honest if a native host populates the registry by another path. Plus dead display data (`_keyDisplayNames` `'Enter' → '↵'` is unreachable since `enter` aliases to `'Return'`). Confirm these are sweep-safe cleanups rather than decisions.
