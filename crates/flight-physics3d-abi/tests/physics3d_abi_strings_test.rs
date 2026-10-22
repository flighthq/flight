use flight_physics3d_abi::contract::*;

// Every variant with its exact TS string-union member; the parsers invert the tables and refuse
// anything else, including a case-folded spelling.

const CONTACT_SELECTIONS: [(Physics3DAbiContactSelection, &str); 3] = [
    (Physics3DAbiContactSelection::All, "All"),
    (Physics3DAbiContactSelection::Began, "Began"),
    (Physics3DAbiContactSelection::Ended, "Ended"),
];

const EXECUTION_STATUSES: [(Physics3DAbiExecutionStatus, &str); 11] = [
    (Physics3DAbiExecutionStatus::BusyWorld, "BusyWorld"),
    (Physics3DAbiExecutionStatus::Complete, "Complete"),
    (Physics3DAbiExecutionStatus::InvalidBuffer, "InvalidBuffer"),
    (
        Physics3DAbiExecutionStatus::InvalidCommand,
        "InvalidCommand",
    ),
    (Physics3DAbiExecutionStatus::MissingBody, "MissingBody"),
    (
        Physics3DAbiExecutionStatus::MissingCollider,
        "MissingCollider",
    ),
    (Physics3DAbiExecutionStatus::MissingJoint, "MissingJoint"),
    (
        Physics3DAbiExecutionStatus::RejectedMutation,
        "RejectedMutation",
    ),
    (Physics3DAbiExecutionStatus::StaleWorld, "StaleWorld"),
    (
        Physics3DAbiExecutionStatus::UnsupportedJoint,
        "UnsupportedJoint",
    ),
    (
        Physics3DAbiExecutionStatus::UnsupportedShape,
        "UnsupportedShape",
    ),
];

const STEP_STATUSES: [(Physics3DAbiStepStatus, &str); 5] = [
    (Physics3DAbiStepStatus::BusyWorld, "BusyWorld"),
    (Physics3DAbiStepStatus::Complete, "Complete"),
    (Physics3DAbiStepStatus::Declined, "Declined"),
    (
        Physics3DAbiStepStatus::InsufficientHookBuffer,
        "InsufficientHookBuffer",
    ),
    (Physics3DAbiStepStatus::StaleWorld, "StaleWorld"),
];

const WORLD_STATUSES: [(Physics3DAbiWorldStatus, &str); 3] = [
    (Physics3DAbiWorldStatus::Busy, "Busy"),
    (Physics3DAbiWorldStatus::Ready, "Ready"),
    (Physics3DAbiWorldStatus::Stale, "Stale"),
];

mod get_physics3d_abi_contact_selection_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in CONTACT_SELECTIONS {
            assert_eq!(get_physics3d_abi_contact_selection_string(value), name);
        }
    }
}

mod get_physics3d_abi_execution_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in EXECUTION_STATUSES {
            assert_eq!(get_physics3d_abi_execution_status_string(value), name);
        }
    }
}

mod get_physics3d_abi_step_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in STEP_STATUSES {
            assert_eq!(get_physics3d_abi_step_status_string(value), name);
        }
    }
}

mod get_physics3d_abi_world_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in WORLD_STATUSES {
            assert_eq!(get_physics3d_abi_world_status_string(value), name);
        }
    }
}

mod parse_physics3d_abi_contact_selection {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in CONTACT_SELECTIONS {
            assert_eq!(parse_physics3d_abi_contact_selection(name), Some(value));
        }
        assert_eq!(parse_physics3d_abi_contact_selection("all"), None);
        assert_eq!(parse_physics3d_abi_contact_selection(""), None);
    }
}

mod parse_physics3d_abi_execution_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in EXECUTION_STATUSES {
            assert_eq!(parse_physics3d_abi_execution_status(name), Some(value));
        }
        assert_eq!(parse_physics3d_abi_execution_status("complete"), None);
        assert_eq!(parse_physics3d_abi_execution_status("Busy"), None);
    }
}

mod parse_physics3d_abi_step_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in STEP_STATUSES {
            assert_eq!(parse_physics3d_abi_step_status(name), Some(value));
        }
        assert_eq!(parse_physics3d_abi_step_status("Busy"), None);
    }
}

mod parse_physics3d_abi_world_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in WORLD_STATUSES {
            assert_eq!(parse_physics3d_abi_world_status(name), Some(value));
        }
        assert_eq!(parse_physics3d_abi_world_status("BusyWorld"), None);
    }
}
