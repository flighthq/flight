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
- Method bodies keep their instruction stream as raw bytes. Decoding instructions needs the full opcode
  table and is deliberately a later layer, so a caller wanting class names or trait layout pays nothing
  for it.
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

Nothing is committed from that corpus and the test suite neither reads it nor touches the network; the
sweep is reproducible through the procedure in swf's fixture evidence.

Types live in `@flighthq/types` under an `Abc` prefix, per the user's direction to expose the full parsed
structure rather than a narrow query surface — the shape a future disassembler or AS→read migration aid
would need.

Not built: instruction decoding, and therefore the `swf`-side recognition of `addFrameScript` and the
timeline commands it binds. That recognition belongs in `swf`, not here, because it is Flash display
semantics rather than bytecode structure.
