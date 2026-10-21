use flight_physics2d_abi::contract::*;

// Every variant with its exact TS string-union member; the parsers invert the tables and refuse
// anything else, including a case-folded spelling.

const CONTACT_SELECTIONS: [(Physics2DAbiContactSelection, &str); 3] = [
    (Physics2DAbiContactSelection::All, "All"),
    (Physics2DAbiContactSelection::Began, "Began"),
    (Physics2DAbiContactSelection::Ended, "Ended"),
];

const EXECUTION_STATUSES: [(Physics2DAbiExecutionStatus, &str); 11] = [
    (Physics2DAbiExecutionStatus::BusyWorld, "BusyWorld"),
    (Physics2DAbiExecutionStatus::Complete, "Complete"),
    (Physics2DAbiExecutionStatus::InvalidBuffer, "InvalidBuffer"),
    (
        Physics2DAbiExecutionStatus::InvalidCommand,
        "InvalidCommand",
    ),
    (Physics2DAbiExecutionStatus::MissingBody, "MissingBody"),
    (
        Physics2DAbiExecutionStatus::MissingCollider,
        "MissingCollider",
    ),
    (Physics2DAbiExecutionStatus::MissingJoint, "MissingJoint"),
    (
        Physics2DAbiExecutionStatus::RejectedMutation,
        "RejectedMutation",
    ),
    (Physics2DAbiExecutionStatus::StaleWorld, "StaleWorld"),
    (
        Physics2DAbiExecutionStatus::UnsupportedJoint,
        "UnsupportedJoint",
    ),
    (
        Physics2DAbiExecutionStatus::UnsupportedShape,
        "UnsupportedShape",
    ),
];

const STEP_STATUSES: [(Physics2DAbiStepStatus, &str); 5] = [
    (Physics2DAbiStepStatus::BusyWorld, "BusyWorld"),
    (Physics2DAbiStepStatus::Complete, "Complete"),
    (Physics2DAbiStepStatus::Declined, "Declined"),
    (
        Physics2DAbiStepStatus::InsufficientHookBuffer,
        "InsufficientHookBuffer",
    ),
    (Physics2DAbiStepStatus::StaleWorld, "StaleWorld"),
];

const WORLD_STATUSES: [(Physics2DAbiWorldStatus, &str); 3] = [
    (Physics2DAbiWorldStatus::Busy, "Busy"),
    (Physics2DAbiWorldStatus::Ready, "Ready"),
    (Physics2DAbiWorldStatus::Stale, "Stale"),
];

mod get_physics2d_abi_contact_selection_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in CONTACT_SELECTIONS {
            assert_eq!(get_physics2d_abi_contact_selection_string(value), name);
        }
    }
}

mod get_physics2d_abi_execution_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in EXECUTION_STATUSES {
            assert_eq!(get_physics2d_abi_execution_status_string(value), name);
        }
    }
}

mod get_physics2d_abi_step_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in STEP_STATUSES {
            assert_eq!(get_physics2d_abi_step_status_string(value), name);
        }
    }
}

mod get_physics2d_abi_world_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        for (value, name) in WORLD_STATUSES {
            assert_eq!(get_physics2d_abi_world_status_string(value), name);
        }
    }
}

mod parse_physics2d_abi_contact_selection {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in CONTACT_SELECTIONS {
            assert_eq!(parse_physics2d_abi_contact_selection(name), Some(value));
        }
        assert_eq!(parse_physics2d_abi_contact_selection("all"), None);
        assert_eq!(parse_physics2d_abi_contact_selection(""), None);
    }
}

mod parse_physics2d_abi_execution_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in EXECUTION_STATUSES {
            assert_eq!(parse_physics2d_abi_execution_status(name), Some(value));
        }
        assert_eq!(parse_physics2d_abi_execution_status("complete"), None);
        assert_eq!(parse_physics2d_abi_execution_status("Busy"), None);
    }
}

mod parse_physics2d_abi_step_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in STEP_STATUSES {
            assert_eq!(parse_physics2d_abi_step_status(name), Some(value));
        }
        assert_eq!(parse_physics2d_abi_step_status("Busy"), None);
    }
}

mod parse_physics2d_abi_world_status {
    use super::*;

    #[test]
    fn inverts_the_table_and_refuses_anything_else() {
        for (value, name) in WORLD_STATUSES {
            assert_eq!(parse_physics2d_abi_world_status(name), Some(value));
        }
        assert_eq!(parse_physics2d_abi_world_status("BusyWorld"), None);
    }
}
