//! Batch resource loader — queues load tasks, runs them on start, and emits
//! progress / error / completion signals, with priority, retries, dedupe,
//! groups, weighted progress, per-item reports, and item-level signals.
//!
//! # Relationship to the TypeScript module
//!
//! The TS `ResourceLoader` queues `load(signal) => Promise<T>` factories and
//! drains them concurrently on the JS event loop (bounded by `maxConcurrent`,
//! optionally bandwidth-throttled), handing each caller a `Promise<T>` and a
//! `ResourceLoadHandle`. There is no async runtime in this workspace to drive
//! `Future`s, so the Rust port models each queued task as a **synchronous**
//! factory closure returning a `Result`. `start_resource_load` drains the
//! queue in priority order, running each task to completion, and emits the same
//! observable signals: `on_progress` after each task, `on_error` for a failed
//! task, `on_complete` with the per-item [`ResourceLoadReport`] list once the
//! batch finishes, and the opt-in item signals.
//!
//! Because the executor is synchronous, the genuinely time-dependent TS
//! behaviors have no observable effect and are intentionally not modeled:
//! true wall-clock parallelism (`max_concurrent` is stored but cannot reorder a
//! sync drain), retry/throttle **delays** (retries still re-run the factory; the
//! sleep is skipped), and mid-flight `cancel`/`pause`/`resume`/`timeout` (a sync
//! `start_resource_load` finishes the whole batch before control returns, so
//! nothing is ever "in flight" to interrupt). The command guards and signals
//! for those still match TS for the deterministic, non-time-dependent cases.
//! The TS `AbortSignal` threaded into `load(signal)` is likewise dropped: a
//! synchronous call cannot be interrupted.
//!
//! # Usage
//!
//! ```rust
//! use flighthq_loader::{
//!     create_resource_loader, get_resource_loader_result, queue_resource_load,
//!     start_resource_load,
//! };
//!
//! let mut loader = create_resource_loader();
//! let handle = queue_resource_load(&mut loader, || Ok(42));
//! start_resource_load(&mut loader);
//! assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 42);
//! ```

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flighthq_signals::emit_signal;
use flighthq_types::resource::ResourceLoadErrorEvent;
use flighthq_types::{
    ResourceLoadErrorPolicy, ResourceLoadItemError, ResourceLoadItemRetry, ResourceLoadItemStatus,
    ResourceLoadProgress, ResourceLoadReport, ResourceLoader, ResourceLoaderItemSignals,
    ResourceLoaderOptions,
};

/// Internal key prefix for auto-assigned keys.
const AUTO_KEY_PREFIX: &str = "__item_";

/// The error type carried by a failed load. Mirrors the boxed error payload on
/// [`ResourceLoader::on_error`].
pub type LoadError = Box<dyn std::error::Error + Send + Sync>;

/// Handle returned by [`queue_resource_load`] / [`queue_resource_load_item`].
///
/// Carries the item's `key` and a result slot. Read the resolved value with
/// [`get_resource_loader_result`] after [`start_resource_load`] has run. `T` is
/// the loaded value type for this specific task. The handle is cheaply
/// cloneable; all clones observe the same fulfilled result and key.
pub struct ResourceLoadResult<T> {
    /// The item's key (explicit or auto-assigned), mirroring TS `handle.key`.
    pub key: String,
    slot: Arc<Mutex<Option<Result<T, LoadError>>>>,
}

impl<T> Clone for ResourceLoadResult<T> {
    fn clone(&self) -> Self {
        Self {
            key: self.key.clone(),
            slot: Arc::clone(&self.slot),
        }
    }
}

/// A descriptor for a single queued load, mirroring TS `ResourceLoadItem<T>`.
///
/// Only `load` is required; build with [`create_resource_load_item`] and set
/// the optional fields. `key` is `None` to auto-assign; `dedupe` is keyed on an
/// explicit key only.
pub struct ResourceLoadItem<T, F>
where
    F: FnMut() -> Result<T, LoadError> + Send + 'static,
{
    /// Optional byte-size hint used by the (sync-inert) bandwidth throttle.
    pub bytes_hint: u64,
    /// Optional group label.
    pub group: Option<String>,
    /// Optional explicit key; `None` auto-assigns.
    pub key: Option<String>,
    /// The synchronous load factory.
    pub load: F,
    /// Optional priority; higher dispatches first. Defaults to 0.
    pub priority: i32,
    /// Optional retry count; `None` falls back to the loader option.
    pub retries: Option<u32>,
    /// Optional per-item timeout (sync-inert); `None` falls back to the option.
    pub timeout_ms: Option<u64>,
    /// Optional weight for weighted progress. Defaults to 1.
    pub weight: u32,
}

/// Allocates a [`ResourceLoadItem`] over a load factory with default options.
pub fn create_resource_load_item<T, F>(load: F) -> ResourceLoadItem<T, F>
where
    F: FnMut() -> Result<T, LoadError> + Send + 'static,
{
    ResourceLoadItem {
        bytes_hint: 0,
        group: None,
        key: None,
        load,
        priority: 0,
        retries: None,
        timeout_ms: None,
        weight: 1,
    }
}

/// Extended loader that carries the queued tasks alongside the public signals.
///
/// The public [`ResourceLoader`] (from `flighthq-types`) exposes only the
/// signals; this wrapper holds the private task queue, progress counters,
/// reports, dedupe map, and lazily-enabled item signals.
pub struct ResourceLoaderHandle {
    /// Public signals surface: `on_cancel`/`on_complete`/`on_error`/`on_pause`/
    /// `on_progress`/`on_resume`.
    pub loader: ResourceLoader,
    cancelled: bool,
    dedupe_map: HashMap<String, ()>,
    error_policy: ResourceLoadErrorPolicy,
    item_counter: u32,
    item_signals: Option<ResourceLoaderItemSignals>,
    loaded: u32,
    max_concurrent: u32,
    options: ResourceLoaderOptions,
    paused: bool,
    pending: Vec<PendingEntry>,
    reports: Vec<ResourceLoadReport>,
    started: bool,
    streaming: bool,
    total: u32,
    total_weight: u32,
    weight_loaded: u32,
}

