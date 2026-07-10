---
package: '@flighthq/debug'
crate: flighthq-debug
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# debug — Charter

## What it is

`@flighthq/debug` is the **opt-in debug control panel** — the one place a developer imports to switch on Flight's diagnostics: subsystem logging (per-channel verbosity), the relevant guard checks, a dev console sink, and timing/markers. It exists so there is **no debug logging by default anywhere** — importing `@flighthq/debug` *is* the opt-in, and not importing it costs production exactly nothing (the diagnostics-inversion rule applied at package granularity: the weight sits behind an import boundary, never a `NODE_ENV` branch).

It is not the logging mechanism (`@flighthq/log`) and not the per-package guards (`enable*Guards` live in each owning package). It's the curated umbrella that *drives* both: "debug the renderer and input" → structured logs at the right level + those subsystems' guard warnings, with nothing shipped to a production bundle.

## North star

One friendly entry point to Flight's diagnostics: `enableDebug(...)` installs a formatted dev console sink, sets per-subsystem (per-channel) log levels, runs the registered guard-enablers for the chosen subsystems, and offers timing spans / frame markers — all reversible (`disableDebug`). An **open registry** lets any package hook its channels + guard-enabler into `enableDebug` without `@flighthq/debug` depending on it, so the umbrella grows with the SDK while staying decoupled and dev-only.

## Boundaries

- **Depends on `@flighthq/log` + `@flighthq/types` only.** Log channels are plain strings, so setting a subsystem's verbosity needs no dependency on that subsystem; guard-enabling is wired through the open registry (below), not hard imports. This keeps `@flighthq/debug` from depending on the whole SDK.
- **Dev-only — never imported in a shipping bundle.** That is the entire point: the package is the opt-in boundary. It follows the SDK's side-effect-free rules (nothing at module top level), but its intended use is "import in development, drop in production."
- **Orchestration, not mechanism or UI.** Emission/sinks/formatters are `@flighthq/log`. Per-package checks are their own `enable*Guards`/`explain*`. Visual inspectors/overlays/HUDs are a separate `devtools` concern (future). `debug` only wires and curates.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Package-level diagnostics inversion.** `@flighthq/debug` is the import boundary that makes "no debug logging by default" real: the SDK ships no ambient debug output; a developer opts in by importing this package and calling `enableDebug`. Not importing it → zero cost, enforced by the module graph (`"sideEffects": false`), exactly as the per-package guard modules are. User-directed 2026-07-10.
- **[2026-07-10] `enableDebug(options)` / `disableDebug()` orchestrate over `@flighthq/log`.** `enableDebug` installs a formatted console (dev) `LogSink`, sets the global and per-channel levels for the requested `subsystems`/`channels`, and invokes each requested subsystem's registered guard-enabler. Idempotent; `disableDebug` removes the sink, restores levels, and disables the guards it turned on. Options select subsystems, level, and sink/formatter.
- **[2026-07-10] Open subsystem registry, decoupled.** `registerDebugSubsystem(name, { channels, enableGuards, disableGuards? })` — a package (via a thin separately-importable adapter) or the app registers a subsystem's channel names + its `enable*Guards` binding, so `enableDebug(['render'])` can wire them without `@flighthq/debug` importing `@flighthq/render`. Vendor-prefix custom subsystem names; last-write-wins. This is the same open-registry-over-coupling pattern the SDK uses for kinds/renderers.

## Open directions

1. **Per-subsystem debug adapters.** Thin, separately-importable modules (e.g. an app imports one to `registerDebugSubsystem('render', …)`) so common subsystems wire up with one import instead of hand-registration — kept out of the core packages to preserve their `enable*Guards`-only surface.
2. **Timing / perf HUD + frame markers.** Span timers and a per-frame budget breakdown surfaced through log (or a `devtools` overlay).
3. **`devtools` neighbor.** The visual side — entity/scene inspectors, live value editing, an on-screen log/perf overlay — a separate package composing over `debug` + the runtime, distinct from this logging-orchestration cell.
4. **Remote/streamed logs.** A sink preset that ships structured logs to a dev server or a remote inspector for on-device debugging.
