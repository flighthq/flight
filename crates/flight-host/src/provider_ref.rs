use std::any::Any;
use std::sync::Arc;

/// Shared identity of the object that supplied a capability record. Every capability callback
/// record carries this field, and every facet constructed by one provider clones the same token.
/// Compare tokens with `Arc::ptr_eq`, never by comparing callbacks. TS exports it as an opaque
/// alias and keeps the field (HOST1, Principal A); identity is object identity (`===`).
pub type ProviderRef = Arc<dyn Any + Send + Sync>;
