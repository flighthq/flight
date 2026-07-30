# Read integrity — the axes a format reader must hold

What must be true for a parse to address the **right data**. Applies to any reader of a format you did
not write: binary containers, text formats, and JSON/XML documents alike. The vocabulary below is
byte-flavoured because that is where the failures are sharpest, but every axis has an analogue wherever
one part of a document addresses another — a JSON array index, a node id, a symbol reference, a frame
number. A format reader is anything that turns untrusted structure into your structure.

## Why this list exists, and how to use it

The failure this document exists to prevent is a **census that confirms itself**. The pattern: you fix
three defects, then build a table whose columns are the names of those three fixes, tick every cell, and
declare the class closed. Every cell is honestly ticked. The table is still worthless, because a checklist
derived from a remedy can only ask "did I do the thing I did?" — never "what must hold for this read to be
correct?". That exact table was written for one parser here and missed three further defects of the same
class, two of which were later found by someone attacking the claim rather than reading the table.

So: **derive, don't read.** Use the axes below as a starting hypothesis and expect them to be incomplete
for your format. If it can fail in a way these do not name, that is a finding, not a deviation — add an
axis. Two structural habits follow:

**Rows are read sites, not consumers.** Addressing is a property of the site that computes an address.
Only axis 8 is a property of the consumer. A table with one row per consumer restates a single belief once
per row; the repetition reads as breadth and supplies none. One audit here had thirteen rows over three
actual read sites, and its "every cell closed" was one unexamined assumption stated thirteen times.

**The declaration is not the guarantee.** A spec saying a field is a non-negative integer, and a type
declaration repeating it, constrain nothing at the point of use unless something checks at parse time.
JSON has no runtime schema validator behind it; neither does a struct read out of a byte buffer. Reading a
declaration as a guarantee was the single root of every defect the first audit missed.

## The operation

A read takes a **buffer**, an **origin**, a **count**, and an **element layout**, and produces values. It
fails when the values it produces are not the ones the file meant. Every axis is one way that happens
**while the read still looks legitimate** — no throw, no diagnostic, plausible output. That is the class
worth hunting: a crash announces itself, and a wrong value that renders fine does not.

## The axes

1. **Frame of reference.** Every offset is relative to *something*: file start, section start, chunk
   payload start, a decompressed sub-buffer, a previously-read base. The read is correct only if the
   offset and the buffer it indexes share one origin. Failure mode: correct arithmetic against the wrong
   base — every bound holds, every byte is in range, and the data comes from somewhere else entirely.
   This is the axis bound checks cannot see, because nothing is out of bounds.

2. **Origin.** The start is representable and inside its region: non-negative, integral, finite. An upper
   bound alone never sees a read that begins *before* its window; a fractional or NaN offset is silently
   coerced by the reader's index conversion rather than rejected.

3. **Extent.** The end is inside the **tightest** enclosing region. Regions nest — element ⊂ record ⊂
   chunk ⊂ section ⊂ file — and checking only the outermost admits a read that overruns its chunk into
   the next one's bytes: in range, wrong data. See also axis 10, for regions that *tile* rather than nest.

4. **Element width and stride.** Bytes consumed per element match the declared type; stride ≥ element
   width, so consecutive elements cannot overlap. Where the type comes from a declared code, an
   unrecognised code must not fall through to a default width — an unknown width often propagates as NaN,
   and NaN makes every subsequent bound comparison *pass*.

5. **Count, and count/length agreement.** Counts are non-negative integers that size allocations safely.
   Where the same quantity is described twice — a count *and* a byte length, a chunk length *and* its
   payload's own size, a declared record count *and* the records actually present — the two must agree.
   Silently trusting either when they disagree is a wrong read, **and the disagreement is itself the
   signal you are being handed for free.** Formats are generous with this redundancy and readers routinely
   discard it; see axis 9 for why that redundancy is worth more than it looks.

6. **Advance and termination.** In a sequential walk each step advances by a strictly positive, validated
   amount. A zero or negative advance is an infinite loop or a re-read — and a hang is worse than a throw,
   because it is uncatchable and cannot be classified. An advance derived from an *unvalidated* length
   walks the cursor to an arbitrary position, after which every subsequent read is nonsense while
   remaining comfortably in bounds.

