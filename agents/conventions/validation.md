# Validation — Who Enforces an Invariant, and Where

_Drafted 2026-08-12, **unratified**: two of the three categories below are already settled by
rules in AGENTS.md, but the nine existing `validate*` exports have not been changed to match it and that decision is
the user's. Read before adding a `validate*` function, before writing a check that an invariant holds,
or when deciding whether a rule belongs in a parser, a constructor, or a query._

This is the parallel to [invalidation](invalidation.md), and the asymmetry between the two is what
prompted it. `invalidate*` has 22 exports, a doctrine in AGENTS.md, and real consumers that kept its
contract honest by using it. `validate*` has 9 exports across 8 packages, no doctrine anywhere, and —
measured on 2026-08-12 — **no production callers at all**: every call site is that function's own test.
Nine authors each solved a local problem correctly, and nothing ever forced them to agree, because
nothing ever called two of them. The result is nine functions with six different ways of saying "no".

A contract with no consumer has no pressure toward a shape. That is the whole explanation, and it is why
this document leads with *where an invariant is enforced* rather than with what a validator returns.

## The doctrine: three categories, chosen by who can violate the invariant

Sort every invariant by **who is able to break it**, not by which package it lives in.

1. **A producer can violate it — enforce at the boundary.** Untrusted bytes, an imported document,
   deserialized state: anything crossing into the SDK from outside. The producer that reads the data
   checks the rule as it reads, refuses what fails, and reports through
   [import diagnostics](diagnostics.md#import-diagnostics-asset-facts-not-project-facts) when the input
   is an asset. A standalone `validate*` covering the same rule is a *second implementation* of it, with
   nothing keeping the two in step.

2. **Nothing can violate it — do not check it.** The constructor makes the invariant true and no
   exported function can make it false. AGENTS.md already rules on this case ("Do not validate internal
   invariants that correct usage cannot reach"); this document adds no new instruction, it only names
   the category so an audit can sort into it.

3. **There is no producer — a query is the right door.** Data the caller assembled itself: a hand-built
   entity, an editor's or tool's output, a scene restored from a snapshot. No boundary exists to enforce
   at, so a caller-invoked check is the only place the rule can live. **This is the legitimate home of
   the family**, and the reason the answer to "nine uncalled functions" is not "delete them".

## The worked example: one invariant, four implementations, four strategies

`Skeleton2D` requires each bone's `parentIndex` to be less than its own index — bones are stored
parent-before-child so the world pass can be a single linear sweep. That one rule is implemented four
times, and no two of them do the same thing:

| site | strategy |
| --- | --- |
| `validateSkeleton2D` | **checks** it after the fact and returns a message |
| `spineBinaryParse` | **refuses** input that violates it (crumb, then abandons the stream) |
| `dragonBonesParse` | **sorts** topologically so it cannot be violated |
| `spineParse` | **establishes** it by resolving a parent only among bones already emitted |

Three of the four *ensure* the rule; only the validator *observes* it. Nothing links the four sites or
records that they are the same rule, so a change to it has to be found four times — which is the concrete
form of the drift risk, not a hypothetical one.

Sorting that function's five invariants by the categories above is instructive, because it accounts for
all of them: the three buffer-length rules are category 2 (`createSkeleton2D` sizes `worldMatrices`,
`inverseBindMatrices` and `boneMatrices` from one expression, so no exported function can desynchronize
them), and the two `parentIndex` rules are category 1, now enforced at the boundary that produces the
data. That is the entire body of `validateSkeleton2D`.

## The target shape, for whatever survives an audit

When a category-3 check is genuinely needed, it is a pair, matching the sentinel-plus-`explain*` rule
AGENTS.md already states and [diagnostics](diagnostics.md#the-explain-family) already builds:

```
isValid<Type>(x): boolean              — the cheap question, no allocation, no prose
explain<Type>(x): <PlainData>          — the structured detail, separately importable, shakeable
```

`isValid*` rather than `validate*` for the boolean half, for two reasons that are one reason:
AGENTS.md requires boolean-returning functions to use `has*` or `is*`, so a boolean `validate*` is
already outside an existing rule; and the polarity of `validate*` is not readable at the call site.
Today `if (validateMeshGeometry(g))` means "valid" while `if (validateSkeleton2D(s))` means "broken",
and `if (validateParticleEmitterConfig(c))` is unconditionally true because an empty array is truthy.
`if (isValid<Type>(x))` cannot be misread. The naming fix and the polarity fix are the same fix.

The `explain*` half needs no new verb — `explainDisplayObjectRender`, `explainCollisionTest` and
`explainSkeleton2DDeformLength` already establish it.

## What this document does not do

It does not delete, rename, or reshape any existing export. The nine `validate*` functions are unchanged
and remain as they are until the user rules on them; the analysis behind that decision is with them, and
this doctrine is the part that could be settled from existing rules alone. An audit sorting the ~40
invariants those functions assert into the three categories above is the next step, and it is what tells
us which of the nine should move to a boundary, which should stop being checked, and which are the
category-3 queries worth keeping.
