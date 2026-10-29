// Generated from crates/flight-host/src/provider_ref.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

/**
 * Shared identity of the object that supplied a capability record. Every capability callback
 * record carries this field, and every facet constructed by one provider clones the same token.
 * Compare tokens with `Arc::ptrEq`, never by comparing callbacks. TS exports it as an opaque
 * alias and keeps the field (HOST1, Principal A); identity is object identity (`===`).
 */
export type ProviderRef = object;
