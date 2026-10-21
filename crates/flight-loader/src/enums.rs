#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceLoadItemStatus {
    Cancelled,
    Failed,
    Loaded,
    Pending,
    Running,
    Skipped,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceLoadReportStatus {
    Cancelled,
    Failed,
    Loaded,
    Skipped,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceLoaderErrorPolicy {
    Continue,
    FailFast,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourceLoaderRetryBackoff {
    Exponential,
    Linear,
    None,
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoadItemStatus; no TS conversion helper exists
pub fn get_resource_load_item_status_string(value: ResourceLoadItemStatus) -> &'static str {
    return match value {
        ResourceLoadItemStatus::Cancelled => "cancelled",
        ResourceLoadItemStatus::Failed => "failed",
        ResourceLoadItemStatus::Loaded => "loaded",
        ResourceLoadItemStatus::Pending => "pending",
        ResourceLoadItemStatus::Running => "running",
        ResourceLoadItemStatus::Skipped => "skipped",
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoadReportStatus; no TS conversion helper exists
pub fn get_resource_load_report_status_string(value: ResourceLoadReportStatus) -> &'static str {
    return match value {
        ResourceLoadReportStatus::Cancelled => "cancelled",
        ResourceLoadReportStatus::Failed => "failed",
        ResourceLoadReportStatus::Loaded => "loaded",
        ResourceLoadReportStatus::Skipped => "skipped",
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoaderErrorPolicy; no TS conversion helper exists
pub fn get_resource_loader_error_policy_string(value: ResourceLoaderErrorPolicy) -> &'static str {
    return match value {
        ResourceLoaderErrorPolicy::Continue => "continue",
        ResourceLoaderErrorPolicy::FailFast => "fail-fast",
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoaderRetryBackoff; no TS conversion helper exists
pub fn get_resource_loader_retry_backoff_string(value: ResourceLoaderRetryBackoff) -> &'static str {
    return match value {
        ResourceLoaderRetryBackoff::Exponential => "exponential",
        ResourceLoaderRetryBackoff::Linear => "linear",
        ResourceLoaderRetryBackoff::None => "none",
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoadItemStatus; no TS conversion helper exists
pub fn parse_resource_load_item_status(value: &str) -> Option<ResourceLoadItemStatus> {
    return match value {
        "cancelled" => Some(ResourceLoadItemStatus::Cancelled),
        "failed" => Some(ResourceLoadItemStatus::Failed),
        "loaded" => Some(ResourceLoadItemStatus::Loaded),
        "pending" => Some(ResourceLoadItemStatus::Pending),
        "running" => Some(ResourceLoadItemStatus::Running),
        "skipped" => Some(ResourceLoadItemStatus::Skipped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoadReportStatus; no TS conversion helper exists
pub fn parse_resource_load_report_status(value: &str) -> Option<ResourceLoadReportStatus> {
    return match value {
        "cancelled" => Some(ResourceLoadReportStatus::Cancelled),
        "failed" => Some(ResourceLoadReportStatus::Failed),
        "loaded" => Some(ResourceLoadReportStatus::Loaded),
        "skipped" => Some(ResourceLoadReportStatus::Skipped),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoaderErrorPolicy; no TS conversion helper exists
pub fn parse_resource_loader_error_policy(value: &str) -> Option<ResourceLoaderErrorPolicy> {
    return match value {
        "continue" => Some(ResourceLoaderErrorPolicy::Continue),
        "fail-fast" => Some(ResourceLoaderErrorPolicy::FailFast),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9 exact closed source string domain ResourceLoaderRetryBackoff; no TS conversion helper exists
pub fn parse_resource_loader_retry_backoff(value: &str) -> Option<ResourceLoaderRetryBackoff> {
    return match value {
        "exponential" => Some(ResourceLoaderRetryBackoff::Exponential),
        "linear" => Some(ResourceLoaderRetryBackoff::Linear),
        "none" => Some(ResourceLoaderRetryBackoff::None),
        _ => None,
    };
}
