use std::any::Any;
use std::sync::Arc;

/// Shared identity of the object that supplied a capability record. Every capability callback
/// record carries this field, and every facet constructed by one provider clones the same token.
/// Compare tokens with `Arc::ptr_eq`, never by comparing callbacks. In TS the capability record is
/// itself the provider object, so transpilation omits this field and lowers provider identity to
/// object identity (`capability_a === capability_b`).
pub type ProviderRef = Arc<dyn Any + Send + Sync>;
