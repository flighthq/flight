//! D9e string tables for the Physics2D ABI string unions: the strings match TS exactly.

use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiContactSelection string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_abi_contact_selection_string(
    value: Physics2DAbiContactSelection,
) -> &'static str {
    return match value {
        Physics2DAbiContactSelection::All => "All",
        Physics2DAbiContactSelection::Began => "Began",
        Physics2DAbiContactSelection::Ended => "Ended",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiExecutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_abi_execution_status_string(
    value: Physics2DAbiExecutionStatus,
) -> &'static str {
    return match value {
        Physics2DAbiExecutionStatus::BusyWorld => "BusyWorld",
        Physics2DAbiExecutionStatus::Complete => "Complete",
        Physics2DAbiExecutionStatus::InvalidBuffer => "InvalidBuffer",
        Physics2DAbiExecutionStatus::InvalidCommand => "InvalidCommand",
        Physics2DAbiExecutionStatus::MissingBody => "MissingBody",
        Physics2DAbiExecutionStatus::MissingCollider => "MissingCollider",
        Physics2DAbiExecutionStatus::MissingJoint => "MissingJoint",
        Physics2DAbiExecutionStatus::RejectedMutation => "RejectedMutation",
        Physics2DAbiExecutionStatus::StaleWorld => "StaleWorld",
        Physics2DAbiExecutionStatus::UnsupportedJoint => "UnsupportedJoint",
        Physics2DAbiExecutionStatus::UnsupportedShape => "UnsupportedShape",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_abi_step_status_string(value: Physics2DAbiStepStatus) -> &'static str {
    return match value {
        Physics2DAbiStepStatus::BusyWorld => "BusyWorld",
        Physics2DAbiStepStatus::Complete => "Complete",
        Physics2DAbiStepStatus::Declined => "Declined",
        Physics2DAbiStepStatus::InsufficientHookBuffer => "InsufficientHookBuffer",
        Physics2DAbiStepStatus::StaleWorld => "StaleWorld",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiWorldStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_abi_world_status_string(value: Physics2DAbiWorldStatus) -> &'static str {
    return match value {
        Physics2DAbiWorldStatus::Busy => "Busy",
        Physics2DAbiWorldStatus::Ready => "Ready",
        Physics2DAbiWorldStatus::Stale => "Stale",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiContactSelection string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_abi_contact_selection(value: &str) -> Option<Physics2DAbiContactSelection> {
    return match value {
        "All" => Some(Physics2DAbiContactSelection::All),
        "Began" => Some(Physics2DAbiContactSelection::Began),
        "Ended" => Some(Physics2DAbiContactSelection::Ended),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiExecutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_abi_execution_status(value: &str) -> Option<Physics2DAbiExecutionStatus> {
    return match value {
        "BusyWorld" => Some(Physics2DAbiExecutionStatus::BusyWorld),
        "Complete" => Some(Physics2DAbiExecutionStatus::Complete),
        "InvalidBuffer" => Some(Physics2DAbiExecutionStatus::InvalidBuffer),
        "InvalidCommand" => Some(Physics2DAbiExecutionStatus::InvalidCommand),
        "MissingBody" => Some(Physics2DAbiExecutionStatus::MissingBody),
        "MissingCollider" => Some(Physics2DAbiExecutionStatus::MissingCollider),
        "MissingJoint" => Some(Physics2DAbiExecutionStatus::MissingJoint),
        "RejectedMutation" => Some(Physics2DAbiExecutionStatus::RejectedMutation),
        "StaleWorld" => Some(Physics2DAbiExecutionStatus::StaleWorld),
        "UnsupportedJoint" => Some(Physics2DAbiExecutionStatus::UnsupportedJoint),
        "UnsupportedShape" => Some(Physics2DAbiExecutionStatus::UnsupportedShape),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_abi_step_status(value: &str) -> Option<Physics2DAbiStepStatus> {
    return match value {
        "BusyWorld" => Some(Physics2DAbiStepStatus::BusyWorld),
        "Complete" => Some(Physics2DAbiStepStatus::Complete),
        "Declined" => Some(Physics2DAbiStepStatus::Declined),
        "InsufficientHookBuffer" => Some(Physics2DAbiStepStatus::InsufficientHookBuffer),
        "StaleWorld" => Some(Physics2DAbiStepStatus::StaleWorld),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DAbiWorldStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_abi_world_status(value: &str) -> Option<Physics2DAbiWorldStatus> {
    return match value {
        "Busy" => Some(Physics2DAbiWorldStatus::Busy),
        "Ready" => Some(Physics2DAbiWorldStatus::Ready),
        "Stale" => Some(Physics2DAbiWorldStatus::Stale),
        _ => None,
    };
}
