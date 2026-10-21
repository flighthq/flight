//! Host capability type foundation (D8 named foundation), owning the TS `types/src`
//! `BackendExplanation.ts` and `BackendOperationExplanation.ts` types. Plain data only: no entity,
//! factory, provider or sugar. The source type names are kept (a HostCapability* rename is deferred).

mod backend_explanation;
mod backend_operation_explanation;

pub mod contract;

// Public lane: there is no TS runtime `index.ts`; the source files are public types, so every type and
// its D9e string table is exported at the root, as in `contract`.
pub use contract::BackendExplanation;
pub use contract::BackendExplanationLayer;
pub use contract::BackendExplanationViability;
pub use contract::BackendOperationExplanation;
pub use contract::BackendOperationExplanationLayer;
pub use contract::get_backend_explanation_layer_string;
pub use contract::get_backend_explanation_viability_string;
pub use contract::get_backend_operation_explanation_layer_string;
pub use contract::parse_backend_explanation_layer;
pub use contract::parse_backend_explanation_viability;
pub use contract::parse_backend_operation_explanation_layer;
