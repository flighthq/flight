# Version-Keyed Import Model

_Architecture record. Written 2026-08-21 from evidence gathered over the Spine binary and
DragonBones conformance investigation. Read this before adding a version check to a format
importer, before wiring a version-dispatched parser, and before deciding whether a format needs
a probe, a gate, or a registry._

## Why this exists

Format importers that accept any file matching a structural signature — an `armature` key, a
`.skel` extension, a magic byte — silently mis-parse when the wire layout changes across
versions. The failure mode is not a crash: a Spine 4.2 file read with a 4.1 layout produces a
`Skeleton2DImport` with zero bones from a 64 KB file — valid-looking success containing nothing,
which a caller cannot distinguish from a skeleton that genuinely has no bones. A DragonBones 4.x
file read with a 5.5 parser would hit different bone/slot/animation field names and produce
silent garbage or empty results.

This record describes the two version-handling patterns Flight uses for format importers, when to
apply each, and the naming and tree-shaking conventions that bind them to the rest of the SDK.

## Two patterns, one principle

The principle: **refuse an unknown version rather than silently mis-parse it.** A refusal is
recoverable; a fabricated empty success is not. Adding a version to the accepted set means
implementing its layout, not widening a pattern.

Which pattern a format earns depends on one question: does the version determine the wire
layout?

### Pattern A: compatibility-field gate

**When to use.** The format is a single encoding (typically JSON) whose structure is stable
within a major version, and the file carries an explicit compatibility field.

**Shape.** A check at the top of the parse function: read `compatibleVersion` (falling back to
`version` if absent), compare against the exact evidenced compatible layout, refuse with a
diagnostic if it does not match. No probe, no registry, no version-specific parsers.

**Concrete case: DragonBones.** All 46 corpus fixtures carry a `version` field (45 report
`"5.5"`, one reports `"5.6"`). 44 of 46 also carry `compatibleVersion`; the two that lack it
have `version: "5.5"` and predate the field. The current parser (`parseDragonBonesSkeleton`)
ignores both fields entirely. The gate:

```
compatibleVersion present  → must equal '5.5'
compatibleVersion absent   → fall back to version, same check
neither present            → refuse with 'dragonbones.version-missing'
match fails                → refuse with 'dragonbones.version-unsupported' + { version }
```

The `compatibleVersion` semantics are "the minimum format version that can read this file" — a
file exported by 5.6 declares 5.5-compatible, meaning no structural changes a 5.5 reader would
choke on. The gate accepts exactly `"5.5"` because that is the only compatible layout the corpus
evidences. All 46 fixtures resolve to `"5.5"` through the `compatibleVersion` → `version`
fallback (the single `"5.6"` file declares `compatibleVersion: "5.5"`). A file with no version
fields is refused — unlike the "predates version fields" reading, a missing field is not
evidence of compatibility.

**When NOT to use.** The format has no compatibility field, has a binary encoding whose layout
changes across versions, or has structurally distinct wire formats that require different
parsers. Those need Pattern B.

### Pattern B: independent version probe + versioned parsers + explicit registry

**When to use.** The format has a binary encoding (or a text encoding with structurally
incompatible layouts across versions), and the version cannot be read by the same code path for
every layout. The probe must be independent of any specific version's parser.

**Shape.** Three layers, each independently importable, each tree-shakeable:

**Layer 1 — the version accessor.** A cheap function that reads only header fields and returns
the version string, or `null` if the header is unreadable. It is never implemented through a
version parser — it touches no skeleton data. It is the discriminator for the registry and a
useful standalone query for callers who need "what version is this file?" without parsing.

**Layer 2 — version-specific parsers.** Standalone importable leaf parsers, one per supported
wire layout. Each validates its own version match (major.minor) and is a complete, self-contained
parser. A caller who knows they have a specific version can import the leaf directly — no
registry, no probe overhead.

**Layer 3 — the registry generic.** An explicit-registration dispatch table mapping version keys
(major.minor strings) to parsers. The generic entry calls probe → registry lookup → delegate.
Registration functions (never called at module top level) are the opt-in surface.

