mod requirement_codegen;
mod types;

pub mod contract;

// Public lane: the pinned TS `index.ts` factory plus the locally owned result types. The
// construction initializer stays in the full contract lane.
pub use contract::RequirementCodegenPlan;
pub use contract::RequirementDeclination;
pub use contract::create_requirement_codegen_plan;
