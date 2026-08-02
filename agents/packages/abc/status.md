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

Types live in `@flighthq/types` under an `Abc` prefix, per the user's direction to expose the full parsed
structure rather than a narrow query surface — the shape a future disassembler or AS→read migration aid
would need.

Not built: instruction decoding, and therefore the `swf`-side recognition of `addFrameScript` and the
timeline commands it binds. That recognition belongs in `swf`, not here, because it is Flash display
semantics rather than bytecode structure.
