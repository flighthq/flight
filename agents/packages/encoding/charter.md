---
package: "@flighthq/encoding"
role: package
crate: flighthq-encoding
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# encoding — Charter

> Durable vision and core values for `@flighthq/encoding`. You author this (via an agent
> transcribing your direction); it is the rubric `review.md` and `assessment.md` are judged
> against. No status here — that lives in the review. See ../CONTRACT.md.

## What it is

_Descriptive, transcribed from the landed source — not yet direction._

`@flighthq/encoding` converts between JavaScript strings and UTF-8 bytes without reaching for a
host global. Two exported functions, `encodeUTF8(text)` and `decodeUTF8(bytes, offset?, length?)`,
implemented from the encoding rules rather than delegating to `TextEncoder`/`TextDecoder` — the
point of the package is that the conversion is ours, so it lowers to the C/C++ port and runs on a
host that has no such globals. It has no dependencies at all, not even `@flighthq/types`: there is
no exported type to home, only two functions over `string` and `Uint8Array`.

The decode is lossy and the encode is total, both deliberately. Malformed, overlong, and truncated
sequences become U+FFFD without consuming the byte that follows, so one bad sequence cannot swallow
the valid character after it; an unpaired surrogate encodes as U+FFFD rather than failing. The one
`throw` is a `RangeError` on an `offset`/`length` window outside the array — a precondition
violation, which is the codebase's rule for throwing rather than returning a sentinel.

`decodeUTF8` takes the window as parameters instead of asking the caller to subarray, so a format
parser reading a length-prefixed string out of the middle of a file allocates no view.

## North star

_TODO — the durable principles that define "good" for this package; the bar it is held to.
Not yet given; this cell was scaffolded when the package landed so it would stop being invisible
to the generators. Direction is the user's to set._

## Boundaries

_Descriptive, from the landed source and the commissioned scope._

In scope, as commissioned: portable `encodeUTF8` / `decodeUTF8` only.

Not in scope today: any other character encoding (UTF-16/UTF-32 transforms, Latin-1, Shift-JIS and
the other legacy code pages a format importer might meet), base64 and hex, percent-encoding, and
streaming/incremental codecs that carry state across chunks. None of these is a blessed non-goal —
they simply were not commissioned, and whether this package is "text codecs" or "UTF-8 only" is a
scope question nobody has answered. See the Open direction below.

## Decisions

_Append-only, dated, blessed rulings. None recorded yet._

## Open directions

1. **What is this package's domain — UTF-8, or text encoding generally?** The name says the wider
   thing and the content is the narrow thing. Both readings are defensible: a package that stays
   `encodeUTF8`/`decodeUTF8` forever is a clean bedrock primitive, and one that grows base64, hex,
   and the legacy code pages the format importers need is a coherent cell too. The answer decides
   whether the next codec lands here or beside it, so it wants an answer before there is a next
   codec, not after.
