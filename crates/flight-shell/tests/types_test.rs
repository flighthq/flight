use flight_shell::contract::*;

mod get_shell_external_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        let cases = [
            (ShellExternalReason::BlockedScheme, "blocked-scheme"),
            (ShellExternalReason::Ok, "ok"),
            (ShellExternalReason::OperationFailed, "operation-failed"),
            (ShellExternalReason::PopupBlocked, "popup-blocked"),
        ];
        for (reason, string) in cases {
            assert_eq!(get_shell_external_reason_string(reason), string);
        }
    }
}

mod get_shell_path_open_outcome_reason {
    use super::*;

    #[test]
    fn reads_the_reason_of_each_union_arm() {
        assert_eq!(
            get_shell_path_open_outcome_reason(&ShellPathOpenOutcome::Ok(
                ShellPathOpenOutcomeOk {}
            )),
            ShellPathOpenReason::Ok
        );
        assert_eq!(
            get_shell_path_open_outcome_reason(&ShellPathOpenOutcome::OperationFailed(
                ShellPathOpenOutcomeOperationFailed {
                    message: "missing".to_string(),
                }
            )),
            ShellPathOpenReason::OperationFailed
        );
    }
}

mod get_shell_path_open_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(
            get_shell_path_open_reason_string(ShellPathOpenReason::Ok),
            "ok"
        );
        assert_eq!(
            get_shell_path_open_reason_string(ShellPathOpenReason::OperationFailed),
            "operation-failed"
        );
    }
}

mod get_shell_path_reveal_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(
            get_shell_path_reveal_reason_string(ShellPathRevealReason::Ok),
            "ok"
        );
        assert_eq!(
            get_shell_path_reveal_reason_string(ShellPathRevealReason::OperationFailed),
            "operation-failed"
        );
    }
}

mod get_shell_shortcut_link_read_outcome_reason {
    use super::*;

    #[test]
    fn reads_the_reason_of_each_union_arm() {
        assert_eq!(
            get_shell_shortcut_link_read_outcome_reason(&ShellShortcutLinkReadOutcome::Ok(
                ShellShortcutLinkReadOutcomeOk { link: link() }
            )),
            ShellShortcutLinkReadReason::Ok
        );
        assert_eq!(
            get_shell_shortcut_link_read_outcome_reason(
                &ShellShortcutLinkReadOutcome::OperationFailed(
                    ShellShortcutLinkReadOutcomeOperationFailed {
                        message: "missing".to_string(),
                    }
                )
            ),
            ShellShortcutLinkReadReason::OperationFailed
        );
    }

    fn link() -> ShellShortcutLink {
        return ShellShortcutLink {
            target: "/app".to_string(),
            app_user_model_id: None,
            args: None,
            description: None,
            icon: None,
            icon_index: None,
            working_directory: None,
        };
    }
}

mod get_shell_shortcut_link_read_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(
            get_shell_shortcut_link_read_reason_string(ShellShortcutLinkReadReason::Ok),
            "ok"
        );
        assert_eq!(
            get_shell_shortcut_link_read_reason_string(
                ShellShortcutLinkReadReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_shell_shortcut_link_write_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(
            get_shell_shortcut_link_write_reason_string(ShellShortcutLinkWriteReason::Ok),
            "ok"
        );
        assert_eq!(
            get_shell_shortcut_link_write_reason_string(
                ShellShortcutLinkWriteReason::OperationFailed
            ),
            "operation-failed"
        );
    }
}

mod get_shell_shortcut_write_operation_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_operation_string() {
        let cases = [
            (ShellShortcutWriteOperation::Create, "create"),
            (ShellShortcutWriteOperation::Replace, "replace"),
            (ShellShortcutWriteOperation::Update, "update"),
        ];
        for (operation, string) in cases {
            assert_eq!(get_shell_shortcut_write_operation_string(operation), string);
        }
    }
}

mod get_shell_trash_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(get_shell_trash_reason_string(ShellTrashReason::Ok), "ok");
        assert_eq!(
            get_shell_trash_reason_string(ShellTrashReason::OperationFailed),
            "operation-failed"
        );
    }
}

mod parse_shell_external_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            ShellExternalReason::BlockedScheme,
            ShellExternalReason::Ok,
            ShellExternalReason::OperationFailed,
            ShellExternalReason::PopupBlocked,
        ];
        for reason in reasons {
            assert_eq!(
                parse_shell_external_reason(get_shell_external_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_shell_external_reason("PopupBlocked"), None);
        assert_eq!(parse_shell_external_reason(""), None);
    }
}

mod parse_shell_path_open_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            ShellPathOpenReason::Ok,
            ShellPathOpenReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_shell_path_open_reason(get_shell_path_open_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_shell_path_open_reason("OperationFailed"), None);
        assert_eq!(parse_shell_path_open_reason(""), None);
    }
}

mod parse_shell_path_reveal_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            ShellPathRevealReason::Ok,
            ShellPathRevealReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_shell_path_reveal_reason(get_shell_path_reveal_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_shell_path_reveal_reason("OperationFailed"), None);
        assert_eq!(parse_shell_path_reveal_reason(""), None);
    }
}

mod parse_shell_shortcut_link_read_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            ShellShortcutLinkReadReason::Ok,
            ShellShortcutLinkReadReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_shell_shortcut_link_read_reason(get_shell_shortcut_link_read_reason_string(
                    reason
                )),
                Some(reason)
            );
        }
        assert_eq!(
            parse_shell_shortcut_link_read_reason("OperationFailed"),
            None
        );
        assert_eq!(parse_shell_shortcut_link_read_reason(""), None);
    }
}

mod parse_shell_shortcut_link_write_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            ShellShortcutLinkWriteReason::Ok,
            ShellShortcutLinkWriteReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_shell_shortcut_link_write_reason(
                    get_shell_shortcut_link_write_reason_string(reason)
                ),
                Some(reason)
            );
        }
        assert_eq!(
            parse_shell_shortcut_link_write_reason("OperationFailed"),
            None
        );
        assert_eq!(parse_shell_shortcut_link_write_reason(""), None);
    }
}

mod parse_shell_shortcut_write_operation {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let operations = [
            ShellShortcutWriteOperation::Create,
            ShellShortcutWriteOperation::Replace,
            ShellShortcutWriteOperation::Update,
        ];
        for operation in operations {
            assert_eq!(
                parse_shell_shortcut_write_operation(get_shell_shortcut_write_operation_string(
                    operation
                )),
                Some(operation)
            );
        }
        assert_eq!(parse_shell_shortcut_write_operation("Create"), None);
        assert_eq!(parse_shell_shortcut_write_operation(""), None);
    }
}

mod parse_shell_trash_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [ShellTrashReason::Ok, ShellTrashReason::OperationFailed];
        for reason in reasons {
            assert_eq!(
                parse_shell_trash_reason(get_shell_trash_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_shell_trash_reason("OperationFailed"), None);
        assert_eq!(parse_shell_trash_reason(""), None);
    }
}
