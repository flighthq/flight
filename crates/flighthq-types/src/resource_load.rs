//! Batch resource-loading descriptors, options, reports, and per-item signals.
//!
//! These types describe the inputs and outputs of `flighthq-loader`'s batch
//! loader. The `ResourceLoader` signal surface itself lives in [`crate::resource`]
//! (alongside the other resource types); this module holds the value-typed
//! options/report/status vocabulary the loader operates on.

use flighthq_signals::Signal;

/// Status of a single queued resource-load item.
///
/// Mirrors the TS `ResourceLoadItemStatus` string union.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ResourceLoadItemStatus {
    /// Queued, not yet dispatched.
    #[default]
    Pending,
    /// Currently running.
    Running,
    /// Finished successfully.
    Loaded,
    /// Finished with an error (after exhausting retries).
    Failed,
    /// Aborted by `cancel_resource_load`.
    Cancelled,
    /// Not run because a `fail-fast` error policy aborted the batch.
    Skipped,
}

/// Error policy for a batch: keep going after a failure, or abort the rest.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ResourceLoadErrorPolicy {
    /// Continue loading remaining items after a failure (default).
    #[default]
    Continue,
    /// Abort the batch on the first failure, marking the rest `skipped`.
    FailFast,
}

/// Backoff strategy applied between retry attempts.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum ResourceLoadRetryBackoff {
    /// No delay between retries (default).
    #[default]
    None,
    /// `base * (attempt + 1)`, capped at the configured max.
    Linear,
    /// `base * 2^attempt`, capped at the configured max.
    Exponential,
}

/// Per-item completion record produced by the loader and delivered through
/// `ResourceLoader::on_complete`.
///
/// `group` is `None` when the item was queued without a group.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceLoadReport {
    /// Number of attempts made (1 + retries used).
    pub attempts: u32,
    /// Bytes loaded, if the factory reported byte progress; otherwise 0.
    pub bytes: u64,
    /// Wall-clock load duration in milliseconds (0 for items that never ran).
    pub elapsed_ms: u64,
    /// Group the item was queued under, if any.
    pub group: Option<String>,
    /// The item's key (explicit or auto-assigned).
    pub key: String,
    /// Final status.
    pub status: ResourceLoadItemStatus,
}

/// Configuration for a batch loader, passed to `create_resource_loader`.
///
/// Every field is optional; defaults mirror the TS loader (`max_concurrent`
/// defaults to 6, `error_policy` to `Continue`, `dedupe` enabled).
#[derive(Clone, Debug)]
pub struct ResourceLoaderOptions {
    /// Deduplicate items sharing an explicit key (default `true`).
    pub dedupe: bool,
    /// Error policy for the batch.
    pub error_policy: ResourceLoadErrorPolicy,
    /// Maximum concurrent loads; `0` means unlimited.
    pub max_concurrent: u32,
    /// Bandwidth cap in bytes/second; `None` disables throttling.
    pub max_bytes_per_second: Option<u32>,
    /// Default per-item retry count (overridden per item).
    pub retries: u32,
    /// Backoff strategy between retries.
    pub retry_backoff: ResourceLoadRetryBackoff,
    /// Base retry delay in milliseconds.
    pub retry_base_delay_ms: u64,
    /// Maximum retry delay in milliseconds.
    pub retry_max_delay_ms: u64,
    /// Allow queueing after `start_resource_load` (default `false`).
    pub streaming: bool,
    /// Default per-item timeout in milliseconds; `0` disables.
    pub timeout_ms: u64,
}

impl Default for ResourceLoaderOptions {
    fn default() -> Self {
        Self {
            dedupe: true,
            error_policy: ResourceLoadErrorPolicy::Continue,
            max_concurrent: 6,
            max_bytes_per_second: None,
            retries: 0,
            retry_backoff: ResourceLoadRetryBackoff::None,
            retry_base_delay_ms: 100,
            retry_max_delay_ms: 10_000,
            streaming: false,
            timeout_ms: 0,
        }
    }
}

/// Per-item signal surface, enabled lazily via
/// `enable_resource_loader_item_signals`.
///
/// `on_item_start` carries the item key; `on_item_complete` the key (the loaded
/// value is the loader's typed concern and is not threaded through this erased
/// signal); `on_item_error` the key, error message, and attempt count;
/// `on_item_retry` the key, the upcoming attempt number, and the delay.
#[derive(Debug, Default)]
pub struct ResourceLoaderItemSignals {
    pub on_item_complete: Signal<String>,
    pub on_item_error: Signal<ResourceLoadItemError>,
    pub on_item_retry: Signal<ResourceLoadItemRetry>,
    pub on_item_start: Signal<String>,
}

/// Payload for `ResourceLoaderItemSignals::on_item_error`.
#[derive(Clone, Debug)]
pub struct ResourceLoadItemError {
    pub attempt: u32,
    pub key: String,
    pub message: String,
}

/// Payload for `ResourceLoaderItemSignals::on_item_retry`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceLoadItemRetry {
    pub attempt: u32,
    pub delay_ms: u64,
    pub key: String,
}