7. **Encoding agreement.** Byte order, text encoding, and alignment assumed by the reader match what the
   format declares — for formats carrying an endianness flag, a version-dependent layout, or a charset.

8. **Fault → role.** Every failure above is classified by what the data is *for* — mandatory drops the
   owning entity, optional recovers without it — and is never silently substituted.
   **⚠ Corrected by axis 12: this rule is not sufficient on its own, and applying it alone is unsafe for
   any array whose positions are addressed by other records. Read 12 before acting on 8.**

9. **Bound independence.** A bound computed from the same declared quantity as the address it guards is
   **tautological**: it moves with the error and cannot detect it. One reader here bounds its frame reads
   with `origin + count * stride` where `stride` is derived from a vertex count that the per-frame address
   also uses — so if that count is wrong, the bound is wrong by exactly the amount needed to keep passing.
   **A bound must be anchored in a quantity independent of the address arithmetic it guards.** That format
   carries two such independent anchors in its header and the reader reads neither. Expect this one to
   generalise past parsing: any check derived from the same input as the thing it checks is decoration.

10. **Sibling disjointness and partition coverage.** Axis 3 is written for *nesting*. An offset-table
    format's sections are **siblings that tile** the file, and two of them claiming the same bytes is
    invisible to any containment check at any depth, because each region is individually inside the file.
    Pointing one section's offset at another's decodes one kind of record as another and can produce a
    complete, finite, entirely plausible result. **Where regions tile rather than nest, the check is
    partition coverage: disjoint, and accounting for the whole declared extent.**

11. **Guard-coverage asymmetry across duplicated read sites.** A property of the *population* of read
    sites, not of any one of them. One reader here has eight copies of the same walk loop; five carry a
    minimum-length guard and three do not — and each of the three looks locally reasonable, because it
    *has* a bounds guard, just not the one that makes the walk terminate. No per-site audit finds this,
    and no reviewer reading one function finds it. **Identical read shapes must share one implementation,
    or the guard set silently diverges.** This is the single highest-yield structural rule here: it
    converts a class of defect into one that cannot be written.

12. **Positional coupling of recovery — a correction to axis 8, not an addition beside it.** Axis 8 says
    classify a fault by what the data is for. That framing quietly assumes **a record's failure is local
    to that record.** In an array whose *positions* are addressed by other records, dropping one is never
    local: the recovery action is *itself* what creates the wrong-address condition. Dropping one
    malformed weight record shifts every later weight, so every subsequent vertex binds to the wrong ones
    — through bounds checks that all still pass, and with a diagnostic that truthfully reports one bad
    line while the real damage is every index in the file after it.
    **Before skipping a malformed record, ask whether anything indexes that array by position. If so,
    `Drop` is not a safe severity: the recovery must preserve the position (substitute a placeholder) or
    escalate to rejecting the section.** Axis 5's declared counts are the cheap detector — they catch the
    shift at the record where it began rather than statistically at the end.

13. **Allocation bounded by something the file cannot inflate.** Every axis above assumes the quantity
    sizing an allocation is a *field* that can be checked against the buffer. Under decompression it is
    the **compression ratio** — not in the file, not bounded by the file's length, and reachable by no
    per-field check. A kilobyte of nested maximum-length back-references expands until the process dies.
    **Where the buffer does not bound the allocation, an explicit cap must.** Generalises to any
    expansion step: decompression, procedural generation from parameters, recursive expansion of
    references. Related: where the file chooses the *recursion depth* (a nested chunk tree, a deeply
    nested JSON document), depth is likewise attacker-chosen and must be bounded independently of the
    byte bounds — a few bytes per level buys one stack frame.

## Two findings recorded as instances rather than axes

**Record identity agreement.** Some formats have records declare their own ordinal (`vert 0`, `weight 3`).
That is a per-record checksum on exactly the array position every cross-reference depends on, and readers
routinely discard it in favour of push order. It is the strongest available instance of axis 5 and the
cheapest possible detector for axis 12.

