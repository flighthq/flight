# flight-regexp

Portable ECMAScript regular-expression construction and matching for Flight. Rust uses the pure
Rust `regress` engine privately; transpiled TypeScript uses the platform `RegExp` built-in.

The shared `Ref<RegExp>` carrier preserves mutable `lastIndex` identity. Public match locations are
UTF-16 code-unit offsets, matching JavaScript and the SDK text-index convention.

Rust `exec_reg_exp` returns match and capture text only when every range falls on scalar boundaries.
BMP matches and all `u`/`v` matches are representable. In non-Unicode mode, a match or capture that
selects only one UTF-16 code unit of an astral scalar is explicitly nonrepresentable in the D15 Rust
text domain and throws an error; it is never replaced with U+FFFD or otherwise decoded lossily.
Indices and `last_index` remain authoritative UTF-16 code-unit offsets, and `test_reg_exp` does not
materialize text.
