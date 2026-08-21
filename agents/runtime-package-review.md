# Runtime Package Review

_Architecture review, 2026-08-21. This records a considered-and-declined design so that a future proposal starts from the evidence instead of recreating the package boundary from its name._

## Decision

Do not create `@flighthq/runtime`, `@flighthq/runtime-js`, `@flighthq/runtime-native`, or `@flighthq/runtime-wasm`. Phase 3 of the host-boundary migration creates `@flighthq/host-web` only. This is not a reserved package family: no runtime package is expected unless later evidence changes the balance below.

## Why the package was considered

The host-boundary census initially appeared to identify a substrate below browser and Node hosts. A proposed `runtime-js` would have owned standard-JavaScript implementations, with a `runtime` facade intended to choose a future native or WebAssembly implementation without changing capability-package imports.

That shape centralised a plausible seam, but it did not solve the evidenced portability problem. The original problem is scattered **host code**: environmental behavior such as `document.createElement` in accessibility or `window.addEventListener` in application. That code is absent on Node and native targets and forces a porter to find unrelated host assumptions throughout capability packages.

The proposed substrate members are different. `Intl.Segmenter`, `WebSocket`, and the fetch stack are ambient language/runtime facilities. They are used inline for the same reason as `Math` and `Promise`: the target supplies them as part of its JavaScript environment. Putting three such uses behind two packages would provision a boundary whose current volume and substitution needs do not justify it.

## Completed classification check

The decision was originally conditional on rechecking every provisional host-web row. That check is complete:

- 23 factories have a decisive browser-host dependency and remain host-web.
- 3 factories use only ambient standard facilities: net (`fetch`, `Headers`, `Response`, streams, `AbortController`, `Blob`, and `TextDecoder`), socket (`WebSocket`), and textsegment (`Intl.Segmenter`).
- 12 factories remain the strict-majority no-implementation set and do not become runtime members.

The recheck found one more ambient row than the two that motivated the proposal, not a hidden family of substrate backends. Three ambient uses still do not evidence a package boundary. This conclusion must be revisited if a later exhaustive census finds a materially larger family with shared ownership or lifecycle rather than merely more standard globals.

## The distinction that decides ownership

**Host is environment.** It is platform-specific behavior, absent on other targets, scattered today, and therefore a real portability problem. Extract it into explicit host packages.

**Substrate is language.** It is ambient wherever the corresponding target executes, and inline use is honest. Native substitution is the compiler's job, not a package facade's.

Confusing these categories produced a package proposal for three ambient facilities while the actual portability problem remained the 23 environmental implementations.

## Compiler constraint

The load-bearing flight-compiler rule is: **“The compiler resolves runtime to declarations, never to an implementation.”** JavaScript-versus-native substitution is a per-target lookup-table decision in the compiler. A bundler facade cannot perform the substitution Flight actually needs, so centralising imports behind `@flighthq/runtime` would create an indirection without owning the operative choice.

## Ambient facility options

Flight-compiler supplied two options, not three:

1. **Make the runtime surface ambient.** Use ambient declarations with no import. This works today with no compiler changes: existing reachability collects each reference, the plan must decide it, completeness gates it, and each target lookup table selects a native implementation or capability. Although ambient declarations are unfashionable in modern TypeScript, these facilities genuinely occupy the same language category as `Math` and `Promise`.
2. **Designate a module specifier as a runtime seam.** This offers conventional import-based authoring but requires compiler architecture that does not exist: a binding-reference kind or package-scoped classification, reachability collection from imports, lookup tables keyed by `(package, exportName)` rather than bare `sourceName`, and emitters that suppress the target import they would otherwise generate. The last requirement is critical because both backends currently emit a target import for every `@scope/name` specifier; native output would otherwise import a package that has no native implementation.

Flight-compiler's recommendation was option (b) if import ergonomics justify building that compiler support, and option (a) when the decision must be true with today's compiler. It also distinguished compile analysis from JavaScript packaging: automatic resolution to a JavaScript implementation would be a bundler/runtime concern, never a compile-analysis rule.

An earlier discussion described three physical readings of option (a): direct global use with no artifact, a types-only designation package, or wrapper methods. Those were manager's explanatory gloss, not flight-compiler options; wrapper methods collapse into option (b). They are omitted from the decision because the compiler's two-option distinction is the reproducible constraint.

## Consequences

- Keep net, socket, and text segmentation in their capability packages.
- Extract only genuine browser-host implementations into `@flighthq/host-web`.
- Keep `host-node` reserved until a real Node-specific member exists.
- Do not create runtime package cells: the concepts were considered and declined, not reserved for expected construction.
- Reopen this decision if evidence identifies a real cross-target implementation family that the compiler cannot already substitute per target.
