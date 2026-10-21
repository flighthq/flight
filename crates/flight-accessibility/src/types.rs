//! The accessibility contract types: open roles, plain node/state descriptors, operation outcomes
//! and the provider capability seam (TS `types/src/Accessibility.ts`,
//! `types/src/AccessibilityDescriptor.ts`, `Host.ts` `HostAccessibilityCapabilities`).

use flight_entity::Ref;
use flight_geometry::Rectangle;
use flight_hostcapability::ProviderRef;
use std::sync::Arc;

/// An ARIA role (TS `AccessibilityRole`). Open union: the well-known roles plus any string, so a
/// vendor or native host can use a custom (vendor-prefixed) role. Known values include `button`,
/// `checkbox`, `radio`, `slider`, `heading`, `textbox`, `link`, `image`, `list`, `listitem`,
/// `dialog`, `menu`, `menuitem`, `tab`, `tabpanel`, `progressbar`, `group`, `region` and `none`.
pub type AccessibilityRole = String;

/// Announcement urgency for a live region (TS `AccessibilityLiveness`), a closed string union.
/// `Polite` waits for the current speech to finish; `Assertive` interrupts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessibilityLiveness {
    Polite,
    Assertive,
}

/// The dynamic state of an accessibility node (TS `AccessibilityState`). Booleans map to their ARIA
/// state attribute; the numerics carry range and heading semantics. Every field is optional — a
/// node declares only the states its role uses, and all fields absent means no state attributes.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct AccessibilityState {
    pub disabled: Option<bool>,
    pub checked: Option<bool>,
    pub expanded: Option<bool>,
    pub selected: Option<bool>,
    pub pressed: Option<bool>,
    pub busy: Option<bool>,
    pub hidden: Option<bool>,
    pub readonly: Option<bool>,
    pub required: Option<bool>,
    pub level: Option<f32>,
    pub value_min: Option<f32>,
    pub value_max: Option<f32>,
    pub value_now: Option<f32>,
}

/// A plain-data accessibility node (TS `AccessibilityNode`): what an interactive element is
/// (role/label/state), its text value, where it is, and its place in the tree. Keyed by `id`; a node
/// with no `parent_id` sits at the tree root. `bounds` is an existing geometry entity shared by
/// identity, in the app's own coordinate space — accessibility reads no scene graph.
#[derive(Clone, Debug)]
pub struct AccessibilityNode {
    pub id: String,
    pub role: AccessibilityRole,
    pub label: Option<String>,
    pub description: Option<String>,
    pub value: Option<String>,
    pub parent_id: Option<String>,
    pub bounds: Option<Ref<Rectangle>>,
    pub states: Option<AccessibilityState>,
}

/// The block reason of an accessibility command (TS `AccessibilityOperationBlockReason`), a closed
/// string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessibilityOperationBlockReason {
    Destroyed,
    FocusNotMoved,
    NoDom,
    NodeNotFound,
}

/// The block-reason subset of the tree operations — announce, clear and set node (source generic
/// argument `'destroyed' | 'no-dom'`). A focus failure is not representable at this seam, exactly as
/// in the source:
///
/// ```
/// use flight_accessibility::*;
///
/// let outcome: AccessibilityOperationOutcome<AccessibilityTreeBlockReason> =
///     AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked {
///         reason: AccessibilityTreeBlockReason::NoDom,
///     });
/// assert!(matches!(outcome, AccessibilityOperationOutcome::Blocked(_)));
/// ```
///
/// ```compile_fail
/// use flight_accessibility::*;
///
/// let outcome: AccessibilityOperationOutcome<AccessibilityTreeBlockReason> =
///     AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked {
///         reason: AccessibilityOperationBlockReason::FocusNotMoved,
///     });
/// ```
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessibilityTreeBlockReason {
    Destroyed,
    NoDom,
}

/// The block-reason subset of node removal (source generic argument
/// `'destroyed' | 'no-dom' | 'node-not-found'`). A focus failure is not representable here:
///
/// ```compile_fail
/// use flight_accessibility::*;
///
/// let outcome: AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason> =
///     AccessibilityOperationOutcome::Blocked(AccessibilityOperationOutcomeBlocked {
///         reason: AccessibilityOperationBlockReason::FocusNotMoved,
///     });
/// ```
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessibilityRemoveNodeBlockReason {
    Destroyed,
    NoDom,
    NodeNotFound,
}

/// The successful arm of an accessibility operation outcome, which carries no block reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccessibilityOperationOutcomeOk {}

/// The blocked arm of an accessibility operation outcome, carrying the operation's exact block
/// reason.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AccessibilityOperationOutcomeBlocked<R> {
    pub reason: R,
}

/// The plain result of a provider command (TS `AccessibilityOperationOutcome<BlockReason>`). The
/// type parameter is the operation's exact block-reason subset, mirroring the source's generic
/// instantiation; the default is the full source reason domain, as in the source's default type
/// argument (used by node focus).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessibilityOperationOutcome<R = AccessibilityOperationBlockReason> {
    Ok(AccessibilityOperationOutcomeOk),
    Blocked(AccessibilityOperationOutcomeBlocked<R>),
}