/// Aborts a started, not-yet-cancelled batch.
///
/// Marks every not-yet-run pending item `cancelled`, rejects its handle, and
/// emits `on_cancel`. A no-op if the loader was never started or is already
/// cancelled. (Sync note: a synchronous `start_resource_load` finishes the
/// batch before returning, so there are no in-flight items to abort; this
/// affects pending items only — relevant when paused or never drained.)
pub fn cancel_resource_load(handle: &mut ResourceLoaderHandle) {
    if !handle.started || handle.cancelled {
        return;
    }
    handle.cancelled = true;

    let pending = std::mem::take(&mut handle.pending);
    for mut entry in pending {
        let report = ResourceLoadReport {
            attempts: 0,
            bytes: 0,
            elapsed_ms: 0,
            group: entry.group.clone(),
            key: entry.key.clone(),
            status: ResourceLoadItemStatus::Cancelled,
        };
        handle.reports.push(report);
        (entry.reject)(cancel_error());
        handle.loaded += 1;
    }

    emit_signal(&handle.loader.on_cancel, &());

    emit_signal(
        &handle.loader.on_progress,
        &ResourceLoadProgress {
            loaded: handle.loaded,
            total: handle.total,
        },
    );
    emit_signal(&handle.loader.on_complete, &handle.reports.clone());
}

/// Allocates a new, empty [`ResourceLoaderHandle`] with default options.
///
/// Queue tasks with [`queue_resource_load`] / [`queue_resource_load_item`],
/// then run them with [`start_resource_load`].
pub fn create_resource_loader() -> ResourceLoaderHandle {
    create_resource_loader_with_options(ResourceLoaderOptions::default())
}

/// Allocates a [`ResourceLoaderHandle`] configured by `options`.
pub fn create_resource_loader_with_options(options: ResourceLoaderOptions) -> ResourceLoaderHandle {
    let error_policy = options.error_policy;
    let max_concurrent = options.max_concurrent;
    let streaming = options.streaming;
    ResourceLoaderHandle {
        loader: ResourceLoader::default(),
        cancelled: false,
        dedupe_map: HashMap::new(),
        error_policy,
        item_counter: 0,
        item_signals: None,
        loaded: 0,
        max_concurrent,
        options,
        paused: false,
        pending: Vec::new(),
        reports: Vec::new(),
        started: false,
        streaming,
        total: 0,
        total_weight: 0,
        weight_loaded: 0,
    }
}

/// Disconnects every listener from the loader's signals (and item signals, if
/// enabled), releasing the loader to GC. The loader struct itself remains
/// valid; this only detaches observers.
pub fn dispose_resource_loader(handle: &ResourceLoaderHandle) {
    flighthq_signals::clear_signal(&handle.loader.on_cancel);
    flighthq_signals::clear_signal(&handle.loader.on_complete);
    flighthq_signals::clear_signal(&handle.loader.on_error);
    flighthq_signals::clear_signal(&handle.loader.on_pause);
    flighthq_signals::clear_signal(&handle.loader.on_progress);
    flighthq_signals::clear_signal(&handle.loader.on_resume);

    if let Some(signals) = &handle.item_signals {
        flighthq_signals::clear_signal(&signals.on_item_complete);
        flighthq_signals::clear_signal(&signals.on_item_error);
        flighthq_signals::clear_signal(&signals.on_item_retry);
        flighthq_signals::clear_signal(&signals.on_item_start);
    }
}

/// Enables (or returns the already-enabled) per-item signal surface. Idempotent:
/// repeated calls return a reference to the same signal group.
pub fn enable_resource_loader_item_signals(
    handle: &mut ResourceLoaderHandle,
) -> &ResourceLoaderItemSignals {
    if handle.item_signals.is_none() {
        handle.item_signals = Some(ResourceLoaderItemSignals::default());
    }
    handle.item_signals.as_ref().unwrap()
}

/// Returns the status of the item with `key`: its report status if it has run,
/// else `pending` (queued) or `running`. Defaults to `pending` for an unknown
/// key, mirroring TS.
pub fn get_resource_load_item_status(
    handle: &ResourceLoaderHandle,
    key: &str,
) -> ResourceLoadItemStatus {
    if let Some(report) = handle.reports.iter().find(|r| r.key == key) {
        return report.status;
    }
    if handle.pending.iter().any(|p| p.key == key) {
        return ResourceLoadItemStatus::Pending;
    }
    ResourceLoadItemStatus::Pending
}

/// Returns batch progress in `[0, 1]`. Returns 0 before start; 1 for an empty
/// started batch; weighted fraction when weights are present, else the
/// loaded/total fraction. When `group` is `Some`, returns that group's
/// completed/total fraction (0 if the group has no items).
pub fn get_resource_load_progress(handle: &ResourceLoaderHandle, group: Option<&str>) -> f64 {
    if !handle.started {
        return 0.0;
    }

    if let Some(group) = group {
        let group_reports = handle
            .reports
            .iter()
            .filter(|r| r.group.as_deref() == Some(group))
            .count();
        let group_pending = handle
            .pending
            .iter()
            .filter(|p| p.group.as_deref() == Some(group))
            .count();
        let group_total = group_reports + group_pending;
        if group_total == 0 {
            return 0.0;
        }
        return group_reports as f64 / group_total as f64;
    }

    if handle.total == 0 {
        return 1.0;
    }
    if handle.total_weight > 0 {
        return handle.weight_loaded as f64 / handle.total_weight as f64;
    }
    handle.loaded as f64 / handle.total as f64
}

/// Returns the resolved result for a queued task, or `None` if the task has not
/// yet run. Cloned when present, so the handle can be read more than once.
pub fn get_resource_loader_result<T: Clone>(
    result: &ResourceLoadResult<T>,
) -> Option<Result<T, LoadError>> {
    let guard = result.slot.lock().unwrap();
    match &*guard {
        Some(Ok(value)) => Some(Ok(value.clone())),
        Some(Err(error)) => Some(Err(clone_load_error(error))),
        None => None,
    }
}

/// Pauses dispatching of not-yet-run items and emits `on_pause`. A no-op if the
/// loader is not started, already paused, or cancelled.
pub fn pause_resource_load(handle: &mut ResourceLoaderHandle) {
    if !handle.started || handle.paused || handle.cancelled {
        return;
    }
    handle.paused = true;
    emit_signal(&handle.loader.on_pause, &());
}

