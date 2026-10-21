use crate::enums::{
    ResourceLoadReportStatus, ResourceLoaderErrorPolicy, ResourceLoaderRetryBackoff,
};
use flight_entity::{Ref, Unknown};
use flight_net::NetProgressPhase;
use flight_signals::Signal;
use flight_stream::{AbortSignal, SharedFuture};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LoadProgress {
    pub url: String,
    pub loaded: usize,
    pub total: usize,
    pub phase: NetProgressPhase,
}

#[derive(Clone, Default)]
pub struct LoadOptions {
    pub signal: Option<AbortSignal>,
    pub progress: Option<Ref<Signal<Ref<LoadProgress>>>>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResourceLoadBytes {
    pub bytes_loaded: f32,
    pub bytes_total_known: f32,
    pub items_with_known_bytes: usize,
}

pub type ResourceLoadBytesReporter = Arc<dyn Fn(f32, Option<f32>) + Send + Sync>;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResourceLoadCounts {
    pub settled_items: usize,
    pub in_flight_items: usize,
    pub queued_items: usize,
    pub total_items: usize,
}

// flight-lint: allow(contract-vocabulary) D10/D15 source factories may reject with any unknown value; retain the actual rejection identity
pub type ResourceLoadResult<T> = Result<T, Unknown>;
pub type ResourceLoadFuture<T> = Pin<Box<dyn Future<Output = ResourceLoadResult<T>> + Send>>;

#[derive(Clone)]
pub struct ResourceLoadHandle<T: Clone> {
    pub key: String,
    pub promise: SharedFuture<ResourceLoadResult<T>>,
}

// flight-lint: allow(f64) D1 timeout is a millisecond scheduling duration paired with the injected f64 host clock
#[derive(Clone)]
pub struct ResourceLoadItem<T> {
    pub bytes_hint: Option<f32>,
    pub group: Option<String>,
    pub key: Option<String>,
    pub load:
        Arc<dyn Fn(AbortSignal, ResourceLoadBytesReporter) -> ResourceLoadFuture<T> + Send + Sync>,
    pub on_bytes_progress: Option<Arc<dyn Fn(f32, f32) + Send + Sync>>,
    pub priority: Option<f32>,
    pub retries: Option<f32>,
    pub timeout_ms: Option<f64>,
    pub weight: Option<f32>,
}

#[derive(Clone)]
pub struct ResourceLoadThunk<T> {
    pub load: Arc<dyn Fn() -> ResourceLoadFuture<T> + Send + Sync>,
}

#[derive(Clone)]
pub enum ResourceLoadInput<T> {
    Item(ResourceLoadItem<T>),
    Thunk(ResourceLoadThunk<T>),
}

// flight-lint: allow(f64) D1 elapsed milliseconds subtract injected f64 clock instants without losing low timestamp bits
#[derive(Clone, Debug, PartialEq)]
pub struct ResourceLoadReport {
    pub attempts: usize,
    pub bytes: f32,
    pub elapsed_ms: f64,
    pub group: Option<String>,
    pub key: String,
    pub status: ResourceLoadReportStatus,
}

pub type ResourceLoadReports = Ref<Vec<Ref<ResourceLoadReport>>>;

// flight-lint: allow(f64) D1 timeout and retry windows are millisecond scheduling durations paired with the injected f64 host clock
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResourceLoaderOptions {
    pub dedupe: Option<bool>,
    pub error_policy: Option<ResourceLoaderErrorPolicy>,
    pub max_bytes_per_second: Option<f32>,
    pub max_concurrent: Option<f32>,
    pub retries: Option<f32>,
    pub retry_backoff: Option<ResourceLoaderRetryBackoff>,
    pub retry_base_delay_ms: Option<f64>,
    pub retry_max_delay_ms: Option<f64>,
    pub streaming: Option<bool>,
    pub timeout_ms: Option<f64>,
}