**Concrete case: Spine binary.** The header layout is not stable across major versions.

The hash encoding changed between 3.x and 4.x:

```
v3.8 layout:  [varint-prefixed ASCII string: base64 hash, 27 chars in corpus]
              [varint-prefixed string: version, e.g. "3.8.55"]

v4.x layout:  [8 raw binary bytes: truncated binary hash]
              [varint-prefixed string: version, e.g. "4.2.22"]
```

A dual-strategy accessor discriminates with zero false positives across the entire 41-file
corpus (18 files v3.8.55, 23 files v4.2.22):

1. Try 3.x: read byte 0 as varint, decode that many bytes as a string. If entirely printable
   ASCII, treat it as the hash; advance past it and read the next varint-string as the version.
2. Try 4.x: skip 8 bytes, read varint-string as the version.
3. Validate each candidate against `\d+\.\d+(\.\d+)?`. Return the valid one, or `null` if
   neither.

The 3.x strategy returns `null` on all 4.x files (the raw hash bytes contain non-printable
ASCII). The 4.x strategy returns `null` on all 3.8 files (the varint at offset 8 falls inside
the base64 hash string, producing a garbage string that fails validation).

## Corpus provenance and coverage

**Spine binary corpus**: 18 files at v3.8.55, 23 files at v4.2.22 — all real exports from the
Spine editor. The currently supported layout (4.1) has byte-for-byte provenance from a real
4.1.17 export but no corpus fixture: it was built from a genuine 4.1 export that matches the
4.1.17 wire format. Manager recommends implementing all three (3.8, 4.1, 4.2); user chooses
scope.

**DragonBones corpus**: 46 files, all resolving to compatible layout `"5.5"` through the
`compatibleVersion` → `version` fallback (45 have `version: "5.5"`, 1 has `version: "5.6"`
with `compatibleVersion: "5.5"`). No 4.x or earlier fixtures exist in the corpus. The gate
accepts exactly `"5.5"` — the only layout the corpus evidences.

## Approved names

The Spine binary implementation uses these names, following Flight conventions:

| Purpose | Name |
|---|---|
| Version accessor | `getSpineBinaryVersion` |
| Version failure explainer | `explainSpineBinaryVersionFailure` |
| 4.2 parser | `parseSpineSkeletonBinary42` |
| 4.1 parser | `parseSpineSkeletonBinary41` |
| 3.8 parser | `parseSpineSkeletonBinary38` |
| Generic versioned parser | `parseSpineSkeletonBinaryVersioned` |
| Registration function | `registerSpineSkeletonBinaryParser` |
| Parser type | `SpineBinaryParser` (in `@flighthq/types`) |

**Naming conventions applied:**

- `get*` prefix for the accessor — it reads a value from input data and returns it or a
  sentinel (`null`), following the AGENTS.md accessor convention.
- `explain*` for the sentinel explainer — returns plain data describing why the accessor
  returned `null` (too short, neither strategy matched, both matched but disagreed). Follows
  the diagnostics convention: silent sentinel + shakeable explain.
- Bare-digit version suffixes (`42`, `38`) — unambiguous in context ("SpineSkeletonBinary42"
  reads as "version 4.2"), sorts correctly in file listings and autocomplete, introduces no
  new separator convention.
- `Versioned` suffix on the generic entry signals it dispatches by version.
- `Binary` in every name distinguishes from the JSON counterpart (`parseSpineSkeleton`).

**Export lane:** `getSpineBinaryVersion` belongs in the public `.` lane. The accessor is useful
to end-user applications loading arbitrary `.skel` files — "is this file's version supported?"
is a user-facing question, not internal wiring. The probe has no dependencies beyond the
varint/string reader primitives and produces a plain string.

## Diagnostics

Both patterns produce strict diagnostics that distinguish what the importer knows from what it
does not:

### Spine binary

| Diagnostic key | Severity | Meaning |
|---|---|---|
| `spine.binary-version-unsupported` | Reject | Version was readable but no parser is registered for this major.minor. Carries `{ version }` with the actual version string. |
| `spine.binary-header-unreadable` | Reject | The header could not be parsed at all. No version to report. Carries `{ bytes }` with the file length. |
| `spine.binary-version-mismatch` | Reject | A version-specific parser was called directly with a file whose version does not match its layout. |

