mod binding;
mod clone;
mod enable_entity_runtime_guards;
mod entity;
mod entity_id;
mod entity_uid;
mod explain_entity_runtime_write;
mod guards;
mod ir;
mod record;
mod runtime;
mod throw;
mod types;
mod unknown_string;

pub mod contract;

// Preserve the complete Rust crate-root surface while the explicit re-exports below are the
// authoritative public TypeScript lane consumed by flight-compiler.
pub use contract::Entity;
pub use contract::allocate_entity;
pub use contract::are_entity_runtime_guards_enabled;
pub use contract::attach_entity_binding;
pub use contract::clone_entity;
pub use contract::create_guarded_entity;
pub use contract::detach_entity_binding;
pub use contract::disable_entity_runtime_guards;
pub use contract::enable_entity_runtime_guards;
pub use contract::explain_entity_runtime_write;
pub use contract::get_entity_binding;
pub use contract::get_entity_binding_as;
pub use contract::get_entity_uid;
pub use contract::has_entity_binding;
pub use contract::has_entity_runtime;
pub use contract::set_entity_runtime_guard_mode;
pub use contract::set_entity_uid;
pub use contract::strip_entity_runtime;
pub use contract::*;