/// The assistive-technology command provider (TS `HostAccessibilityCapability`). The provider owns
/// the mirrored tree and lifecycle; every callback is required in the source, and `destroy` is
/// terminal and idempotent. The record carries the canonical provider identity token.
#[derive(Clone)]
pub struct HostAccessibilityCapability {
    pub provider: ProviderRef,
    pub announce: Arc<
        dyn Fn(
                &str,
                AccessibilityLiveness,
            ) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason>
            + Send
            + Sync,
    >,
    pub clear:
        Arc<dyn Fn() -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason> + Send + Sync>,
    pub destroy: Arc<dyn Fn() + Send + Sync>,
    pub remove_node: Arc<
        dyn Fn(&str) -> AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason>
            + Send
            + Sync,
    >,
    pub set_focus: Arc<
        dyn Fn(&str) -> AccessibilityOperationOutcome<AccessibilityOperationBlockReason>
            + Send
            + Sync,
    >,
    pub set_node: Arc<
        dyn Fn(&AccessibilityNode) -> AccessibilityOperationOutcome<AccessibilityTreeBlockReason>
            + Send
            + Sync,
    >,
}

/// The accessibility capability group (TS `HostAccessibilityCapabilities`). The omitted slot is
/// capability absence, never a provider that answers with synthetic outcomes.
#[derive(Clone, Default)]
pub struct HostAccessibilityCapabilities {
    pub tree: Option<HostAccessibilityCapability>,
}

/// A plain accessibility descriptor for UI that exposes itself (TS `AccessibilityDescriptor`). It is
/// independent of the provider command seam: callers map their UI onto nodes.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AccessibilityDescriptor {
    pub label: Option<String>,
    pub role: Option<String>,
    pub tab_focusable: Option<bool>,
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `AccessibilityLiveness` literal union; the TS package exports no get_/parse_ free functions
pub fn get_accessibility_liveness_string(value: AccessibilityLiveness) -> &'static str {
    return match value {
        AccessibilityLiveness::Polite => "polite",
        AccessibilityLiveness::Assertive => "assertive",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no get_/parse_ free functions
pub fn get_accessibility_operation_block_reason_string(
    value: AccessibilityOperationBlockReason,
) -> &'static str {
    return match value {
        AccessibilityOperationBlockReason::Destroyed => "destroyed",
        AccessibilityOperationBlockReason::FocusNotMoved => "focus-not-moved",
        AccessibilityOperationBlockReason::NoDom => "no-dom",
        AccessibilityOperationBlockReason::NodeNotFound => "node-not-found",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the tree-operation subset of the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no subset get_/parse_ free functions
pub fn get_accessibility_remove_node_block_reason_string(
    value: AccessibilityRemoveNodeBlockReason,
) -> &'static str {
    return match value {
        AccessibilityRemoveNodeBlockReason::Destroyed => "destroyed",
        AccessibilityRemoveNodeBlockReason::NoDom => "no-dom",
        AccessibilityRemoveNodeBlockReason::NodeNotFound => "node-not-found",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the tree-operation subset of the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no subset get_/parse_ free functions
pub fn get_accessibility_tree_block_reason_string(
    value: AccessibilityTreeBlockReason,
) -> &'static str {
    return match value {
        AccessibilityTreeBlockReason::Destroyed => "destroyed",
        AccessibilityTreeBlockReason::NoDom => "no-dom",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `AccessibilityLiveness` literal union; the TS package exports no get_/parse_ free functions
pub fn parse_accessibility_liveness(value: &str) -> Option<AccessibilityLiveness> {
    return match value {
        "polite" => Some(AccessibilityLiveness::Polite),
        "assertive" => Some(AccessibilityLiveness::Assertive),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no get_/parse_ free functions
pub fn parse_accessibility_operation_block_reason(
    value: &str,
) -> Option<AccessibilityOperationBlockReason> {
    return match value {
        "destroyed" => Some(AccessibilityOperationBlockReason::Destroyed),
        "focus-not-moved" => Some(AccessibilityOperationBlockReason::FocusNotMoved),
        "no-dom" => Some(AccessibilityOperationBlockReason::NoDom),
        "node-not-found" => Some(AccessibilityOperationBlockReason::NodeNotFound),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the node-removal subset of the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no subset get_/parse_ free functions
pub fn parse_accessibility_remove_node_block_reason(
    value: &str,
) -> Option<AccessibilityRemoveNodeBlockReason> {
    return match value {
        "destroyed" => Some(AccessibilityRemoveNodeBlockReason::Destroyed),
        "no-dom" => Some(AccessibilityRemoveNodeBlockReason::NoDom),
        "node-not-found" => Some(AccessibilityRemoveNodeBlockReason::NodeNotFound),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the tree-operation subset of the TS `AccessibilityOperationBlockReason` literal union; the TS package exports no subset get_/parse_ free functions
pub fn parse_accessibility_tree_block_reason(value: &str) -> Option<AccessibilityTreeBlockReason> {
    return match value {
        "destroyed" => Some(AccessibilityTreeBlockReason::Destroyed),
        "no-dom" => Some(AccessibilityTreeBlockReason::NoDom),
        _ => None,
    };
}
