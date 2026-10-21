# flight-regexp

Portable ECMAScript regular-expression construction and matching for Flight. Rust uses the pure
Rust `regress` engine privately; transpiled TypeScript uses the platform `RegExp` built-in.

The shared `Ref<RegExp>` carrier preserves mutable `lastIndex` identity. Public match locations are
UTF-16 code-unit offsets, matching JavaScript and the SDK text-index convention.