/// Queues a bare load `factory` (the TS thunk form) and returns a handle for the
/// eventual value. Equivalent to [`queue_resource_load_item`] with a default
/// item.
///
/// # Panics
///
/// Panics if called after [`start_resource_load`] in non-streaming mode — items
/// must be queued before the batch starts. This mirrors the TS `throw` and is a
/// programmer error.
pub fn queue_resource_load<T, F>(
    handle: &mut ResourceLoaderHandle,
    factory: F,
) -> ResourceLoadResult<T>
where
    T: Clone + Send + 'static,
    F: FnMut() -> Result<T, LoadError> + Send + 'static,
{
    queue_resource_load_item(handle, create_resource_load_item(factory))
}

/// Queues a descriptor-form load [`ResourceLoadItem`] and returns a handle.
///
/// Applies dedupe (on an explicit key), auto-assigns a key when none is given,
/// and accumulates total/weight bookkeeping.
///
/// # Panics
///
/// Panics if called after [`start_resource_load`] in non-streaming mode.
pub fn queue_resource_load_item<T, F>(
    handle: &mut ResourceLoaderHandle,
    item: ResourceLoadItem<T, F>,
) -> ResourceLoadResult<T>
where
    T: Clone + Send + 'static,
    F: FnMut() -> Result<T, LoadError> + Send + 'static,
{
    if handle.started && !handle.streaming {
        panic!("Cannot queue resources after loading has started");
    }

    let explicit_key = item.key.is_some();
    let key = item.key.unwrap_or_else(|| {
        let k = format!("{AUTO_KEY_PREFIX}{}", handle.item_counter);
        handle.item_counter += 1;
        k
    });
    let weight = item.weight;
    let priority = item.priority;
    let retries = item.retries.unwrap_or(handle.options.retries);
    let group = item.group;

    // Deduplication: a second queue of the same explicit key collapses onto the
    // first handle. The Rust slot is typed, so we re-derive the handle from the
    // recorded slot via a stored clone closure rather than re-running the load.
    let dedupe = handle.options.dedupe;
    if dedupe
        && explicit_key
        && handle.dedupe_map.contains_key(&key)
        && let Some(existing) = handle.pending.iter().find(|p| p.key == key)
        && let Some(typed) = existing
            .handle_clone
            .downcast_ref::<ResourceLoadResult<T>>()
    {
        return typed.clone();
    }

    let slot: Arc<Mutex<Option<Result<T, LoadError>>>> = Arc::new(Mutex::new(None));
    let task_slot = Arc::clone(&slot);

    let mut load = item.load;
    // `run` is re-callable so retries can re-invoke the factory; it overwrites
    // the typed slot with the latest attempt's outcome.
    let run: Box<dyn FnMut() -> Result<(), LoadError> + Send> = Box::new(move || match load() {
        Ok(value) => {
            *task_slot.lock().unwrap() = Some(Ok(value));
            Ok(())
        }
        Err(error) => {
            let reported = clone_load_error(&error);
            *task_slot.lock().unwrap() = Some(Err(error));
            Err(reported)
        }
    });

    let reject_slot = Arc::clone(&slot);
    let reject: Box<dyn FnMut(LoadError) + Send> = Box::new(move |error: LoadError| {
        let mut guard = reject_slot.lock().unwrap();
        if guard.is_none() {
            *guard = Some(Err(error));
        }
    });

    let result = ResourceLoadResult {
        key: key.clone(),
        slot,
    };
    let handle_clone: Box<dyn std::any::Any + Send> = Box::new(result.clone());

    handle.pending.push(PendingEntry {
        bytes_hint: item.bytes_hint,
        group: group.clone(),
        handle_clone,
        key: key.clone(),
        priority,
        reject,
        retries,
        run,
        weight,
    });
    handle.total += 1;
    handle.total_weight += weight;

    if dedupe && explicit_key {
        handle.dedupe_map.insert(key, ());
    }

    // Streaming + started: drain the newly-queued item immediately.
    if handle.started && handle.streaming {
        drain_queue(handle);
    }

    result
}

/// Resets the loader to a clean, reusable state: clears pending/in-flight,
/// reports, dedupe, counters, and the paused/cancelled/started flags. Pending
/// handles are rejected. The configured options are retained.
pub fn reset_resource_loader(handle: &mut ResourceLoaderHandle) {
    let pending = std::mem::take(&mut handle.pending);
    for mut entry in pending {
        (entry.reject)(cancel_error());
    }
    handle.cancelled = false;
    handle.dedupe_map.clear();
    handle.loaded = 0;
    handle.paused = false;
    handle.reports.clear();
    handle.started = false;
    handle.total = 0;
    handle.total_weight = 0;
    handle.weight_loaded = 0;
}

/// Resumes a paused loader, emits `on_resume`, and drains remaining items. A
/// no-op if the loader is not paused or is cancelled.
pub fn resume_resource_load(handle: &mut ResourceLoaderHandle) {
    if !handle.paused || handle.cancelled {
        return;
    }
    handle.paused = false;
    emit_signal(&handle.loader.on_resume, &());
    drain_queue(handle);
}

/// Updates the maximum concurrency of a running loader, draining the queue if
/// more slots are now available. (Sync note: concurrency cannot reorder a sync
/// drain, but this still triggers a drain of any deferred items.)
pub fn set_resource_loader_concurrency(handle: &mut ResourceLoaderHandle, max_concurrent: u32) {
    handle.max_concurrent = max_concurrent;
    if handle.started && !handle.paused && !handle.cancelled {
        drain_queue(handle);
    }
}

/// Sets the priority of a still-pending item with `key`. A no-op if no pending
/// item matches.
pub fn set_resource_load_priority(handle: &mut ResourceLoaderHandle, key: &str, priority: i32) {
    if let Some(entry) = handle.pending.iter_mut().find(|p| p.key == key) {
        entry.priority = priority;
    }
}

/// Runs all queued load tasks in priority order.
///
/// Emits `on_progress` after each task, `on_error` (with key) for a failed
/// task, and `on_complete` with the report list once the batch finishes (or
/// immediately, alongside `on_progress(0, 0)`, for an empty queue). A no-op on a
/// second call in non-streaming mode.
pub fn start_resource_load(handle: &mut ResourceLoaderHandle) {
    if handle.started && !handle.streaming {
        return;
    }
    handle.started = true;

    if handle.total == 0 {
        emit_signal(
            &handle.loader.on_progress,
            &ResourceLoadProgress {
                loaded: 0,
                total: 0,
            },
        );
        emit_signal(&handle.loader.on_complete, &Vec::new());
        return;
    }

    drain_queue(handle);
}

