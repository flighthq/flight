# Read integrity — the axes a binary parser must hold

What must be true for a parse to address the **right bytes**. Not a checklist derived from any one
parser's fixes: the glTF read-geometry work produced a census whose axes were the names of the three
fixes that had just landed, so it could only confirm itself and it missed three more defects of the same
class. This list is derived from the operation instead.

**Use it by deriving, not by reading.** If a format has failure geometry these axes do not name, the axes
are incomplete for that format — add one. A census that reuses another format's axes repeats the original
error one layer down.

## The operation

A read takes a **buffer**, an **origin**, a **count**, and an **element layout**, and produces values. It
fails when the values it produces are not the bytes the file meant. Every axis below is one way that
happens while the read still looks legitimate — no throw, no diagnostic, plausible output.

## The axes

1. **Frame of reference.** Every offset is relative to *something*: file start, section start, chunk
   payload start, a decompressed sub-buffer, a previously-read base. The read is correct only if the
   offset and the buffer it indexes share one origin. Failure mode: correct arithmetic against the wrong
   base — every bound holds, every byte is in range, and the data comes from somewhere else entirely.
   This is the axis bound checks cannot see, because nothing is out of bounds.

2. **Origin.** The start is representable and inside its region: non-negative, integral, finite. An upper
   bound alone never sees a read that begins before its window; a fractional or NaN offset is silently
   coerced by the reader's index conversion.

3. **Extent.** The end is inside the **tightest** enclosing region. Regions nest — element ⊂ record ⊂
   chunk ⊂ section ⊂ file — and checking only the outermost admits a read that overruns its chunk into
   the next one's bytes: in range, wrong data.

4. **Element width and stride.** Bytes consumed per element match the declared type; stride ≥ element
   width, so consecutive elements cannot overlap. Where the type comes from a declared code, an
   unrecognised code must not fall through to a default width — an unknown width propagates as NaN and
   makes every bound comparison *pass*.

5. **Count, and count/length agreement.** Counts are non-negative integers that size allocations safely.
   Where the same data is described twice — a count *and* a byte length, a chunk length *and* its
   payload's own declared size — the two must agree. Silently trusting either when they disagree is a
   wrong read, and the disagreement is itself the signal.

6. **Advance and termination.** In a sequential walk each step advances by a strictly positive, validated
   amount. A zero or negative advance is an infinite loop or a re-read. An advance derived from an
   unvalidated length walks the cursor to an arbitrary position, after which every subsequent read is
   nonsense while remaining comfortably in bounds.

7. **Encoding agreement.** Byte order and alignment assumed by the reader match what the format declares,
   for formats carrying an endianness flag or a version-dependent layout.

8. **Fault → role.** Every failure above is classified by what the data is *for* — mandatory drops the
   owning entity, optional recovers without it — and is never silently substituted.

## Two structural cautions

**Rows are read sites, not consumers.** Geometry is a property of the site that computes a byte address.
Only axis 8 is a property of the consumer. A table with one row per consumer restates a single belief once
per row; the repetition reads as breadth and supplies none.

**The declaration is not the guarantee.** A spec saying a field is a non-negative integer, and a type
declaration repeating it, constrain nothing at the byte boundary unless something checks at parse time.
This single assumption was the root of every glTF read-integrity defect.

## What glTF did and did not exercise

glTF has one buffer per accessor and one nesting level (accessor ⊂ bufferView ⊂ buffer), spec-fixed
little-endian, and no sequential walk outside the GLB chunk header. It therefore exercised axes 2, 3, 4,
5 (count only), and 8 — and left 1, 6, 7, and the count/length-agreement half of 5 untested. Those are
precisely the axes a *container* format lives on, so the glTF findings are the weakest possible predictor
for one.

**Prediction recorded before opening any of the four parsers** (2026-07-29), so that "derived first" is
checkable rather than asserted: 3DS is a nested chunk tree and should be dominated by 1, 3, and 6; AWD2 is
chunked with optionally compressed bodies, so 1 (post-decompression offsets), 3, 5, and 6; MD2 is an
offset-table format whose header points into the file, so 1 and 3; MD5 is text, where the byte-addressing
axes largely do not apply and the analogue is index/token validity — 5 and 8 in a different costume.