### DragonBones

| Diagnostic key | Severity | Meaning |
|---|---|---|
| `dragonbones.version-unsupported` | Reject | The compatibility/version field is present but is not `"5.5"`. Carries `{ version }` with the field value. |
| `dragonbones.version-missing` | Reject | Neither `compatibleVersion` nor `version` is present. The file cannot be verified as a supported layout. |

The distinction between `version-unsupported` and `header-unreadable` is load-bearing for
conformance: the first means the importer knows what the file is but cannot read it (a
known-unknown); the second means the file may not be a valid Spine binary at all (an
unknown-unknown). The current 4.1 parser already reports an unreadable 4.x-style header as
`spine.binary-header-unreadable`. Its remaining gap is a 3.8 file interpreted through that 4.x
header layout: it can report `spine.binary-version-unsupported` with a garbage version string
instead of `"3.8.55"`. The independent dual-strategy probe closes that gap.

## Tree-shaking and registration

All three layers are separately importable and `"sideEffects": false`:

- A caller who only needs the version accessor imports `getSpineBinaryVersion` alone — no parser
  code ships.
- A caller who knows their file version imports the leaf parser directly — no probe, no registry,
  no other version's parser ships.
- A caller who wants automatic version dispatch imports the generic and the registration
  function, then explicitly registers the versions they support:

  ```ts
  registerSpineSkeletonBinaryParser('4.1', parseSpineSkeletonBinary41);
  registerSpineSkeletonBinaryParser('3.8', parseSpineSkeletonBinary38);
  ```

  Only the registered parsers are bundled.

Registration is never at module top level — it is called by the application, not by an import
side effect. This matches the existing pattern (`registerRenderer`, `registerCanvasShapeCommand`)
and preserves `"sideEffects": false`.

## The prefix-gate anti-pattern

A `version.startsWith('4.')` gate claims every future 4.x layout. On 23 real Spine 4.2.22
exports, this gate admitted files into a reader built for 4.1: every file desynchronized at once
and produced a `Skeleton2DImport` with zero bones. Not a crash, not a refusal — a valid-looking
success containing nothing.

The gate was tightened to an enumeration (`['4.1']`) so unknown versions are refused rather than
silently mis-parsed. The version-keyed registry preserves this discipline: the registry contents
are the gate, and an unregistered version produces `spine.binary-version-unsupported` with its
version in the diagnostic.

**A version gate is a promise about the future made by someone who cannot keep it.** The exact
gate (Pattern A's evidenced `"5.5"`, Pattern B's explicit registry contents) promises only what
has been verified.

## Delay-fuse warning: hardcoded single-version importers

Several importers hardcode a single version check without the version-keyed architecture:

| Importer | Version check | Notes |
|---|---|---|
| MD5 mesh/anim | `version !== 10` → Recover | Stable for decades; one known version. |
| MD2 | `version !== 8` → Reject | Stable for decades; one known version. |
| glTF | `parseInt(version, 10) === 2` → gate | Major-version check; glTF 1.0 is a different format. Extension dispatch uses its own open registry. |
| Spine JSON | none | No version handling at all; best-effort with diagnostics. |

These are appropriate today: each format has exactly one supported layout, and the version check
(where present) is a simple gate, not a prefix. If any of these formats acquires a second
supported layout with different wire structure, it graduates to Pattern B. The version-keyed
architecture generalizes to any binary format where the version determines the wire layout;
among current importers, only Spine binary needs it today.

## Conformance outcome distinction

The conformance scorer distinguishes `acceptedImport` (state `imported`, clean parse) from
`degraded` (successful parse with diagnostics). These are separate outcomes, not a combined
"accepted" metric. `acceptedImport = imported / executed` only — degraded results are not
counted as clean accepted.

For version-gated importers, the conformance signal improves: a `version-unsupported` result
now carries the actual version string, which a scorer can categorize ("3.8 → known
unimplemented" vs "99.0 → unknown format") rather than treating all refusals as equivalent.