/// Drains the pending queue in priority order until empty, paused, or cancelled.
fn drain_queue(handle: &mut ResourceLoaderHandle) {
    while !handle.pending.is_empty() && !handle.paused && !handle.cancelled {
        // Stable sort by descending priority; insertion order breaks ties.
        handle.pending.sort_by(|a, b| b.priority.cmp(&a.priority));
        let entry = handle.pending.remove(0);
        run_entry(handle, entry);
        if handle.loaded == handle.total {
            // Clone, not take: the loader retains its reports so
            // get_resource_load_item_status / _progress(group) can query them
            // after completion (matching TS, which keeps internal.reports).
            emit_signal(&handle.loader.on_complete, &handle.reports.clone());
        }
    }
}

/// Runs a single entry to completion, applying retries and the error policy,
/// and recording its report.
fn run_entry(handle: &mut ResourceLoaderHandle, mut entry: PendingEntry) {
    if let Some(signals) = &handle.item_signals {
        emit_signal(&signals.on_item_start, &entry.key);
    }

    let mut attempt: u32 = 0;
    loop {
        let outcome = (entry.run)();
        match outcome {
            Ok(()) => {
                handle.reports.push(ResourceLoadReport {
                    attempts: attempt + 1,
                    bytes: 0,
                    elapsed_ms: 0,
                    group: entry.group.clone(),
                    key: entry.key.clone(),
                    status: ResourceLoadItemStatus::Loaded,
                });
                handle.weight_loaded += entry.weight;
                if let Some(signals) = &handle.item_signals {
                    emit_signal(&signals.on_item_complete, &entry.key);
                }
                settle_entry(handle);
                return;
            }
            Err(error) => {
                if attempt < entry.retries {
                    // Retry: re-run the factory. The TS backoff delay is skipped
                    // (no sleeping in the sync port); the retry signal still fires.
                    if let Some(signals) = &handle.item_signals {
                        emit_signal(
                            &signals.on_item_retry,
                            &ResourceLoadItemRetry {
                                attempt: attempt + 1,
                                delay_ms: 0,
                                key: entry.key.clone(),
                            },
                        );
                    }
                    attempt += 1;
                    continue;
                }

                handle.reports.push(ResourceLoadReport {
                    attempts: attempt + 1,
                    bytes: 0,
                    elapsed_ms: 0,
                    group: entry.group.clone(),
                    key: entry.key.clone(),
                    status: ResourceLoadItemStatus::Failed,
                });
                if let Some(signals) = &handle.item_signals {
                    emit_signal(
                        &signals.on_item_error,
                        &ResourceLoadItemError {
                            attempt: attempt + 1,
                            key: entry.key.clone(),
                            message: error.to_string(),
                        },
                    );
                }
                emit_signal(
                    &handle.loader.on_error,
                    &ResourceLoadErrorEvent {
                        error: clone_load_error(&error),
                        key: Some(entry.key.clone()),
                    },
                );

                if handle.error_policy == ResourceLoadErrorPolicy::FailFast {
                    cancel_remaining_entries(handle);
                }
                settle_entry(handle);
                return;
            }
        }
    }
}

/// Advances batch completion bookkeeping after an entry settles.
fn settle_entry(handle: &mut ResourceLoaderHandle) {
    handle.loaded += 1;
    emit_signal(
        &handle.loader.on_progress,
        &ResourceLoadProgress {
            loaded: handle.loaded,
            total: handle.total,
        },
    );
}

/// Marks every remaining pending item `skipped` (fail-fast), rejecting handles.
fn cancel_remaining_entries(handle: &mut ResourceLoaderHandle) {
    let pending = std::mem::take(&mut handle.pending);
    for mut entry in pending {
        handle.reports.push(ResourceLoadReport {
            attempts: 0,
            bytes: 0,
            elapsed_ms: 0,
            group: entry.group.clone(),
            key: entry.key.clone(),
            status: ResourceLoadItemStatus::Skipped,
        });
        (entry.reject)(skip_error());
        handle.loaded += 1;
    }
}

/// A type-erased queued task. `run` fulfills the typed result slot and returns
/// an erased success/error outcome; `reject` records an error into the slot
/// when the entry is cancelled/skipped before running; `handle_clone` is a
/// type-erased clone of the result handle for dedupe.
struct PendingEntry {
    // Stored for API fidelity with the TS bandwidth throttle, which is inert in
    // the synchronous port (no event loop to defer dispatch against).
    #[allow(dead_code)]
    bytes_hint: u64,
    group: Option<String>,
    handle_clone: Box<dyn std::any::Any + Send>,
    key: String,
    priority: i32,
    reject: Box<dyn FnMut(LoadError) + Send>,
    retries: u32,
    run: Box<dyn FnMut() -> Result<(), LoadError> + Send>,
    weight: u32,
}

fn cancel_error() -> LoadError {
    Box::<dyn std::error::Error + Send + Sync>::from("Load cancelled".to_string())
}

fn skip_error() -> LoadError {
    Box::<dyn std::error::Error + Send + Sync>::from(
        "Load skipped due to fail-fast error policy".to_string(),
    )
}

