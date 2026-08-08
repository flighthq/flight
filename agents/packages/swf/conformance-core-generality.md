---
package: '@flighthq/swf'
updated: 2026-08-08
---

# Conformance core generality — what a format-agnostic core may not assume

**Read this before extracting anything from the SWF conformance scoreboard into a shared core.** No
such core exists. This document records a constraint on one that does not, derived by attempting to
scope a second format against it, and it is here because a constraint discovered at a boundary is
re-derived expensively once the boundary is out of view.

## The finding

Scoping MD5 as a second conformance format produced a falsifier rather than an estimate:

> If the core owns raw capability extraction, **or assumes one file equals one case**, it is general
> only over SWF-like tag streams.

MD5 falsifies both halves.

**Raw capability extraction is format-grammar work, not core work.** SWF's numeric tag IDs yield
per-file capability witnesses directly, so extraction looks like something a core could own. MD5 has
no tag stream — it is line-oriented text with declaration/section structure, and reconciling declared
counts against `joints`/`mesh` or `hierarchy`/`baseframe`/`frame` needs a lexer and a state machine.
The two probes share no mechanism.

**One file does not equal one case.** An MD5 mesh imports alone, but an animation's meaningful path
requires a compatible mesh skeleton — so a case is a *set* of files with a case hash over its members.
The current core carries one reference, one `sourceHash`, and one worker input per case.

## Why it is recorded rather than remembered

**The one-file-equals-one-case assumption was invisible while SWF was the only instantiation.** It does
not appear as a decision anywhere; it appears as plumbing. A single instantiation cannot show which of
its properties were assumed, which is the entire argument for scoping a hostile second format *before*
building the abstraction rather than after.

⇒ **A sound core accepts adapter-produced cases.** The reusable algorithms begin *after* an adapter has
produced logical cases, independent capability evidence, and observations — scoring, sharding, caching,
and the artifact schema can be general. Extraction and grouping cannot. SWF's tag walker and MD5's
section probe stay separate instantiations.

## Population, and the naming prohibition it carries

The MD5 material available for this work is **13 files from one asset family** — one mesh and twelve
animations, all one rig. Thirteen is a count; the population is **one**.

⇒ **A corpus of population 1 cannot support a breadth claim, so a name that implies breadth
manufactures the claim the evidence cannot carry.** Whatever gets built later and whoever builds it, an
MD5 smoke lane is a smoke lane and is never called a conformance scoreboard. This holds independently
of the scoping decision, which is why it is here rather than in the decision record.

## Status of the work this constrains

A format-agnostic core is **held, not rejected** — declined on price against a cheaper path that may
answer the question outright. See [swf status](status.md) for the current state of the SWF scoreboard,
and the `scene3d-formats` cell for MD5 itself.