## Axes 9-13, added by the four-parser audit (2026-07-29)

The eight above were derived from the read operation before any of the four parsers was opened. The
audit found five failure geometries they do not name. Each is recorded with the parser that produced
it, because the provenance is the evidence that deriving beats reusing.

9. **Bound independence.** A bound computed from the same declared quantity as the address it guards
   is tautological — it moves with the error and cannot detect it. MD2 bounds its frame reads with
   `offFrames + numFrames * frameStride` where `frameStride` is derived from `numVertices`, the same
   input the per-frame address uses; if `numVertices` is wrong the bound is wrong by exactly the
   amount needed to keep passing. **A bound must be anchored in a quantity independent of the address
   arithmetic it guards.** MD2 carries two such anchors, `framesize` and `offEnd`, and reads neither.

10. **Sibling disjointness.** Axis 3 is written for *nesting*. An offset-table format's sections are
    *siblings that tile the file*, and two of them claiming the same bytes is invisible to any
    containment check at any depth, because each region is individually inside the file. Setting MD2's
    `offFrames` equal to `offTriangles` decodes index data as vertex floats and produces a complete,
    finite, plausible animated mesh. **Where regions tile rather than nest, the check is partition
    coverage — disjoint, and accounting for the whole declared extent.**

11. **Guard-coverage asymmetry across duplicated read sites.** A property of the *population* of read
    sites, not of any one of them. 3DS has eight copies of one chunk-walk loop; five carry a minimum-
    length guard and three do not, and each of the three looks locally reasonable because it *has* a
    bounds guard — just not the one that makes the walk terminate. No per-site audit finds this.
    **Identical read shapes must share one implementation, or the guard set silently diverges.**

12. **Positional coupling of recovery.** Axis 8 says classify a fault by what the data is for, which
    assumes a record's failure is local to that record. In an array whose *positions* are addressed by
    other records, dropping one is never local: the recovery action is itself what creates the
    wrong-address condition. Dropping one malformed MD5 `weight` line shifts every later weight, so
    every subsequent vertex skins to the wrong ones — through a bounds check that still passes.
    **Before skipping a malformed record, ask whether anything indexes that array by position; if so,
    skipping must preserve the position or escalate.** `Drop` is not a safe severity for a
    positionally-referenced array.

13. **Allocation bounded by something the file cannot inflate.** Every axis above assumes the quantity
    sizing an allocation is a field that can be checked against the buffer. Under decompression it is
    the *compression ratio*, which is not in the file, is not bounded by its length, and no per-field
    check can reach. A kilobyte of nested maximum-length back-references expands until the process
    dies. **Where the buffer does not bound the allocation, an explicit cap must.**

Two further findings sit at the edge and are recorded as instances rather than axes: **record identity
agreement** (MD5 records declare their own ordinal — `vert 0`, `weight 3` — a per-record checksum on
the array position every cross-reference depends on, which both parsers discard) is the strongest
available instance of axis 5; and **decoded-value domain** (a quaternion reconstructed as
`w = -sqrt(1 - sumSq)` and silently zeroed when `sumSq >= 1`, yielding a non-unit quaternion that
scales the joint it drives) is about the *value*, not where it came from — arguably a different
discipline than read integrity, and named here so it is not lost.

**What the prediction got right and wrong.** Recorded above before opening anything: 3DS dominated by
1, 3, 6 — *half right*: axis 6 is exactly where it breaks (a hang), but 1 and 3 are the two axes it
handles best. AWD2 by 1, 3, 5, 6 — *wrong about 1*: the post-decompression frame is the one thing it
handles carefully, and its real exposure is axis 13, which did not exist yet. MD2 by 1 and 3 — *half
right*: axis 1 holds by construction, and the damage is at 9 and 10, neither of which existed. MD5 as
index validity — *right*. A prediction that is wrong in a recorded, checkable way is worth more than
one that is vague enough to be always right.
