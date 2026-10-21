//! Accessibility capability seam: plain node/state descriptors, operation outcomes and a
//! provider-backed command facade. No native semantic tree, DOM, screen reader or focus operation
//! lives here; every command is forwarded to the caller's explicit host provider.

mod accessibility;
mod accessibility_sugar;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use.
pub use contract::announce_accessibility;
pub use contract::clear_accessibility_tree;
pub use contract::destroy_accessibility;
pub use contract::remove_accessibility_node;
pub use contract::set_accessibility_focus;
pub use contract::set_accessibility_node;

pub use contract::AccessibilityDescriptor;
pub use contract::AccessibilityLiveness;
pub use contract::AccessibilityNode;
pub use contract::AccessibilityOperationBlockReason;
pub use contract::AccessibilityOperationOutcome;
pub use contract::AccessibilityOperationOutcomeBlocked;
pub use contract::AccessibilityOperationOutcomeOk;
pub use contract::AccessibilityRemoveNodeBlockReason;
pub use contract::AccessibilityRole;
pub use contract::AccessibilityState;
pub use contract::AccessibilityTreeBlockReason;
pub use contract::HostAccessibilityCapabilities;
pub use contract::HostAccessibilityCapability;
