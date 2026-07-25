# Portability Substrate

**Direction set 2026-07-25.** How Flight reaches its other-language targets (C, C++, Rust, Python, JS) without N× hand-maintenance. Records why the substrate is **the TypeScript AST + thin per-target backends**, *not* Haxe and *not* (yet) a from-scratch IR, and what that requires of the source.

> **Read this first — the recurring proposal.** Someone rediscovers that Haxe compiles to C++/JS/C#/Python and proposes authoring Flight in Haxe (or making it the canonical port IR). It is already a named port target in [file naming](conventions/file-naming.md) ("the TS→Haxe generator"), and `flight-hx` exists — so the instinct is reasonable. It is still wrong as the *substrate*, for three structural reasons below. Haxe stays useful as **R&D**, not as the canonical layer.

## One source of truth, everything else generated

The failure mode is not "which target" — it is **parallel hand-maintenance**: TS and Haxe (and C++, and Rust) all hand-edited, drifting across 78 packages. That is untenable and it is the thing to refuse. So: **TypeScript is the canonical source; every other target is generated.** Any "second hand-authored codebase" is a bug, not a port.

## Why not Haxe as the substrate

Three objections, and they are one architectural mismatch — Haxe is a *capstone* (opinionated at the surface, compiling downward), Flight is a *foundation* (neutral primitives, composed upward):

1. **Obscurity, and it bites Flight specifically.** Flight is written "with AI code agents in mind." Models and contributors are fluent in TS/C/C++/Rust/Python and barely in Haxe. The substrate cannot be the one language nobody — and no model — knows well.
2. **Capstone-down vs foundation-up (the deep one).** Haxe imposes opinion at the *surface* — the packaging / tooling / module layer — which is **exactly where Flight's value lives** (neutral cells, npm granularity, tree-shaking) *and* exactly where Haxe's ecosystem is thinnest. Routing a foundation through a capstone degrades the properties the foundation exists to provide.
3. **Monolithic compilation.** Haxe's compilation unit is whole-program-ish; it prefers *not* to be broken into small units. That fights the per-cell, "import one screw," assembly-never-costs-more-than-its-parts invariant the whole architecture rests on.

Haxe's surface leaks upward into the layer Flight cares most about. It is not a neutral IR you can hide behind.

## Read the three failures as the requirement

The substrate must be **known** (to humans and models), **foundation-neutral** (emits plain idiomatic target code, imposes nothing at the surface), and **cellular** (per-package units, tree-shaking preserved). That list nearly names one specific thing.

## The substrate: the TS AST *is* the IR

**TypeScript source → the TS AST of the constrained Flight subset → thin per-target backends** lowering to idiomatic C/Rust/Python. AssemblyScript-shaped (a subset-of-TS compiler), but emitting readable native code, not Wasm. It answers the three objections point-for-point:

- **(1)** TS is the most-known language there is, and already the source — nobody learns a new one.
- **(2)** TS imposes nothing downward; *the backend* owns the emit, so output is plain foundation-up code with no surface opinion smuggled in.
- **(3)** TS modules are already granular and tree-shakable — per-cell compilation is the default, not a fight.

Crucially, the **front-end is free**: the TS compiler already parses and type-checks. You do not build a compiler; you build **backends** (lowering passes). They stay small **because the subset is small** — no closures over mutable state, no exotic generics, kinds are strings, allocation is explicit. The subset discipline is what makes lowering tractable, which is why the subset contract below is the load-bearing artifact.

A **from-scratch IR** remains the fallback, reached only on *measured* friction — if lowering the subset straight from the TS AST cannot carry the ownership model a target needs. Decide that from what `flight-hx` actually hits, not preemptively.

## The subset contract (build this now)

The port substrate depends on Flight source staying inside a **lowerable subset of TS**. That subset is not new — it is what the existing conventions already enforce, for exactly this reason:

- explicit allocation (`create*` / `dispose*` / `destroy*` / pool `acquire*`/`release*`, out-params) — no GC-reliant patterns;
- free functions over classes; kinds are **strings**, not `Symbol()`; open registries over dynamic dispatch;
- `file.ts` → one module, type FQN = `package.Type` ([file naming](conventions/file-naming.md));
- `Readonly<>` = `const`; no hidden state; the await handling `flight-hx` is refining.

**The near-term move is to make that subset a *checkable gate*** (a lint/`npm run` check, sibling to `order`/`api`) rather than a convention enforced by review — the compiler front-end's *contract*, gotten for free, protecting every future port path from drift. Build the contract now; defer the backends until the lowering rules are proven.

## Memory is the crux, not the IR choice

GC (TS) → manual (C) → ownership/borrow (Rust) is the real design work, and it is the same problem under *any* IR. Flight has paid the down-payment: the explicit-allocation discipline exists *so that* this lowering is expressible. Two things bound it:

- **The native seam.** Hot, ownership-heavy paths are hand-written per target as native crates (`flight-rs` / `surface-rs`), behind registered seams. The codegen carries the **bulk** (the cellular, portable subset); it never has to solve the hardest ownership paths — those are hand-owned per language.
- **The subset.** Because allocation and ownership are already explicit in the source, the lowering has data to work with rather than GC magic to reverse-engineer.

## `flight-hx` is the R&D, not the port

Even though Haxe is not the canonical substrate, `flight-hx` is where the **lowering rules are being discovered empirically** — which TS constructs map cleanly, which do not (the await-unwrap finding is exactly that). That knowledge is the input to any backend, TS-AST or otherwise. Treat it as the proving ground for the subset + mapping, feeding the subset contract above.

## The convergence

A port substrate is the same machine behind three otherwise-unrelated threads:

- **Ports** — Flight source → C++/Rust/C#.
- **A Python binding** — a target emit (not an embedded VM); rides the C ABI the C/C++ backend produces.
- **ActionScript migration** — the deferred `swf` deepening tier: AVM2 disassembly → the same pipe, run backwards, AS-in → host-language-out, as a *transpile-to-read* aid (never execute). See [`swf`'s scope](packages/scene2d-formats/charter.md) and the runtime/parse line.

Recognizing them as one machine is the point: build the subset contract once, and "port," "bind," and "migrate" are all backends over the same lowering.
