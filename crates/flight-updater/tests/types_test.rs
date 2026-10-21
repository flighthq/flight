use flight_updater::contract::*;

mod create_downloaded_update {
    use super::*;

    #[test]
    fn keeps_unknown_metadata_as_none_and_preserves_the_byte_count() {
        let update = create_downloaded_update(UpdateInfo {
            download_size_bytes: Some(9_007_199_254_740_991),
            is_mandatory: None,
            minimum_os_version: None,
            notes: None,
            release_date: None,
            sha512: None,
            version: Some("1.2.3".to_string()),
        });
        assert_eq!(update.info.download_size_bytes, Some(9_007_199_254_740_991));
        assert_eq!(update.info.is_mandatory, None);
        assert_eq!(update.info.minimum_os_version, None);
        assert_eq!(update.info.notes, None);
        assert_eq!(update.info.release_date, None);
        assert_eq!(update.info.sha512, None);
        assert_eq!(update.info.version, Some("1.2.3".to_string()));
    }
}

mod get_app_update_check_outcome_reason {
    use super::*;

    #[test]
    fn reads_the_reason_of_every_union_arm() {
        assert_eq!(
            get_app_update_check_outcome_reason(&AppUpdateCheckOutcome::Downloaded(
                AppUpdateCheckOutcomeDownloaded {
                    update: create_downloaded_update(UpdateInfo {
                        download_size_bytes: None,
                        is_mandatory: None,
                        minimum_os_version: None,
                        notes: None,
                        release_date: None,
                        sha512: None,
                        version: None,
                    }),
                }
            )),
            AppUpdateCheckReason::Downloaded
        );
        assert_eq!(
            get_app_update_check_outcome_reason(&AppUpdateCheckOutcome::CheckInProgress(
                AppUpdateCheckOutcomeCheckInProgress {}
            )),
            AppUpdateCheckReason::CheckInProgress
        );
        assert_eq!(
            get_app_update_check_outcome_reason(&AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {}
            )),
            AppUpdateCheckReason::NotAvailable
        );
        assert_eq!(
            get_app_update_check_outcome_reason(&AppUpdateCheckOutcome::OperationFailed(
                AppUpdateCheckOutcomeOperationFailed {}
            )),
            AppUpdateCheckReason::OperationFailed
        );
    }
}

mod get_app_update_check_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        let cases = [
            (AppUpdateCheckReason::Downloaded, "downloaded"),
            (AppUpdateCheckReason::CheckInProgress, "check-in-progress"),
            (AppUpdateCheckReason::NotAvailable, "not-available"),
            (AppUpdateCheckReason::OperationFailed, "operation-failed"),
        ];
        for (reason, string) in cases {
            assert_eq!(get_app_update_check_reason_string(reason), string);
        }
    }
}

mod get_app_update_install_reason_string {
    use super::*;

    #[test]
    fn returns_every_exact_ts_reason_string() {
        assert_eq!(
            get_app_update_install_reason_string(AppUpdateInstallReason::Ok),
            "ok"
        );
        assert_eq!(
            get_app_update_install_reason_string(AppUpdateInstallReason::OperationFailed),
            "operation-failed"
        );
    }
}

mod initialize_downloaded_update {
    use super::*;

    #[test]
    fn replaces_the_metadata_of_an_existing_handle() {
        let mut update = create_downloaded_update(UpdateInfo {
            download_size_bytes: None,
            is_mandatory: None,
            minimum_os_version: None,
            notes: None,
            release_date: None,
            sha512: None,
            version: Some("1.0.0".to_string()),
        });
        initialize_downloaded_update(
            &mut update,
            UpdateInfo {
                download_size_bytes: Some(10),
                is_mandatory: Some(true),
                minimum_os_version: Some("12".to_string()),
                notes: Some("notes".to_string()),
                release_date: Some("2026-01-02".to_string()),
                sha512: Some("abc".to_string()),
                version: Some("2.0.0".to_string()),
            },
        );
        assert_eq!(update.info.download_size_bytes, Some(10));
        assert_eq!(update.info.is_mandatory, Some(true));
        assert_eq!(update.info.minimum_os_version, Some("12".to_string()));
        assert_eq!(update.info.notes, Some("notes".to_string()));
        assert_eq!(update.info.release_date, Some("2026-01-02".to_string()));
        assert_eq!(update.info.sha512, Some("abc".to_string()));
        assert_eq!(update.info.version, Some("2.0.0".to_string()));
    }
}

mod parse_app_update_check_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            AppUpdateCheckReason::Downloaded,
            AppUpdateCheckReason::CheckInProgress,
            AppUpdateCheckReason::NotAvailable,
            AppUpdateCheckReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_app_update_check_reason(get_app_update_check_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_app_update_check_reason("NotAvailable"), None);
        assert_eq!(parse_app_update_check_reason(""), None);
    }
}

mod parse_app_update_install_reason {
    use super::*;

    #[test]
    fn round_trips_exact_strings_and_rejects_other_spellings() {
        let reasons = [
            AppUpdateInstallReason::Ok,
            AppUpdateInstallReason::OperationFailed,
        ];
        for reason in reasons {
            assert_eq!(
                parse_app_update_install_reason(get_app_update_install_reason_string(reason)),
                Some(reason)
            );
        }
        assert_eq!(parse_app_update_install_reason("OK"), None);
        assert_eq!(parse_app_update_install_reason(""), None);
    }
}
