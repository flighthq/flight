//! D9e string tables for the Physics3D ABI string unions: the strings match TS exactly.

use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiContactSelection string union; the TS package exports no get_/parse_ free functions
pub fn get_physics3d_abi_contact_selection_string(
    value: Physics3DAbiContactSelection,
) -> &'static str {
    return match value {
        Physics3DAbiContactSelection::All => "All",
        Physics3DAbiContactSelection::Began => "Began",
        Physics3DAbiContactSelection::Ended => "Ended",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiExecutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics3d_abi_execution_status_string(
    value: Physics3DAbiExecutionStatus,
) -> &'static str {
    return match value {
        Physics3DAbiExecutionStatus::BusyWorld => "BusyWorld",
        Physics3DAbiExecutionStatus::Complete => "Complete",
        Physics3DAbiExecutionStatus::InvalidBuffer => "InvalidBuffer",
        Physics3DAbiExecutionStatus::InvalidCommand => "InvalidCommand",
        Physics3DAbiExecutionStatus::MissingBody => "MissingBody",
        Physics3DAbiExecutionStatus::MissingCollider => "MissingCollider",
        Physics3DAbiExecutionStatus::MissingJoint => "MissingJoint",
        Physics3DAbiExecutionStatus::RejectedMutation => "RejectedMutation",
        Physics3DAbiExecutionStatus::StaleWorld => "StaleWorld",
        Physics3DAbiExecutionStatus::UnsupportedJoint => "UnsupportedJoint",
        Physics3DAbiExecutionStatus::UnsupportedShape => "UnsupportedShape",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics3d_abi_step_status_string(value: Physics3DAbiStepStatus) -> &'static str {
    return match value {
        Physics3DAbiStepStatus::BusyWorld => "BusyWorld",
        Physics3DAbiStepStatus::Complete => "Complete",
        Physics3DAbiStepStatus::Declined => "Declined",
        Physics3DAbiStepStatus::InsufficientHookBuffer => "InsufficientHookBuffer",
        Physics3DAbiStepStatus::StaleWorld => "StaleWorld",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiWorldStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics3d_abi_world_status_string(value: Physics3DAbiWorldStatus) -> &'static str {
    return match value {
        Physics3DAbiWorldStatus::Busy => "Busy",
        Physics3DAbiWorldStatus::Ready => "Ready",
        Physics3DAbiWorldStatus::Stale => "Stale",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiContactSelection string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics3d_abi_contact_selection(value: &str) -> Option<Physics3DAbiContactSelection> {
    return match value {
        "All" => Some(Physics3DAbiContactSelection::All),
        "Began" => Some(Physics3DAbiContactSelection::Began),
        "Ended" => Some(Physics3DAbiContactSelection::Ended),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiExecutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics3d_abi_execution_status(value: &str) -> Option<Physics3DAbiExecutionStatus> {
    return match value {
        "BusyWorld" => Some(Physics3DAbiExecutionStatus::BusyWorld),
        "Complete" => Some(Physics3DAbiExecutionStatus::Complete),
        "InvalidBuffer" => Some(Physics3DAbiExecutionStatus::InvalidBuffer),
        "InvalidCommand" => Some(Physics3DAbiExecutionStatus::InvalidCommand),
        "MissingBody" => Some(Physics3DAbiExecutionStatus::MissingBody),
        "MissingCollider" => Some(Physics3DAbiExecutionStatus::MissingCollider),
        "MissingJoint" => Some(Physics3DAbiExecutionStatus::MissingJoint),
        "RejectedMutation" => Some(Physics3DAbiExecutionStatus::RejectedMutation),
        "StaleWorld" => Some(Physics3DAbiExecutionStatus::StaleWorld),
        "UnsupportedJoint" => Some(Physics3DAbiExecutionStatus::UnsupportedJoint),
        "UnsupportedShape" => Some(Physics3DAbiExecutionStatus::UnsupportedShape),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics3d_abi_step_status(value: &str) -> Option<Physics3DAbiStepStatus> {
    return match value {
        "BusyWorld" => Some(Physics3DAbiStepStatus::BusyWorld),
        "Complete" => Some(Physics3DAbiStepStatus::Complete),
        "Declined" => Some(Physics3DAbiStepStatus::Declined),
        "InsufficientHookBuffer" => Some(Physics3DAbiStepStatus::InsufficientHookBuffer),
        "StaleWorld" => Some(Physics3DAbiStepStatus::StaleWorld),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics3DAbiWorldStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics3d_abi_world_status(value: &str) -> Option<Physics3DAbiWorldStatus> {
    return match value {
        "Busy" => Some(Physics3DAbiWorldStatus::Busy),
        "Ready" => Some(Physics3DAbiWorldStatus::Ready),
        "Stale" => Some(Physics3DAbiWorldStatus::Stale),
        _ => None,
    };
}