**Decoded-value domain.** A value reconstructed under an assumed invariant — a unit quaternion recovered
as `w = -sqrt(1 - sumSq)`, normalized weights, a non-degenerate basis — must have that invariant checked
at decode rather than assumed from the spec. A quaternion silently left non-unit scales whatever it drives.
This is about the *value*, not where it came from, so it is arguably a different discipline; named here so
it is not lost.

## Audit the whole family first, rank second

Facing several readers and limited time, the tempting move is to triage by reachability — fix what a demo
loads, defer what looks dormant — and it is the wrong order.

When four parsers were audited here, the severity call written *before* checking said the priority was the
one a shipped sample supposedly used. That was inferred from a description rather than verified. Grepping
for every parser entry point showed only **two** of the four were invoked by any example — and those two
were **exactly the two carrying unrecoverable defects**: one that hung on a 12-byte file, one that would
exhaust memory on a small crafted input. The other two had only silent-wrong-read faults.

So triaging first would have deprioritised both of the severe ones, on a guess about usage that turned out
to be wrong. Two lessons, and the second is the load-bearing one:

- Reachability is a fact to be **checked** (grep the entry points), never inferred from a doc, a name, or
  a description of what a module is for.
- Severity is not knowable before the audit. What makes a defect severe — unrecoverable versus merely
  wrong, trivially triggered versus adversarial — is discovered *by* auditing. Ranking is an output of the
  audit, not an input to it. **Audit the family, then rank.**

## Reasoning from a description instead of checking

The single failure mode behind most of what this document exists to prevent, and it is worth naming on its
own because it does not feel like an error while you are committing it. It feels like knowing something.

You read that a module "is the composer for the skeletal sample", or that a field "is a nonnegative
integer", or that a helper "bounds the read" — and you carry that forward as established fact. The
sentence was true when written, or true in general, or true of the author's intent. It is being used as
though it were true of the code in front of you, right now, and nothing checked that.

**How to notice it.** The tell is that you cannot name the observation. Ask of any load-bearing claim you
are about to build on: *what did I run, or read, that makes this true?* Three answers mean stop:

- "It's documented / the spec says so / the type says so." A declaration is a claim about intent. The
  question is what the code does.
- "It's called that." A name is a claim about purpose, not behaviour. `bounds`, `validate`, and `safe` in
  an identifier are the most expensive words in a codebase.
- "It must be, or X would be broken." X may well be broken. That is what you are looking for.

A softer tell, worth learning: **you feel briefly relieved.** Relief is what confirmation feels like from
the inside, and it arrives whether or not the thing is true. Treat it as a prompt to check, not a
conclusion.

**The cheap check.** Almost always one command, and almost always under a minute:

- Reachability → grep for the entry point. Not "is this used?" but "show me the call site."
- A field is validated → grep for the field name and read every site, not the one you remember.
- A guard covers a case → write the case and run it. If it passes against the *unfixed* code, the guard is
  not what you thought it was, or the probe is not.
- A behaviour holds → run it and print the value. Two minutes of instrumentation beats an hour of
  reasoning about what the code must be doing, and it is right more often.

**Why it earns its own section.** Each instance is cheap to catch and expensive to carry. A checklist whose
columns came from a remembered description of the fixes; a probe designed against a description of the
defect rather than its mechanism, which passed against the broken code; a severity ranking built on a
sentence in a map file, which inverted once checked. Same root, three costs, and in every case the correction
was worth more than the original work — because a wrong belief that survives review propagates as
documentation, and the next person inherits it with the doubt stripped off.

The habit that fixes it is small: **when a claim is load-bearing, spend the minute.** Not on everything —
on the sentence the rest of the argument stands on.

## On predictions

If you audit a format against this list, **write your prediction down before you open the code**, and
score it afterwards. When this was done here, the prediction was half right for two formats, right for
one, and **wrong for the fourth** — the axis it actually failed on did not exist at prediction time. That
is the outcome that proves the method is doing work: a prediction wrong in a recorded, checkable way is
worth more than one vague enough to always be right, and a method that only ever confirms itself is the
self-confirming census wearing a lab coat.
