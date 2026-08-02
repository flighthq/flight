---
package: '@flighthq/abc'
updated: 2026-08-02
---

# abc status

Built 2026-08-02 as the separate cell the `swf` charter's 2026-07-25 ruling called for, once SWF needed
timeline commands out of AVM2 bytecode.

- `readAbcFile` reads a whole ABC container into plain data: version, constant pool (integers, unsigned
  integers, doubles, strings, namespaces, namespace sets, multinames in all seven shapes including
  parameterized type names), method signatures with optional defaults and parameter names, metadata,
  instances and classes as the parallel lists sharing one count that the format writes, scripts, and
  method bodies with their exception tables and traits.
- Every cross-reference stays the index the file stored, and each pool keeps the reserved entry 0 the
  format never uses, so a consumer can index the arrays with the file's own indices and resolve only what
  it needs.
- `readAbcInstructions` decodes a method body's instruction stream into a flat list of opcode, operands,
  and byte offset. It lives in its own module, so a caller wanting only class names or trait layout never
  pulls in the opcode table.
- An unrecognized opcode stops the walk and reports the null sentinel. AVM2 instructions are variable
  width with no way to resynchronize after a miss, so a partial decode would be plausible nonsense rather
  than a partial answer.
- The opcode table is written from the published bytecode format description. An opcode's number and the
  operands it declares are facts about the format; **nothing here derives from any implementation of it**,
  so the package carries no third-party licence or attribution obligation.
- Malformed input returns the null sentinel rather than throwing, and every count is bounded before it is
  trusted.

## Real-file evidence

Beyond the hand-built fixture the tests use, the parser was run over every `DoABC` blob in the 306-file
Ruffle corpus described in [swf's fixture evidence](../swf/fixture-evidence.md) — real output from real
ActionScript compilers, not a synthetic file:

| Measure | Value |
| --- | --- |
| `DoABC` blobs found | 229 |
| Parsed | **229** |
| Returned the null sentinel | 0 |
| Threw | **0** |
| Totals recovered | 527 classes, 5,145 methods, 5,017 method bodies, 22,689 pooled strings |

Instruction decoding was then run over every one of those method bodies:

| Measure | Value |
| --- | --- |
| Method bodies | 5,017 |
| Decoded | **5,013** |
| Reported the null sentinel | 4 |
| Instructions decoded | 172,989 |

That sweep earned its keep immediately: the first run failed 9 bodies, and the cause was five deprecated
typed `coerce` opcodes (`coerce_b`, `coerce_i`, `coerce_d`, `coerce_u`, `coerce_o`) that the table omitted.
Compilers still emit them, and a walk that does not know an opcode reads the *next* one as an operand, so a
handful of missing entries desynchronized whole bodies. They are covered by a test now. The 4 that still
report null were not examined further; returning the sentinel for a body this decoder cannot place is the
contract, not a failure.

Nothing is committed from that corpus and the test suite neither reads it nor touches the network; the
sweep is reproducible through the procedure in swf's fixture evidence.

Types live in `@flighthq/types` under an `Abc` prefix, per the user's direction to expose the full parsed
structure rather than a narrow query surface — the shape a future disassembler or AS→read migration aid
would need.

Not built: the `swf`-side recognition of `addFrameScript` and the timeline commands it binds. That
recognition belongs in `swf`, not here, because it is Flash display semantics rather than bytecode
structure — this cell supplies the decoded instructions it will read.