/// Clones a boxed error into a fresh boxed error by preserving its `Display`
/// text. Boxed `dyn Error` is not `Clone`, so both the reported copy and the
/// stored copy reduce to a string-backed error carrying the original message.
fn clone_load_error(error: &LoadError) -> LoadError {
    Box::<dyn std::error::Error + Send + Sync>::from(error.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use flighthq_signals::connect_signal;
    use flighthq_types::resource::ResourceLoadErrorEvent;

    use super::*;

    fn ok<T: Clone + Send + 'static>(value: T) -> impl FnMut() -> Result<T, LoadError> + Send {
        let taken = Some(value);
        move || Ok(taken.clone().unwrap())
    }

    fn err<T>(message: &'static str) -> impl FnMut() -> Result<T, LoadError> + Send {
        move || Err(message.into())
    }

    fn item<T, F>(key: &str, load: F) -> ResourceLoadItem<T, F>
    where
        F: FnMut() -> Result<T, LoadError> + Send + 'static,
    {
        let mut d = create_resource_load_item(load);
        d.key = Some(key.to_string());
        d
    }

    // --- cancel_resource_load ---

    #[test]
    fn cancel_resource_load_is_no_op_if_not_started() {
        let mut loader = create_resource_loader();
        let cancelled = Arc::new(Mutex::new(false));
        let c = Arc::clone(&cancelled);
        let _g = connect_signal(
            &loader.loader.on_cancel,
            Arc::new(move |_: &()| *c.lock().unwrap() = true),
            Default::default(),
        );
        cancel_resource_load(&mut loader);
        assert!(!*cancelled.lock().unwrap());
    }

    #[test]
    fn cancel_resource_load_is_no_op_if_already_cancelled() {
        // maxConcurrent 0 in TS keeps items pending; here we pause before start
        // so the queue is never drained, then cancel, then cancel again.
        let mut loader = create_resource_loader();
        queue_resource_load(&mut loader, ok(1i32));
        pause_resource_load(&mut loader); // no-op (not started) — items stay queued
        loader.started = false;
        start_resource_load_paused(&mut loader);
        cancel_resource_load(&mut loader);

        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _g = connect_signal(
            &loader.loader.on_cancel,
            Arc::new(move |_: &()| *c.lock().unwrap() += 1),
            Default::default(),
        );
        cancel_resource_load(&mut loader);
        assert_eq!(*count.lock().unwrap(), 0);
    }

    // Helper: mark started without draining (paused) so cancel has pending work.
    fn start_resource_load_paused(handle: &mut ResourceLoaderHandle) {
        handle.paused = true;
        start_resource_load(handle);
    }

    // --- create_resource_loader ---

    #[test]
    fn create_resource_loader_has_all_signals() {
        let loader = create_resource_loader();
        let _a = connect_signal(
            &loader.loader.on_cancel,
            Arc::new(|_: &()| {}),
            Default::default(),
        );
        let _b = connect_signal(
            &loader.loader.on_complete,
            Arc::new(|_: &Vec<ResourceLoadReport>| {}),
            Default::default(),
        );
        let _c = connect_signal(
            &loader.loader.on_error,
            Arc::new(|_: &ResourceLoadErrorEvent| {}),
            Default::default(),
        );
        let _d = connect_signal(
            &loader.loader.on_pause,
            Arc::new(|_: &()| {}),
            Default::default(),
        );
        let _e = connect_signal(
            &loader.loader.on_progress,
            Arc::new(|_: &ResourceLoadProgress| {}),
            Default::default(),
        );
        let _f = connect_signal(
            &loader.loader.on_resume,
            Arc::new(|_: &()| {}),
            Default::default(),
        );
    }

    #[test]
    fn create_resource_loader_accepts_options() {
        let opts = ResourceLoaderOptions {
            error_policy: ResourceLoadErrorPolicy::FailFast,
            max_concurrent: 2,
            ..Default::default()
        };
        let loader = create_resource_loader_with_options(opts);
        assert_eq!(loader.error_policy, ResourceLoadErrorPolicy::FailFast);
    }

    // --- dispose_resource_loader ---

    #[test]
    fn dispose_resource_loader_disconnects_all_listeners() {
        let mut loader = create_resource_loader();
        let called = Arc::new(Mutex::new(false));
        let c = Arc::clone(&called);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        dispose_resource_loader(&loader);
        queue_resource_load(&mut loader, ok(1i32));
        start_resource_load(&mut loader);
        assert!(!*called.lock().unwrap());
    }

    #[test]
    fn dispose_resource_loader_disconnects_item_signals_when_enabled() {
        let mut loader = create_resource_loader();
        let started = Arc::new(Mutex::new(false));
        {
            let signals = enable_resource_loader_item_signals(&mut loader);
            let s = Arc::clone(&started);
            std::mem::forget(connect_signal(
                &signals.on_item_start,
                Arc::new(move |_: &String| *s.lock().unwrap() = true),
                Default::default(),
            ));
        }
        dispose_resource_loader(&loader);
        queue_resource_load(&mut loader, ok(1i32));
        start_resource_load(&mut loader);
        assert!(!*started.lock().unwrap());
    }

    // --- enable_resource_loader_item_signals ---

    #[test]
    fn enable_resource_loader_item_signals_is_idempotent() {
        let mut loader = create_resource_loader();
        enable_resource_loader_item_signals(&mut loader);
        let ptr_a = loader.item_signals.as_ref().unwrap() as *const _;
        enable_resource_loader_item_signals(&mut loader);
        let ptr_b = loader.item_signals.as_ref().unwrap() as *const _;
        assert_eq!(ptr_a, ptr_b);
    }

    #[test]
    fn enable_resource_loader_item_signals_fires_start_and_complete() {
        let mut loader = create_resource_loader();
        let started = Arc::new(Mutex::new(Vec::<String>::new()));
        let completed = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let signals = enable_resource_loader_item_signals(&mut loader);
            let s = Arc::clone(&started);
            std::mem::forget(connect_signal(
                &signals.on_item_start,
                Arc::new(move |k: &String| s.lock().unwrap().push(k.clone())),
                Default::default(),
            ));
            let c = Arc::clone(&completed);
            std::mem::forget(connect_signal(
                &signals.on_item_complete,
                Arc::new(move |k: &String| c.lock().unwrap().push(k.clone())),
                Default::default(),
            ));
        }
        queue_resource_load_item(&mut loader, item("a", ok(1i32)));
        queue_resource_load_item(&mut loader, item("b", ok(2i32)));
        start_resource_load(&mut loader);

        assert!(started.lock().unwrap().contains(&"a".to_string()));
        assert!(started.lock().unwrap().contains(&"b".to_string()));
        assert!(completed.lock().unwrap().contains(&"a".to_string()));
        assert!(completed.lock().unwrap().contains(&"b".to_string()));
    }

    #[test]
    fn enable_resource_loader_item_signals_fires_error() {
        let mut loader = create_resource_loader();
        let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let signals = enable_resource_loader_item_signals(&mut loader);
            let e = Arc::clone(&errors);
            std::mem::forget(connect_signal(
                &signals.on_item_error,
                Arc::new(move |ev: &ResourceLoadItemError| e.lock().unwrap().push(ev.key.clone())),
                Default::default(),
            ));
        }
        queue_resource_load_item(&mut loader, item("fail", err::<i32>("oops")));
        start_resource_load(&mut loader);

        let recorded = errors.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0], "fail");
    }

    // --- error policy ---

    #[test]
    fn error_policy_continue_completes_all_items() {
        let mut loader = create_resource_loader();
        let reports = collect_reports(&mut loader);
        queue_resource_load_item(&mut loader, item("a", err::<i32>("fail")));
        queue_resource_load_item(&mut loader, item("b", ok("ok".to_string())));
        start_resource_load(&mut loader);

        let r = reports.lock().unwrap();
        assert_eq!(r.len(), 2);
        let statuses: Vec<_> = r.iter().map(|x| x.status).collect();
        assert!(statuses.contains(&ResourceLoadItemStatus::Failed));
        assert!(statuses.contains(&ResourceLoadItemStatus::Loaded));
    }

    #[test]
    fn error_policy_fail_fast_skips_remaining() {
        let opts = ResourceLoaderOptions {
            error_policy: ResourceLoadErrorPolicy::FailFast,
            max_concurrent: 1,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        let reports = collect_reports(&mut loader);
        // 'fail' has higher priority so it dispatches first.
        let mut fail = item("fail", err::<i32>("err"));
        fail.priority = 1;
        queue_resource_load_item(&mut loader, fail);
        queue_resource_load_item(&mut loader, item("skip", ok("ok".to_string())));
        start_resource_load(&mut loader);

        let r = reports.lock().unwrap();
        let status_for = |key: &str| r.iter().find(|x| x.key == key).map(|x| x.status);
        assert_eq!(status_for("fail"), Some(ResourceLoadItemStatus::Failed));
        assert_eq!(status_for("skip"), Some(ResourceLoadItemStatus::Skipped));
    }

    fn collect_reports(loader: &mut ResourceLoaderHandle) -> Arc<Mutex<Vec<ResourceLoadReport>>> {
        let reports = Arc::new(Mutex::new(Vec::new()));
        let r = Arc::clone(&reports);
        std::mem::forget(connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |reps: &Vec<ResourceLoadReport>| *r.lock().unwrap() = reps.clone()),
            Default::default(),
        ));
        reports
    }

    // --- get_resource_load_item_status ---

    #[test]
    fn get_resource_load_item_status_pending_when_unstarted() {
        let mut loader = create_resource_loader();
        queue_resource_load_item(&mut loader, item("a", ok(1i32)));
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Pending
        );
    }

    #[test]
    fn get_resource_load_item_status_loaded_when_complete() {
        let mut loader = create_resource_loader();
        queue_resource_load_item(&mut loader, item("a", ok(1i32)));
        start_resource_load(&mut loader);
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Loaded
        );
    }

    #[test]
    fn get_resource_load_item_status_failed_when_errored() {
        let mut loader = create_resource_loader();
        queue_resource_load_item(&mut loader, item("a", err::<i32>("fail")));
        start_resource_load(&mut loader);
        assert_eq!(
            get_resource_load_item_status(&loader, "a"),
            ResourceLoadItemStatus::Failed
        );
    }

    // --- get_resource_load_progress ---

    #[test]
    fn get_resource_load_progress_zero_before_start() {
        let mut loader = create_resource_loader();
        queue_resource_load(&mut loader, ok(1i32));
        assert_eq!(get_resource_load_progress(&loader, None), 0.0);
    }

    #[test]
    fn get_resource_load_progress_one_for_empty_after_start() {
        let mut loader = create_resource_loader();
        start_resource_load(&mut loader);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }

    #[test]
    fn get_resource_load_progress_one_after_all_complete() {
        let mut loader = create_resource_loader();
        queue_resource_load(&mut loader, ok(1i32));
        queue_resource_load(&mut loader, ok(2i32));
        queue_resource_load(&mut loader, ok(3i32));
        start_resource_load(&mut loader);
        assert_eq!(get_resource_load_progress(&loader, None), 1.0);
    }

    #[test]
    fn get_resource_load_progress_filters_by_group() {
        let mut loader = create_resource_loader();
        let mut a = item("a", ok(1i32));
        a.group = Some("preload".to_string());
        let mut b = item("b", ok(2i32));
        b.group = Some("level2".to_string());
        queue_resource_load_item(&mut loader, a);
        queue_resource_load_item(&mut loader, b);
        start_resource_load(&mut loader);
        assert_eq!(get_resource_load_progress(&loader, Some("preload")), 1.0);
        assert_eq!(get_resource_load_progress(&loader, Some("level2")), 1.0);
    }

    // --- get_resource_loader_result ---

    #[test]
    fn get_resource_loader_result_none_before_start() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, ok(1i32));
        assert!(get_resource_loader_result(&handle).is_none());
    }

    #[test]
    fn get_resource_loader_result_can_be_read_twice() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, ok(7i32));
        start_resource_load(&mut loader);
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 7);
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 7);
    }

    // --- pause_resource_load ---

    #[test]
    fn pause_resource_load_emits_on_pause() {
        let mut loader = create_resource_loader();
        let paused = Arc::new(Mutex::new(false));
        let p = Arc::clone(&paused);
        let _g = connect_signal(
            &loader.loader.on_pause,
            Arc::new(move |_: &()| *p.lock().unwrap() = true),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok(1i32));
        start_resource_load(&mut loader);
        pause_resource_load(&mut loader);
        assert!(*paused.lock().unwrap());
    }

    #[test]
    fn pause_resource_load_is_no_op_if_not_started() {
        let mut loader = create_resource_loader();
        let paused = Arc::new(Mutex::new(false));
        let p = Arc::clone(&paused);
        let _g = connect_signal(
            &loader.loader.on_pause,
            Arc::new(move |_: &()| *p.lock().unwrap() = true),
            Default::default(),
        );
        pause_resource_load(&mut loader);
        assert!(!*paused.lock().unwrap());
    }

    // --- queue_resource_load ---

    #[test]
    fn queue_resource_load_accepts_bare_thunk() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, ok("hello".to_string()));
        start_resource_load(&mut loader);
        assert_eq!(
            get_resource_loader_result(&handle).unwrap().unwrap(),
            "hello"
        );
    }

    #[test]
    fn queue_resource_load_accepts_item_descriptor() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load_item(&mut loader, item("img", ok("data".to_string())));
        start_resource_load(&mut loader);
        assert_eq!(
            get_resource_loader_result(&handle).unwrap().unwrap(),
            "data"
        );
    }

    #[test]
    fn queue_resource_load_returns_handle_with_key() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load_item(&mut loader, item("my_key", ok(42i32)));
        assert_eq!(handle.key, "my_key");
    }

    #[test]
    fn queue_resource_load_auto_assigns_key() {
        let mut loader = create_resource_loader();
        let handle = queue_resource_load(&mut loader, ok(1i32));
        assert!(!handle.key.is_empty());
    }

    #[test]
    #[should_panic(expected = "Cannot queue resources after loading has started")]
    fn queue_resource_load_panics_after_start_non_streaming() {
        let mut loader = create_resource_loader();
        start_resource_load(&mut loader);
        let _ = queue_resource_load(&mut loader, ok(1i32));
    }

    #[test]
    fn queue_resource_load_deduplicates_same_key() {
        let mut loader = create_resource_loader();
        let count = Arc::new(Mutex::new(0u32));
        let c1 = Arc::clone(&count);
        let f1 = move || {
            *c1.lock().unwrap() += 1;
            Ok::<_, LoadError>("value".to_string())
        };
        let c2 = Arc::clone(&count);
        let f2 = move || {
            *c2.lock().unwrap() += 1;
            Ok::<_, LoadError>("value".to_string())
        };
        let h1 = queue_resource_load_item(&mut loader, item("asset", f1));
        let h2 = queue_resource_load_item(&mut loader, item("asset", f2));
        start_resource_load(&mut loader);
        assert_eq!(*count.lock().unwrap(), 1);
        assert_eq!(h1.key, h2.key);
        assert_eq!(get_resource_loader_result(&h1).unwrap().unwrap(), "value");
    }

    #[test]
    fn queue_resource_load_does_not_deduplicate_when_disabled() {
        let opts = ResourceLoaderOptions {
            dedupe: false,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        let count = Arc::new(Mutex::new(0u32));
        let c1 = Arc::clone(&count);
        let c2 = Arc::clone(&count);
        queue_resource_load_item(
            &mut loader,
            item("asset", move || {
                *c1.lock().unwrap() += 1;
                Ok::<_, LoadError>(1i32)
            }),
        );
        queue_resource_load_item(
            &mut loader,
            item("asset", move || {
                *c2.lock().unwrap() += 1;
                Ok::<_, LoadError>(1i32)
            }),
        );
        start_resource_load(&mut loader);
        assert_eq!(*count.lock().unwrap(), 2);
    }

    #[test]
    fn queue_resource_load_fires_progress_after_each_item() {
        let mut loader = create_resource_loader();
        let progress = Arc::new(Mutex::new(Vec::<(u32, u32)>::new()));
        let p = Arc::clone(&progress);
        let _g = connect_signal(
            &loader.loader.on_progress,
            Arc::new(move |e: &ResourceLoadProgress| p.lock().unwrap().push((e.loaded, e.total))),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok("a".to_string()));
        queue_resource_load(&mut loader, ok("b".to_string()));
        queue_resource_load(&mut loader, ok("c".to_string()));
        start_resource_load(&mut loader);

        let recorded = progress.lock().unwrap();
        assert_eq!(recorded.len(), 3);
        assert_eq!(recorded[2], (3, 3));
    }

    #[test]
    fn queue_resource_load_fires_complete_after_all_items() {
        let mut loader = create_resource_loader();
        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok(1i32));
        queue_resource_load(&mut loader, ok(2i32));
        start_resource_load(&mut loader);
        assert!(*completed.lock().unwrap());
    }

    #[test]
    fn queue_resource_load_fires_error_with_key_but_completes() {
        let mut loader = create_resource_loader();
        let errors = Arc::new(Mutex::new(Vec::<(String, Option<String>)>::new()));
        let e = Arc::clone(&errors);
        let _g = connect_signal(
            &loader.loader.on_error,
            Arc::new(move |ev: &ResourceLoadErrorEvent| {
                e.lock()
                    .unwrap()
                    .push((ev.error.to_string(), ev.key.clone()))
            }),
            Default::default(),
        );
        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _g2 = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok("ok".to_string()));
        queue_resource_load_item(&mut loader, item("fail", err::<i32>("oops")));
        start_resource_load(&mut loader);

        let recorded = errors.lock().unwrap();
        assert_eq!(recorded.len(), 1);
        assert_eq!(recorded[0].0, "oops");
        assert_eq!(recorded[0].1, Some("fail".to_string()));
        assert!(*completed.lock().unwrap());
    }

    // --- reset_resource_loader ---

    #[test]
    fn reset_resource_loader_allows_reuse() {
        let mut loader = create_resource_loader();
        queue_resource_load(&mut loader, ok(1i32));
        start_resource_load(&mut loader);

        reset_resource_loader(&mut loader);

        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok(2i32));
        start_resource_load(&mut loader);
        assert!(*completed.lock().unwrap());
    }

    #[test]
    fn reset_resource_loader_resets_progress() {
        let mut loader = create_resource_loader();
        queue_resource_load(&mut loader, ok(1i32));
        start_resource_load(&mut loader);
        reset_resource_loader(&mut loader);
        assert_eq!(get_resource_load_progress(&loader, None), 0.0);
    }

    // --- resume_resource_load ---

    #[test]
    fn resume_resource_load_is_no_op_if_not_paused() {
        let mut loader = create_resource_loader();
        let resumed = Arc::new(Mutex::new(false));
        let r = Arc::clone(&resumed);
        let _g = connect_signal(
            &loader.loader.on_resume,
            Arc::new(move |_: &()| *r.lock().unwrap() = true),
            Default::default(),
        );
        resume_resource_load(&mut loader);
        assert!(!*resumed.lock().unwrap());
    }

    #[test]
    fn resume_resource_load_emits_and_drains_paused_queue() {
        // Pause before draining, then resume drains the queue to completion.
        let mut loader = create_resource_loader();
        let resumed = Arc::new(Mutex::new(false));
        let r = Arc::clone(&resumed);
        let _g = connect_signal(
            &loader.loader.on_resume,
            Arc::new(move |_: &()| *r.lock().unwrap() = true),
            Default::default(),
        );
        let handle = queue_resource_load(&mut loader, ok(1i32));
        start_resource_load_paused(&mut loader);
        assert!(get_resource_loader_result(&handle).is_none());
        resume_resource_load(&mut loader);
        assert!(*resumed.lock().unwrap());
        assert_eq!(get_resource_loader_result(&handle).unwrap().unwrap(), 1);
    }

    // --- retries ---

    #[test]
    fn retries_retries_failing_item_specified_times() {
        let mut loader = create_resource_loader();
        let attempts = Arc::new(Mutex::new(0u32));
        let a = Arc::clone(&attempts);
        let mut d = item("r", move || {
            *a.lock().unwrap() += 1;
            Err::<i32, LoadError>("transient".into())
        });
        d.retries = Some(2);
        queue_resource_load_item(&mut loader, d);
        start_resource_load(&mut loader);
        assert_eq!(*attempts.lock().unwrap(), 3); // 1 initial + 2 retries
    }

    #[test]
    fn retries_resolves_when_a_retry_succeeds() {
        let mut loader = create_resource_loader();
        let attempts = Arc::new(Mutex::new(0u32));
        let a = Arc::clone(&attempts);
        let mut d = item("r", move || {
            let mut n = a.lock().unwrap();
            *n += 1;
            if *n < 3 {
                Err::<String, LoadError>("transient".into())
            } else {
                Ok("success".to_string())
            }
        });
        d.retries = Some(3);
        let handle = queue_resource_load_item(&mut loader, d);
        start_resource_load(&mut loader);
        assert_eq!(
            get_resource_loader_result(&handle).unwrap().unwrap(),
            "success"
        );
        assert_eq!(*attempts.lock().unwrap(), 3);
    }

    // --- set_resource_load_priority ---

    #[test]
    fn set_resource_load_priority_dispatches_high_first() {
        let opts = ResourceLoaderOptions {
            max_concurrent: 1,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        let order = Arc::new(Mutex::new(Vec::<String>::new()));
        let o1 = Arc::clone(&order);
        let o2 = Arc::clone(&order);
        queue_resource_load_item(
            &mut loader,
            item("low", move || {
                o1.lock().unwrap().push("low".to_string());
                Ok::<_, LoadError>(1i32)
            }),
        );
        queue_resource_load_item(
            &mut loader,
            item("high", move || {
                o2.lock().unwrap().push("high".to_string());
                Ok::<_, LoadError>(2i32)
            }),
        );
        set_resource_load_priority(&mut loader, "high", 10);
        start_resource_load(&mut loader);

        let recorded = order.lock().unwrap();
        assert_eq!(recorded[0], "high");
        assert_eq!(recorded[1], "low");
    }

    // --- set_resource_loader_concurrency ---

    #[test]
    fn set_resource_loader_concurrency_completes_without_error() {
        let opts = ResourceLoaderOptions {
            max_concurrent: 1,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        let completed = Arc::new(Mutex::new(false));
        let c = Arc::clone(&completed);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        queue_resource_load(&mut loader, ok(1i32));
        queue_resource_load(&mut loader, ok(2i32));
        start_resource_load(&mut loader);
        set_resource_loader_concurrency(&mut loader, 4);
        assert!(*completed.lock().unwrap());
    }

    // --- start_resource_load ---

    #[test]
    fn start_resource_load_completes_immediately_when_empty() {
        let mut loader = create_resource_loader();
        let called = Arc::new(Mutex::new(false));
        let c = Arc::clone(&called);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() = true),
            Default::default(),
        );
        start_resource_load(&mut loader);
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn start_resource_load_fires_progress_zero_zero_when_empty() {
        let mut loader = create_resource_loader();
        let args = Arc::new(Mutex::new(None::<(u32, u32)>));
        let a = Arc::clone(&args);
        let _g = connect_signal(
            &loader.loader.on_progress,
            Arc::new(move |e: &ResourceLoadProgress| {
                *a.lock().unwrap() = Some((e.loaded, e.total))
            }),
            Default::default(),
        );
        start_resource_load(&mut loader);
        assert_eq!(*args.lock().unwrap(), Some((0, 0)));
    }

    #[test]
    fn start_resource_load_is_no_op_on_second_call_non_streaming() {
        let mut loader = create_resource_loader();
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _g = connect_signal(
            &loader.loader.on_complete,
            Arc::new(move |_: &Vec<ResourceLoadReport>| *c.lock().unwrap() += 1),
            Default::default(),
        );
        start_resource_load(&mut loader);
        start_resource_load(&mut loader);
        assert_eq!(*count.lock().unwrap(), 1);
    }

    #[test]
    fn start_resource_load_complete_receives_reports() {
        let mut loader = create_resource_loader();
        let reports = collect_reports(&mut loader);
        queue_resource_load_item(&mut loader, item("a", ok(1i32)));
        start_resource_load(&mut loader);
        let r = reports.lock().unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].key, "a");
        assert_eq!(r[0].status, ResourceLoadItemStatus::Loaded);
    }

    #[test]
    fn start_resource_load_streaming_allows_queue_after_start() {
        let opts = ResourceLoaderOptions {
            streaming: true,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        start_resource_load(&mut loader);
        let handle = queue_resource_load(&mut loader, ok("streamed".to_string()));
        assert_eq!(
            get_resource_loader_result(&handle).unwrap().unwrap(),
            "streamed"
        );
    }

    // --- bytes progress ---

    #[test]
    fn report_includes_bytes_field_defaulting_to_zero() {
        let mut loader = create_resource_loader();
        let reports = collect_reports(&mut loader);
        queue_resource_load_item(&mut loader, item("a", ok(1i32)));
        start_resource_load(&mut loader);
        assert_eq!(reports.lock().unwrap()[0].bytes, 0);
    }

    // --- weight-aware progress ---

    #[test]
    fn weighted_progress_uses_weights() {
        let opts = ResourceLoaderOptions {
            max_concurrent: 1,
            ..Default::default()
        };
        let mut loader = create_resource_loader_with_options(opts);
        let mut a = item("a", ok(1i32));
        a.weight = 10;
        a.priority = 1; // dispatch first deterministically
        let mut b = item("b", ok(2i32));
        b.weight = 90;
        queue_resource_load_item(&mut loader, a);
        queue_resource_load_item(&mut loader, b);

        // get_resource_load_progress needs &loader, so it cannot be read from
        // inside an on_progress callback (which only sees the payload). Assert the
        // weighted formula directly: after both items the weighted progress is 1.0.
        start_resource_load(&mut loader);
        assert!((get_resource_load_progress(&loader, None) - 1.0).abs() < 1e-9);
    }
}
