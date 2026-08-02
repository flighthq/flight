---
package: '@flighthq/abc'
crate: flighthq-abc
draft: true
lastDirection: null
status: unblessed — cell authored 2026-08-02 alongside the package; pending user ratification
---

# @flighthq/abc — Charter (DRAFT)

> **This is an unblessed design draft.** The decision to give ABC its own cell, and to expose the full
> parsed structure under an `Abc` prefix rather than a narrow query surface, were user-directed on
> 2026-08-02. The rest records the shape that followed and is not authoritative until blessed.

## What it is

The home for **ABC (AVM2 bytecode) container parsing**. It reads the format's own tables — constant pool,
methods, metadata, classes, instances, scripts, method bodies — into plain data, and does nothing else
with them.

It exists because ABC is its own format, not SWF's. It is carried by SWF exactly the way zlib and LZMA
are, and it also exists standalone in `.abc` files. The [`swf`](../swf/charter.md) charter's blessed
2026-07-25 ruling says so directly: ABC is a carried format, handled by a separate concern, never parsed
inside `swf`.

## The seam that keeps this honest

**This cell knows bytecode. It does not know what a MovieClip is.** The word should not appear here.

A consumer owns the meaning of what it reads. `swf` knows that `addFrameScript(n, f)` in a
compiler-generated class constructor binds frame `n` of a symbol, and that a method body which only calls
`stop` is a stop command — because those are Flash display semantics, not bytecode semantics. That is the
same division `compression` uses: the generic format in its own cell, the format-specific mapping at the
consumer's seam.

## Boundaries

- **Parse, never execute.** A VM running artifact-carried code is [an anti-goal](../../anti-goals.md),
  and no amount of demand changes that. What this cell produces is data a caller inspects.
- **Indices, not references.** Every cross-reference stays the index the format stored, so the model is a
  flat table that builds cheaply and ports to a language without a garbage collector.
- **No Flash vocabulary.** See the seam above.

## Open directions

1. **Instruction decoding.** Method bodies currently hand back their code as bytes. Decoding needs the
   full opcode table with operand shapes — mechanical, but it is the layer any consumer recognizing a call
   will need, including `swf` for timeline commands.
2. **Whether a disassembler belongs here.** An AS→read migration aid is the use the `swf` charter
   anticipated. It would consume this parse; whether it ships as part of this cell or beside it is open.
3. **Writing.** Nothing needs to emit ABC. If something ever does, it is a separate question from reading.
