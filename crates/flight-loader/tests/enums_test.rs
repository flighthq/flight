use flight_loader::contract::*;

mod get_resource_load_item_status_string {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Cancelled),
            "cancelled"
        );
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Failed),
            "failed"
        );
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Loaded),
            "loaded"
        );
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Pending),
            "pending"
        );
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Running),
            "running"
        );
        assert_eq!(
            get_resource_load_item_status_string(ResourceLoadItemStatus::Skipped),
            "skipped"
        );
    }
}

mod get_resource_load_report_status_string {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            get_resource_load_report_status_string(ResourceLoadReportStatus::Cancelled),
            "cancelled"
        );
        assert_eq!(
            get_resource_load_report_status_string(ResourceLoadReportStatus::Failed),
            "failed"
        );
        assert_eq!(
            get_resource_load_report_status_string(ResourceLoadReportStatus::Loaded),
            "loaded"
        );
        assert_eq!(
            get_resource_load_report_status_string(ResourceLoadReportStatus::Skipped),
            "skipped"
        );
    }
}

mod get_resource_loader_error_policy_string {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            get_resource_loader_error_policy_string(ResourceLoaderErrorPolicy::Continue),
            "continue"
        );
        assert_eq!(
            get_resource_loader_error_policy_string(ResourceLoaderErrorPolicy::FailFast),
            "fail-fast"
        );
    }
}

mod get_resource_loader_retry_backoff_string {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            get_resource_loader_retry_backoff_string(ResourceLoaderRetryBackoff::Exponential),
            "exponential"
        );
        assert_eq!(
            get_resource_loader_retry_backoff_string(ResourceLoaderRetryBackoff::Linear),
            "linear"
        );
        assert_eq!(
            get_resource_loader_retry_backoff_string(ResourceLoaderRetryBackoff::None),
            "none"
        );
    }
}

mod parse_resource_load_item_status {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            parse_resource_load_item_status("cancelled"),
            Some(ResourceLoadItemStatus::Cancelled)
        );
        assert_eq!(
            parse_resource_load_item_status("failed"),
            Some(ResourceLoadItemStatus::Failed)
        );
        assert_eq!(
            parse_resource_load_item_status("loaded"),
            Some(ResourceLoadItemStatus::Loaded)
        );
        assert_eq!(
            parse_resource_load_item_status("pending"),
            Some(ResourceLoadItemStatus::Pending)
        );
        assert_eq!(
            parse_resource_load_item_status("running"),
            Some(ResourceLoadItemStatus::Running)
        );
        assert_eq!(
            parse_resource_load_item_status("skipped"),
            Some(ResourceLoadItemStatus::Skipped)
        );
        for invalid in ["", "unknown", "LOADED", "none ", " pending", "Continue"] {
            assert_eq!(parse_resource_load_item_status(invalid), None);
        }
    }
}

mod parse_resource_load_report_status {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            parse_resource_load_report_status("cancelled"),
            Some(ResourceLoadReportStatus::Cancelled)
        );
        assert_eq!(
            parse_resource_load_report_status("failed"),
            Some(ResourceLoadReportStatus::Failed)
        );
        assert_eq!(
            parse_resource_load_report_status("loaded"),
            Some(ResourceLoadReportStatus::Loaded)
        );
        assert_eq!(
            parse_resource_load_report_status("skipped"),
            Some(ResourceLoadReportStatus::Skipped)
        );
        for invalid in ["", "unknown", "LOADED", "none ", " pending", "Continue"] {
            assert_eq!(parse_resource_load_report_status(invalid), None);
        }
    }
}

mod parse_resource_loader_error_policy {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            parse_resource_loader_error_policy("continue"),
            Some(ResourceLoaderErrorPolicy::Continue)
        );
        assert_eq!(
            parse_resource_loader_error_policy("fail-fast"),
            Some(ResourceLoaderErrorPolicy::FailFast)
        );
        for invalid in ["", "unknown", "LOADED", "none ", " pending", "Continue"] {
            assert_eq!(parse_resource_loader_error_policy(invalid), None);
        }
    }
}

mod parse_resource_loader_retry_backoff {
    use super::*;
    #[test]
    fn preserves_every_literal_and_the_exact_case_sensitive_domain() {
        assert_eq!(
            parse_resource_loader_retry_backoff("exponential"),
            Some(ResourceLoaderRetryBackoff::Exponential)
        );
        assert_eq!(
            parse_resource_loader_retry_backoff("linear"),
            Some(ResourceLoaderRetryBackoff::Linear)
        );
        assert_eq!(
            parse_resource_loader_retry_backoff("none"),
            Some(ResourceLoaderRetryBackoff::None)
        );
        for invalid in ["", "unknown", "LOADED", "none ", " pending", "Continue"] {
            assert_eq!(parse_resource_loader_retry_backoff(invalid), None);
        }
    }
}
