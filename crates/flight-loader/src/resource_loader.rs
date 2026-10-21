use crate::enums::{ResourceLoadItemStatus, ResourceLoadReportStatus, ResourceLoaderErrorPolicy};
use crate::types::*;
use flight_entity::{
    Ref, Unknown, allocate_entity, throw_error, throw_type_error, unknown_from_panic,
};
use flight_hostcapability::TimerHandle;
use flight_signals::{clear_signal, create_signal, emit_signal};
use flight_stream::{AbortController, AbortSignal, create_abort_controller, create_shared_future};
use flight_stream::{
    AbortError, abort_controller, add_abort_listener, get_abort_signal_reason,
    is_abort_signal_aborted,
};
use futures::FutureExt;
use futures::channel::oneshot;
use std::any::Any;
use std::collections::HashMap;
use std::future::Future;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::task::Poll;

#[cfg(test)]
mod queue_tests {
    use super::*;
    use futures::FutureExt;

    fn fixture() -> Ref<ResourceLoader> {
        return Arc::new(RwLock::new(allocate_entity()));
    }

    fn item<T: Clone + Send + Sync + 'static>(key: Option<&str>, value: T) -> ResourceLoadInput<T> {
        return ResourceLoadInput::Item(ResourceLoadItem {
            bytes_hint: None,
            group: None,
            key: key.map(str::to_string),
            load: Arc::new(move |_, _| {
                let value = value.clone();
                Box::pin(async move { Ok(value) })
            }),
            on_bytes_progress: None,
            priority: None,
            retries: None,
            timeout_ms: None,
            weight: None,
        });
    }

    #[test]
    fn same_type_dedupe_keeps_handle_and_promise_identity_without_starting_factories() {
        let loader = fixture();
        let first = queue_entry(&loader, item(Some("same"), 1));
        let second = queue_entry(&loader, item(Some("same"), 2));
        assert!(Arc::ptr_eq(&first, &second));
        let state = loader.read().unwrap().state.clone();
        let entry = state.read().unwrap().pending.read().unwrap()[0].clone();
        assert_eq!(get_resource_load_counts(&loader).total_items, 1);
        let promise = first.read().unwrap().promise.clone();
        assert!(promise.clone().now_or_never().is_none());
        let resolve = entry.read().unwrap().resolve.clone();
        resolve(erase_value(42_i32));
        assert_eq!(futures::executor::block_on(promise).unwrap(), 42);
        assert_eq!(
            futures::executor::block_on(second.read().unwrap().promise.clone()).unwrap(),
            42
        );
        resolve(erase_value(100_i32));
        assert_eq!(
            futures::executor::block_on(first.read().unwrap().promise.clone()).unwrap(),
            42
        );
    }

    #[test]
    fn same_key_type_misuse_throws_type_error_without_poisoning_the_loader() {
        let loader = fixture();
        queue_entry(&loader, item(Some("same"), 1_i32));
        let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            queue_entry(&loader, item(Some("same"), "incompatible".to_string()));
        }))
        .unwrap_err();
        let failure = failure.downcast::<flight_entity::FlightError>().unwrap();
        assert_eq!(failure.kind, flight_entity::FlightErrorKind::TypeError);
        assert_eq!(get_resource_load_counts(&loader).total_items, 1);
        queue_entry(
            &loader,
            item(Some("different"), "valid other T".to_string()),
        );
        assert_eq!(get_resource_load_counts(&loader).total_items, 2);
    }

    #[test]
    fn source_object_and_unknown_values_survive_the_typed_erased_storage_bridge() {
        let loader = fixture();
        let object = Arc::new(RwLock::new("shared object".to_string()));
        let handle = queue_entry(&loader, item(Some("object"), object.clone()));
        let state = loader.read().unwrap().state.clone();
        let entry = state.read().unwrap().pending.read().unwrap()[0].clone();
        let resolve = entry.read().unwrap().resolve.clone();
        resolve(erase_value(object.clone()));
        let actual = futures::executor::block_on(handle.read().unwrap().promise.clone()).unwrap();
        assert!(Arc::ptr_eq(&actual, &object));

        let value: Unknown = Some(Arc::new("opaque".to_string()));
        assert!(Arc::ptr_eq(
            erase_value(value.clone()).as_ref().unwrap(),
            value.as_ref().unwrap()
        ));
        assert!(restore_value::<Unknown>(&None).is_none());
        assert!(Arc::ptr_eq(
            restore_value::<Unknown>(&value).as_ref().unwrap(),
            value.as_ref().unwrap()
        ));
    }

    #[test]
    fn releasing_resolvers_leaves_the_source_handle_pending_and_recycles_a_fresh_abort_controller()
    {
        let loader = fixture();
        let handle = queue_entry(&loader, item(Some("old"), 1_i32));
        let state = loader.read().unwrap().state.clone();
        let entry = state.read().unwrap().pending.read().unwrap()[0].clone();
        let old = entry.read().unwrap().abort_controller.clone();
        flight_stream::abort_controller(&old, None);
        release_pending_entry(&entry, &state);
        assert!(
            handle
                .read()
                .unwrap()
                .promise
                .clone()
                .now_or_never()
                .is_none()
        );
        let recycled = acquire_pending_entry(&state);
        assert!(Arc::ptr_eq(&entry, &recycled));
        assert!(!flight_stream::is_abort_signal_aborted(
            &recycled.read().unwrap().abort_controller.signal
        ));
        assert!(flight_stream::is_abort_signal_aborted(&old.signal));
    }

    #[test]
    fn queue_reads_live_defaults_keeps_open_scalars_and_only_advances_auto_keys_for_unnamed_items()
    {
        let loader = fixture();
        let state = loader.read().unwrap().state.clone();
        let options = state.read().unwrap().options.clone();
        options.write().unwrap().retries = Some(1.5);
        options.write().unwrap().timeout_ms = Some(13.75);
        let first = queue_entry(&loader, item(None, 1));
        queue_entry(&loader, item(Some("explicit"), 2));
        let second = queue_entry(&loader, item(None, 3));
        assert_eq!(first.read().unwrap().key, "__item_0");
        assert_eq!(second.read().unwrap().key, "__item_1");
        let entry = state.read().unwrap().pending.read().unwrap()[0].clone();
        assert_eq!(entry.read().unwrap().retries, 1.5);
        assert_eq!(entry.read().unwrap().timeout_ms, 13.75);
        assert_eq!(entry.read().unwrap().weight, 1.0);
        options.write().unwrap().dedupe = Some(false);
        queue_entry(&loader, item(Some("explicit"), 4));
        assert_eq!(get_resource_load_counts(&loader).total_items, 4);
    }

    #[test]
    fn non_streaming_queue_after_start_throws_the_source_error_and_remains_queryable() {
        let loader = fixture();
        loader.read().unwrap().state.write().unwrap().started = true;
        let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            queue_entry(&loader, item(None, 1));
        }))
        .unwrap_err();
        assert_eq!(
            failure
                .downcast::<flight_entity::FlightError>()
                .unwrap()
                .message,
            "Cannot queue resources after loading has started"
        );
        assert_eq!(get_resource_load_counts(&loader).total_items, 0);
    }
}

type EntryRef = Ref<PendingEntry>;
type PendingEntries = Ref<Vec<EntryRef>>;

// flight-lint: allow(f64) D1 started-at instants and timeout durations use host-clock milliseconds
struct PendingEntry {
    abort_controller: Arc<AbortController>,
    bytes_hint: f32,
    bytes_loaded: f32,
    generation: usize,
    group: Option<String>,
    key: String,
    on_bytes_progress: Option<Arc<dyn Fn(f32, f32) + Send + Sync>>,
    priority: f32,
    reject: Arc<dyn Fn(Unknown) + Send + Sync>,
    resolve: Arc<dyn Fn(Unknown) + Send + Sync>,
    retries: f32,
    started_at: f64,
    timeout_ms: f64,
    weight: f32,
    wrapped_load: Arc<
        dyn Fn(AbortSignal, ResourceLoadBytesReporter) -> ResourceLoadFuture<Unknown> + Send + Sync,
    >,
}

struct InFlightEntry {
    order: usize,
    entry: EntryRef,
}

/// Insertion IDs preserve live Set iteration even when an abort callback clears and reinserts.
#[derive(Default)]
struct InFlightSet {
    next_order: usize,
    entries: Vec<InFlightEntry>,
}

// flight-lint: allow(f64) D1 token refill subtracts millisecond clock instants before converting to a scalar rate
struct TokenBucket {
    last_refill_ms: f64,
    max_bytes_per_second: f32,
    tokens: f32,
}

pub(crate) struct ResourceLoaderInternal {
    cancelled: bool,
    context: Option<ResourceLoaderContext>,
    dedupe_map: HashMap<String, Unknown>,
    error_policy: ResourceLoaderErrorPolicy,
    generation: usize,
    in_flight: Ref<InFlightSet>,
    item_counter: usize,
    item_signals: Option<Ref<ResourceLoaderItemSignals>>,
    loaded: usize,
    max_concurrent: f32,
    options: Ref<ResourceLoaderOptions>,
    paused: bool,
    pending: PendingEntries,
    pool: Vec<EntryRef>,
    reports: ResourceLoadReports,
    started: bool,
    streaming: bool,
    throttle: Option<TokenBucket>,
    total: usize,
    total_weight: f32,
    weight_loaded: f32,
}

struct Attempt {
    context: ResourceLoaderContext,
    entry: EntryRef,
    index: usize,
    live: Arc<AtomicBool>,
    loader: Ref<ResourceLoader>,
    timeout: Option<TimerHandle>,
}

// flight-lint: allow(f64) D1 host timer delays are millisecond scheduling durations
fn create_delay(
    context: &ResourceLoaderContext,
    ms: f64,
) -> Pin<Box<dyn Future<Output = ()> + Send>> {
    if ms <= 0.0 {
        return Box::pin(async {});
    }
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    (context.timers.set_timeout)(
        ms,
        Arc::new(move || {
            let sender = sender.lock().unwrap().take();
            if let Some(sender) = sender {
                let _ = sender.send(());
            }
        }),
    );
    return Box::pin(async move {
        if receiver.await.is_err() {
            std::future::pending::<()>().await;
        }
    });
}

// flight-lint: allow(conform-params) D5 explicit host spawn/timer context replaces ambient Promise execution, Date.now and timers
pub fn create_resource_loader(
    options: Option<&Ref<ResourceLoaderOptions>>,
    context: &ResourceLoaderContext,
) -> Ref<ResourceLoader> {
    let mut out = allocate_entity();
    initialize_resource_loader(&mut out, options, context);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D5 retained host spawn/timer context replaces ambient Promise execution, Date.now and timers
pub fn initialize_resource_loader(
    out: &mut ResourceLoader,
    options: Option<&Ref<ResourceLoaderOptions>>,
    context: &ResourceLoaderContext,
) {
    let options = options
        .cloned()
        .unwrap_or_else(|| Arc::new(RwLock::new(ResourceLoaderOptions::default())));
    let settings = options.read().unwrap().clone();
    let throttle = settings
        .max_bytes_per_second
        .filter(|rate| *rate > 0.0)
        .map(|rate| TokenBucket {
            last_refill_ms: (context.timers.now_ms)(),
            max_bytes_per_second: rate,
            tokens: rate,
        });
    out.on_cancel = create_signal();
    out.on_complete = create_signal();
    out.on_error = create_signal();
    out.on_pause = create_signal();
    out.on_progress = create_signal();
    out.on_resume = create_signal();
    *out.state.write().unwrap() = ResourceLoaderInternal {
        context: Some(context.clone()),
        error_policy: settings
            .error_policy
            .unwrap_or(ResourceLoaderErrorPolicy::Continue),
        max_concurrent: settings.max_concurrent.unwrap_or(6.0),
        options,
        streaming: settings.streaming.unwrap_or(false),
        throttle,
        ..ResourceLoaderInternal::default()
    };
}

fn abort_error(message: &str, name: &str) -> Unknown {
    return Some(Arc::new(AbortError {
        name: name.to_string(),
        message: message.to_string(),
    }));
}

fn acquire_pending_entry(state: &Ref<ResourceLoaderInternal>) -> EntryRef {
    if let Some(entry) = state.write().unwrap().pool.pop() {
        return entry;
    }
    return Arc::new(RwLock::new(PendingEntry {
        abort_controller: Arc::new(create_abort_controller()),
        bytes_hint: 0.0,
        bytes_loaded: 0.0,
        generation: 0,
        group: None,
        key: String::new(),
        on_bytes_progress: None,
        priority: 0.0,
        reject: Arc::new(|_| {}),
        resolve: Arc::new(|_| {}),
        retries: 0.0,
        started_at: 0.0,
        timeout_ms: 0.0,
        weight: 1.0,
        wrapped_load: Arc::new(|_, _| Box::pin(async { Ok(None) })),
    }));
}

// flight-lint: allow(f64) D1 report elapsed time subtracts host millisecond instants
fn append_report(
    state: &Ref<ResourceLoaderInternal>,
    entry: &EntryRef,
    attempts: usize,
    status: ResourceLoadReportStatus,
    measured: bool,
    now: Option<f64>,
) {
    let report = {
        let entry = entry.read().unwrap();
        ResourceLoadReport {
            attempts,
            bytes: if measured { entry.bytes_loaded } else { 0.0 },
            elapsed_ms: now.map(|now| now - entry.started_at).unwrap_or(0.0),
            group: entry.group.clone(),
            key: entry.key.clone(),
            status,
        }
    };
    let reports = state.read().unwrap().reports.clone();
    reports.write().unwrap().push(Arc::new(RwLock::new(report)));
}

fn cancel_remaining_entries(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let pending = state.read().unwrap().pending.clone();
    for_each_pending(&pending, |entry| {
        let controller = entry.read().unwrap().abort_controller.clone();
        abort_controller(&controller, None);
        append_report(
            &state,
            entry,
            0,
            ResourceLoadReportStatus::Skipped,
            false,
            None,
        );
        let reject = entry.read().unwrap().reject.clone();
        reject(abort_error(
            "Load skipped due to fail-fast error policy",
            "AbortError",
        ));
        count_entry_settled(&state, entry);
        release_pending_entry(entry, &state);
    });
    state.write().unwrap().pending = Arc::new(RwLock::new(Vec::new()));
}

pub fn cancel_resource_load(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let flights = {
        let mut state = state.write().unwrap();
        if state.cancelled {
            return;
        }
        state.cancelled = true;
        state.in_flight.clone()
    };
    let error = abort_error("Load cancelled", "AbortError");
    for_each_in_flight(&flights, |entry| {
        let controller = entry.read().unwrap().abort_controller.clone();
        abort_controller(&controller, Some(error.clone()));
    });
    let pending = state.read().unwrap().pending.clone();
    for_each_pending(&pending, |entry| {
        let controller = entry.read().unwrap().abort_controller.clone();
        abort_controller(&controller, Some(error.clone()));
        append_report(
            &state,
            entry,
            0,
            ResourceLoadReportStatus::Cancelled,
            false,
            None,
        );
        let reject = entry.read().unwrap().reject.clone();
        reject(error.clone());
        count_entry_settled(&state, entry);
        release_pending_entry(entry, &state);
    });
    state.write().unwrap().pending = Arc::new(RwLock::new(Vec::new()));
    let signal = loader.read().unwrap().on_cancel.clone();
    emit_signal(&signal, &());
    check_complete_after_cancel(loader);
}

fn check_complete_after_cancel(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let flights = state.read().unwrap().in_flight.clone();
    if flights.read().unwrap().entries.is_empty() {
        emit_progress(loader);
        emit_complete(loader);
    }
}

// flight-lint: allow(f64) D1 source retry windows use host millisecond scheduling precision
fn compute_retry_delay(index: usize, state: &Ref<ResourceLoaderInternal>) -> f64 {
    let options = state.read().unwrap().options.clone();
    let options = options.read().unwrap();
    let backoff = options
        .retry_backoff
        .unwrap_or(crate::ResourceLoaderRetryBackoff::None);
    let base = options.retry_base_delay_ms.unwrap_or(100.0);
    let max = options.retry_max_delay_ms.unwrap_or(10000.0);
    let delay = match backoff {
        crate::ResourceLoaderRetryBackoff::None => return 0.0,
        crate::ResourceLoaderRetryBackoff::Linear => base * (index + 1) as f64,
        crate::ResourceLoaderRetryBackoff::Exponential => base * 2.0_f64.powf(index as f64),
    };
    return if delay.is_nan() || max.is_nan() {
        f64::NAN
    } else {
        delay.min(max)
    };
}

fn count_entry_settled(state: &Ref<ResourceLoaderInternal>, entry: &EntryRef) {
    let weight = entry.read().unwrap().weight;
    let mut state = state.write().unwrap();
    state.loaded += 1;
    state.weight_loaded += weight;
}

pub fn dispose_resource_loader(loader: &Ref<ResourceLoader>) {
    let loader = loader.read().unwrap();
    clear_signal(&loader.on_cancel);
    clear_signal(&loader.on_complete);
    clear_signal(&loader.on_error);
    clear_signal(&loader.on_pause);
    clear_signal(&loader.on_progress);
    clear_signal(&loader.on_resume);
    let items = loader.state.read().unwrap().item_signals.clone();
    if let Some(items) = items {
        let items = items.read().unwrap();
        clear_signal(&items.on_item_complete);
        clear_signal(&items.on_item_error);
        clear_signal(&items.on_item_retry);
        clear_signal(&items.on_item_start);
    }
}

fn drain_queue(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let limit = state.read().unwrap().max_concurrent;
    let limit = if limit <= 0.0 { f32::INFINITY } else { limit };
    drain_queue_with_limit(loader, limit, &loader_context(loader));
}

fn drain_queue_with_limit(
    loader: &Ref<ResourceLoader>,
    limit: f32,
    context: &ResourceLoaderContext,
) {
    loop {
        let state = loader.read().unwrap().state.clone();
        let pending = {
            let state = state.read().unwrap();
            let count = state.in_flight.read().unwrap().entries.len();
            if state.paused || state.cancelled || !((count as f32) < limit) {
                return;
            }
            state.pending.clone()
        };
        let entry = {
            let mut pending = pending.write().unwrap();
            pending.sort_by(|a, b| {
                let difference = b.read().unwrap().priority - a.read().unwrap().priority;
                difference
                    .partial_cmp(&0.0)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            pending.first().cloned()
        };
        let Some(entry) = entry else {
            return;
        };
        let cost = entry.read().unwrap().bytes_hint;
        if let Some(wait_ms) = token_bucket_delay(&state, cost, context) {
            if wait_ms > 0.0 {
                let delay = create_delay(context, wait_ms);
                let loader = loader.clone();
                let next_context = context.clone();
                (context.spawn.spawn)(Box::pin(async move {
                    delay.await;
                    let state = loader.read().unwrap().state.clone();
                    let stop = {
                        let state = state.read().unwrap();
                        state.paused || state.cancelled || state.pending.read().unwrap().is_empty()
                    };
                    if !stop {
                        drain_queue_with_limit(&loader, limit, &next_context);
                    }
                }));
                return;
            }
            if let Some(bucket) = state.write().unwrap().throttle.as_mut() {
                let tokens = bucket.tokens - cost;
                bucket.tokens = if tokens.is_nan() {
                    f32::NAN
                } else {
                    tokens.max(0.0)
                };
            }
        }
        pending.write().unwrap().remove(0);
        let flights = state.read().unwrap().in_flight.clone();
        {
            let mut flights = flights.write().unwrap();
            let order = flights.next_order;
            flights.next_order += 1;
            flights.entries.push(InFlightEntry {
                order,
                entry: entry.clone(),
            });
        }
        let now = (context.timers.now_ms)();
        entry.write().unwrap().started_at = now;
        run_entry(&entry, loader, 0, context);
    }
}

fn emit_complete(loader: &Ref<ResourceLoader>) {
    let signal = loader.read().unwrap().on_complete.clone();
    let state = loader.read().unwrap().state.clone();
    let reports = state.read().unwrap().reports.clone();
    emit_signal(&signal, &reports);
}

fn emit_progress(loader: &Ref<ResourceLoader>) {
    let signal = loader.read().unwrap().on_progress.clone();
    emit_signal(&signal, &get_resource_load_progress(loader, None));
}

pub fn enable_resource_loader_item_signals(
    loader: &Ref<ResourceLoader>,
) -> Ref<ResourceLoaderItemSignals> {
    let state = loader.read().unwrap().state.clone();
    let mut state = state.write().unwrap();
    if let Some(items) = &state.item_signals {
        return items.clone();
    }
    let items = Arc::new(RwLock::new(allocate_entity()));
    state.item_signals = Some(items.clone());
    return items;
}

/// The typed bridge erases only storage; canonical Unknown values keep their original slot.
fn erase_value<T: Send + Sync + 'static>(value: T) -> Unknown {
    let value: Arc<dyn Any + Send + Sync> = Arc::new(value);
    if let Some(value) = value.downcast_ref::<Unknown>() {
        return value.clone();
    }
    return Some(value);
}

fn finish_failure(attempt: &Attempt, error: Unknown) {
    let loader = &attempt.loader;
    let entry = &attempt.entry;
    let state = loader.read().unwrap().state.clone();
    if is_orphaned(entry, &state) {
        remove_in_flight(entry, &state);
        release_pending_entry(entry, &state);
        return;
    }
    let cancelled = state.read().unwrap().cancelled;
    if cancelled {
        append_report(
            &state,
            entry,
            attempt.index + 1,
            ResourceLoadReportStatus::Cancelled,
            true,
            Some((attempt.context.timers.now_ms)()),
        );
        let reject = entry.read().unwrap().reject.clone();
        reject(error);
        remove_in_flight(entry, &state);
        count_entry_settled(&state, entry);
        release_pending_entry(entry, &state);
        check_complete_after_cancel(loader);
        return;
    }
    let terminal_abort = is_abort_or_timeout(&error);
    if (attempt.index as f32) < entry.read().unwrap().retries && !terminal_abort {
        let delay_ms = compute_retry_delay(attempt.index, &state);
        let items = state.read().unwrap().item_signals.clone();
        if let Some(items) = items {
            let signal = items.read().unwrap().on_item_retry.clone();
            let key = entry.read().unwrap().key.clone();
            emit_signal(&signal, &(key, attempt.index + 1, delay_ms));
        }
        let delay = create_delay(&attempt.context, delay_ms);
        let entry = entry.clone();
        let loader = loader.clone();
        let context = attempt.context.clone();
        let index = attempt.index + 1;
        (attempt.context.spawn.spawn)(Box::pin(async move {
            yield_promise_turn().await;
            delay.await;
            let state = loader.read().unwrap().state.clone();
            let cancelled = state.read().unwrap().cancelled;
            if cancelled {
                remove_in_flight(&entry, &state);
                count_entry_settled(&state, &entry);
                release_pending_entry(&entry, &state);
                check_complete_after_cancel(&loader);
                return;
            }
            run_entry(&entry, &loader, index, &context);
        }));
        return;
    }
    append_report(
        &state,
        entry,
        attempt.index + 1,
        ResourceLoadReportStatus::Failed,
        true,
        Some((attempt.context.timers.now_ms)()),
    );
    let items = state.read().unwrap().item_signals.clone();
    if let Some(items) = items {
        let signal = items.read().unwrap().on_item_error.clone();
        let key = entry.read().unwrap().key.clone();
        emit_signal(&signal, &(key, error.clone(), attempt.index + 1));
    }
    let (reject, key) = {
        let entry = entry.read().unwrap();
        (entry.reject.clone(), entry.key.clone())
    };
    reject(error.clone());
    let signal = loader.read().unwrap().on_error.clone();
    emit_signal(&signal, &(error, key));
    if state.read().unwrap().error_policy == ResourceLoaderErrorPolicy::FailFast {
        cancel_remaining_entries(loader);
    }
    settle_entry(entry, loader);
}

fn finish_success(attempt: &Attempt, value: Unknown) {
    let state = attempt.loader.read().unwrap().state.clone();
    if is_orphaned(&attempt.entry, &state) {
        remove_in_flight(&attempt.entry, &state);
        release_pending_entry(&attempt.entry, &state);
        return;
    }
    if state.read().unwrap().cancelled {
        remove_in_flight(&attempt.entry, &state);
        count_entry_settled(&state, &attempt.entry);
        release_pending_entry(&attempt.entry, &state);
        check_complete_after_cancel(&attempt.loader);
        return;
    }
    append_report(
        &state,
        &attempt.entry,
        attempt.index + 1,
        ResourceLoadReportStatus::Loaded,
        true,
        Some((attempt.context.timers.now_ms)()),
    );
    let resolve = attempt.entry.read().unwrap().resolve.clone();
    resolve(value.clone());
    let items = state.read().unwrap().item_signals.clone();
    if let Some(items) = items {
        let signal = items.read().unwrap().on_item_complete.clone();
        let key = attempt.entry.read().unwrap().key.clone();
        emit_signal(&signal, &(key, value));
    }
    settle_entry(&attempt.entry, &attempt.loader);
}

fn for_each_in_flight(flights: &Ref<InFlightSet>, callback: impl Fn(&EntryRef)) {
    let mut after = None;
    loop {
        let next = flights
            .read()
            .unwrap()
            .entries
            .iter()
            .find(|slot| after.is_none_or(|order| slot.order > order))
            .map(|slot| (slot.order, slot.entry.clone()));
        let Some((order, entry)) = next else {
            return;
        };
        after = Some(order);
        callback(&entry);
    }
}

fn for_each_pending(pending: &PendingEntries, callback: impl Fn(&EntryRef)) {
    let mut index = 0;
    loop {
        let entry = pending.read().unwrap().get(index).cloned();
        let Some(entry) = entry else {
            return;
        };
        index += 1;
        callback(&entry);
    }
}

pub fn get_resource_load_bytes(loader: &Ref<ResourceLoader>) -> ResourceLoadBytes {
    let state = loader.read().unwrap().state.clone();
    let state = state.read().unwrap();
    let mut bytes_loaded = 0.0;
    let mut bytes_total_known = 0.0;
    let mut items_with_known_bytes = 0;
    for report in state.reports.read().unwrap().iter() {
        let report = report.read().unwrap();
        bytes_loaded += report.bytes;
        if report.bytes > 0.0 {
            bytes_total_known += report.bytes;
            items_with_known_bytes += 1;
        }
    }
    for slot in &state.in_flight.read().unwrap().entries {
        let entry = slot.entry.read().unwrap();
        bytes_loaded += entry.bytes_loaded;
        if entry.bytes_hint > 0.0 {
            bytes_total_known += entry.bytes_hint;
            items_with_known_bytes += 1;
        }
    }
    for entry in state.pending.read().unwrap().iter() {
        let entry = entry.read().unwrap();
        if entry.bytes_hint > 0.0 {
            bytes_total_known += entry.bytes_hint;
            items_with_known_bytes += 1;
        }
    }
    return ResourceLoadBytes {
        bytes_loaded,
        bytes_total_known,
        items_with_known_bytes,
    };
}

pub fn get_resource_load_counts(loader: &Ref<ResourceLoader>) -> ResourceLoadCounts {
    let state = loader.read().unwrap().state.clone();
    let state = state.read().unwrap();
    let settled_items = state.reports.read().unwrap().len();
    let in_flight_items = state.in_flight.read().unwrap().entries.len();
    let queued_items = state.pending.read().unwrap().len();
    return ResourceLoadCounts {
        settled_items,
        in_flight_items,
        queued_items,
        total_items: settled_items + in_flight_items + queued_items,
    };
}

pub fn get_resource_load_item_status(
    loader: &Ref<ResourceLoader>,
    key: &str,
) -> ResourceLoadItemStatus {
    let state = loader.read().unwrap().state.clone();
    let state = state.read().unwrap();
    for report in state.reports.read().unwrap().iter() {
        let report = report.read().unwrap();
        if report.key == key {
            return match report.status {
                ResourceLoadReportStatus::Cancelled => ResourceLoadItemStatus::Cancelled,
                ResourceLoadReportStatus::Failed => ResourceLoadItemStatus::Failed,
                ResourceLoadReportStatus::Loaded => ResourceLoadItemStatus::Loaded,
                ResourceLoadReportStatus::Skipped => ResourceLoadItemStatus::Skipped,
            };
        }
    }
    if state
        .pending
        .read()
        .unwrap()
        .iter()
        .any(|entry| entry.read().unwrap().key == key)
    {
        return ResourceLoadItemStatus::Pending;
    }
    if state
        .in_flight
        .read()
        .unwrap()
        .entries
        .iter()
        .any(|slot| slot.entry.read().unwrap().key == key)
    {
        return ResourceLoadItemStatus::Running;
    }
    return ResourceLoadItemStatus::Pending;
}

pub fn get_resource_load_progress(loader: &Ref<ResourceLoader>, group: Option<&str>) -> f32 {
    let state = loader.read().unwrap().state.clone();
    let state = state.read().unwrap();
    if !state.started {
        return 0.0;
    }
    if let Some(group) = group {
        let reports = state
            .reports
            .read()
            .unwrap()
            .iter()
            .filter(|report| report.read().unwrap().group.as_deref() == Some(group))
            .count();
        let pending = state
            .pending
            .read()
            .unwrap()
            .iter()
            .filter(|entry| entry.read().unwrap().group.as_deref() == Some(group))
            .count();
        let in_flight = state
            .in_flight
            .read()
            .unwrap()
            .entries
            .iter()
            .filter(|slot| slot.entry.read().unwrap().group.as_deref() == Some(group))
            .count();
        let total = reports + pending + in_flight;
        return if total == 0 {
            0.0
        } else {
            reports as f32 / total as f32
        };
    }
    if state.total == 0 {
        return 1.0;
    }
    if state.total_weight > 0.0 {
        return state.weight_loaded / state.total_weight;
    }
    return state.loaded as f32 / state.total as f32;
}

/// Source DOMException brand checks also see through the canonical Rust catch bridge.
fn is_abort_or_timeout(error: &Unknown) -> bool {
    let mut value = error.clone();
    let mut visited = Vec::new();
    loop {
        let Some(current) = value else {
            return false;
        };
        if let Some(error) = current.downcast_ref::<AbortError>() {
            return error.name == "AbortError" || error.name == "TimeoutError";
        }
        let Some(caught) = current.downcast_ref::<flight_entity::CaughtPanic>() else {
            return false;
        };
        let identity = Arc::as_ptr(&current) as *const () as usize;
        if visited.contains(&identity) {
            return false;
        }
        visited.push(identity);
        let payload = flight_entity::get_caught_panic_payload(caught);
        if let Some(error) = payload.downcast_ref::<AbortError>() {
            return error.name == "AbortError" || error.name == "TimeoutError";
        }
        if let Some(error) = payload.downcast_ref::<Arc<AbortError>>() {
            return error.name == "AbortError" || error.name == "TimeoutError";
        }
        value = if let Some(error) = payload.downcast_ref::<Unknown>() {
            error.clone()
        } else if let Some(error) = payload.downcast_ref::<Arc<dyn Any + Send + Sync>>() {
            Some(error.clone())
        } else {
            return false;
        };
    }
}

fn is_orphaned(entry: &EntryRef, state: &Ref<ResourceLoaderInternal>) -> bool {
    let generation = entry.read().unwrap().generation;
    return generation != state.read().unwrap().generation;
}

fn loader_context(loader: &Ref<ResourceLoader>) -> ResourceLoaderContext {
    let state = loader.read().unwrap().state.clone();
    let context = state.read().unwrap().context.clone();
    return context.unwrap_or_else(|| throw_type_error("Resource loader is not initialized"));
}

pub fn pause_resource_load(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    {
        let mut state = state.write().unwrap();
        if !state.started || state.paused || state.cancelled {
            return;
        }
        state.paused = true;
    }
    let signal = loader.read().unwrap().on_pause.clone();
    emit_signal(&signal, &());
}

fn queue_entry<T: Clone + Send + Sync + 'static>(
    loader: &Ref<ResourceLoader>,
    item: ResourceLoadInput<T>,
) -> Ref<ResourceLoadHandle<T>> {
    let state = loader.read().unwrap().state.clone();
    let forbidden = {
        let state = state.read().unwrap();
        state.started && !state.streaming
    };
    if forbidden {
        throw_error("Cannot queue resources after loading has started");
    }
    let item = match item {
        ResourceLoadInput::Item(item) => item,
        ResourceLoadInput::Thunk(thunk) => ResourceLoadItem {
            bytes_hint: None,
            group: None,
            key: None,
            load: Arc::new(move |_, _| (thunk.load)()),
            on_bytes_progress: None,
            priority: None,
            retries: None,
            timeout_ms: None,
            weight: None,
        },
    };
    let explicit_key = item.key.is_some();
    let (key, generation, options) = {
        let mut state = state.write().unwrap();
        let key = item.key.clone().unwrap_or_else(|| {
            let key = format!("__item_{}", state.item_counter);
            state.item_counter += 1;
            key
        });
        (key, state.generation, state.options.clone())
    };
    let options = options.read().unwrap().clone();
    let dedupe = options.dedupe != Some(false) && explicit_key;
    if dedupe {
        let existing = state.read().unwrap().dedupe_map.get(&key).cloned();
        if let Some(Some(existing)) = existing {
            return match existing.downcast::<RwLock<ResourceLoadHandle<T>>>() {
                Ok(existing) => existing,
                Err(_) => throw_type_error(
                    "Resource load key was already queued with a different value type",
                ),
            };
        }
    }
    let (sender, receiver) = oneshot::channel::<ResourceLoadResult<T>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let resolve_sender = sender.clone();
    let resolve = Arc::new(move |value: Unknown| {
        let sender = resolve_sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let value = restore_value::<T>(&value);
            let _ = sender.send(Ok(value));
        }
    });
    let reject = Arc::new(move |error| {
        let sender = sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let _ = sender.send(Err(error));
        }
    });
    let promise = create_shared_future(Box::pin(async move {
        return match receiver.await {
            Ok(value) => value,
            // Source reset/orphan release drops its resolvers without settling the Promise.
            Err(_) => std::future::pending().await,
        };
    }));
    let entry = acquire_pending_entry(&state);
    let abort_controller = entry.read().unwrap().abort_controller.clone();
    let load = item.load;
    *entry.write().unwrap() = PendingEntry {
        abort_controller,
        bytes_hint: item.bytes_hint.unwrap_or(0.0),
        bytes_loaded: 0.0,
        generation,
        group: item.group,
        key: key.clone(),
        on_bytes_progress: item.on_bytes_progress,
        priority: item.priority.unwrap_or(0.0),
        reject,
        resolve,
        retries: item.retries.or(options.retries).unwrap_or(0.0),
        started_at: 0.0,
        timeout_ms: item.timeout_ms.or(options.timeout_ms).unwrap_or(0.0),
        weight: item.weight.unwrap_or(1.0),
        wrapped_load: Arc::new(move |signal, reporter| {
            let future = load(signal, reporter);
            return Box::pin(async move { future.await.map(erase_value) });
        }),
    };
    let weight = entry.read().unwrap().weight;
    let handle = Arc::new(RwLock::new(ResourceLoadHandle {
        key: key.clone(),
        promise,
    }));
    {
        let mut state = state.write().unwrap();
        state.pending.write().unwrap().push(entry);
        state.total += 1;
        state.total_weight += weight;
        if dedupe {
            state.dedupe_map.insert(key, Some(handle.clone()));
        }
    }
    return handle;
}

// flight-lint: allow(contract-vocabulary) Principal batch10: native Send+Sync bounds enable canonical opaque T and SharedFuture storage; source T is not narrowed to Entity or serialized values
pub fn queue_resource_load<T: Clone + Send + Sync + 'static>(
    loader: &Ref<ResourceLoader>,
    item: ResourceLoadInput<T>,
) -> Ref<ResourceLoadHandle<T>> {
    let handle = queue_entry(loader, item);
    let should_drain = {
        let state = loader.read().unwrap().state.clone();
        let state = state.read().unwrap();
        state.started && state.streaming
    };
    if should_drain {
        drain_queue(loader);
    }
    return handle;
}

fn release_pending_entry(entry: &EntryRef, state: &Ref<ResourceLoaderInternal>) {
    {
        let mut entry = entry.write().unwrap();
        entry.on_bytes_progress = None;
        entry.reject = Arc::new(|_| {});
        entry.resolve = Arc::new(|_| {});
        entry.wrapped_load = Arc::new(|_, _| Box::pin(async { Ok(None) }));
        entry.abort_controller = Arc::new(create_abort_controller());
    }
    state.write().unwrap().pool.push(entry.clone());
}

fn remove_in_flight(entry: &EntryRef, state: &Ref<ResourceLoaderInternal>) {
    let flights = state.read().unwrap().in_flight.clone();
    flights
        .write()
        .unwrap()
        .entries
        .retain(|slot| !Arc::ptr_eq(&slot.entry, entry));
}

pub fn reset_resource_loader(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let flights = {
        let mut state = state.write().unwrap();
        state.generation += 1;
        state.in_flight.clone()
    };
    for_each_in_flight(&flights, |entry| {
        let controller = entry.read().unwrap().abort_controller.clone();
        abort_controller(&controller, None);
    });
    let pending = state.read().unwrap().pending.clone();
    for_each_pending(&pending, |entry| {
        let controller = entry.read().unwrap().abort_controller.clone();
        abort_controller(&controller, None);
        release_pending_entry(entry, &state);
    });
    let has_throttle = {
        let mut state = state.write().unwrap();
        state.cancelled = false;
        state.dedupe_map.clear();
        state.in_flight.write().unwrap().entries.clear();
        state.loaded = 0;
        state.paused = false;
        state.pending = Arc::new(RwLock::new(Vec::new()));
        state.reports = Arc::new(RwLock::new(Vec::new()));
        state.started = false;
        state.total = 0;
        state.total_weight = 0.0;
        state.weight_loaded = 0.0;
        state.throttle.is_some()
    };
    if has_throttle {
        let now = (loader_context(loader).timers.now_ms)();
        if let Some(bucket) = state.write().unwrap().throttle.as_mut() {
            bucket.tokens = bucket.max_bytes_per_second;
            bucket.last_refill_ms = now;
        }
    }
}

fn restore_value<T: Clone + 'static>(value: &Unknown) -> T {
    let slot: &dyn Any = value;
    if let Some(value) = slot.downcast_ref::<T>() {
        return value.clone();
    }
    if let Some(value) = value.as_ref().and_then(|value| value.downcast_ref::<T>()) {
        return value.clone();
    }
    throw_type_error("Resource load value does not match its typed handle");
}

pub fn resume_resource_load(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    {
        let mut state = state.write().unwrap();
        if !state.paused || state.cancelled {
            return;
        }
        state.paused = false;
    }
    let signal = loader.read().unwrap().on_resume.clone();
    emit_signal(&signal, &());
    drain_queue(loader);
}

/// Starts the source async function's synchronous prefix before handing its continuation to the host.
fn run_entry(
    entry: &EntryRef,
    loader: &Ref<ResourceLoader>,
    index: usize,
    context: &ResourceLoaderContext,
) {
    let result = catch_unwind(AssertUnwindSafe(|| {
        run_entry_prefix(entry, loader, index, context)
    }));
    if let Err(payload) = result {
        // A throw outside runEntry's try body is a rejected detached Promise, not a caller throw.
        (context.spawn.spawn)(Box::pin(async move {
            resume_unwind(payload);
        }));
    }
}

fn run_entry_prefix(
    entry: &EntryRef,
    loader: &Ref<ResourceLoader>,
    index: usize,
    context: &ResourceLoaderContext,
) {
    let state = loader.read().unwrap().state.clone();
    if is_orphaned(entry, &state) {
        release_pending_entry(entry, &state);
        return;
    }
    let items = state.read().unwrap().item_signals.clone();
    if let Some(items) = items {
        let signal = items.read().unwrap().on_item_start.clone();
        let key = entry.read().unwrap().key.clone();
        emit_signal(&signal, &key);
    }
    let controller = entry.read().unwrap().abort_controller.clone();
    let signal = controller.signal.clone();
    let live = Arc::new(AtomicBool::new(true));
    let reporter_live = live.clone();
    let reporter_entry = entry.clone();
    let reporter: ResourceLoadBytesReporter = Arc::new(move |loaded, total| {
        if !reporter_live.load(Ordering::SeqCst) {
            return;
        }
        let (callback, hint) = {
            let mut entry = reporter_entry.write().unwrap();
            entry.bytes_loaded = loaded;
            (entry.on_bytes_progress.clone(), entry.bytes_hint)
        };
        if let Some(callback) = callback {
            callback(loaded, total.unwrap_or(hint));
        }
    });
    let timeout_ms = entry.read().unwrap().timeout_ms;
    let timeout = if timeout_ms > 0.0 {
        let entry = entry.clone();
        Some((context.timers.set_timeout)(
            timeout_ms,
            Arc::new(move || {
                let controller = entry.read().unwrap().abort_controller.clone();
                abort_controller(
                    &controller,
                    Some(abort_error("Load timed out", "TimeoutError")),
                );
            }),
        ))
    } else {
        None
    };
    let attempt = Attempt {
        context: context.clone(),
        entry: entry.clone(),
        index,
        live,
        loader: loader.clone(),
        timeout,
    };
    let factory = entry.read().unwrap().wrapped_load.clone();
    let created = catch_unwind(AssertUnwindSafe(|| factory(signal.clone(), reporter)));
    let future = match created {
        Ok(future) => future,
        Err(payload) => {
            stop_attempt(&attempt);
            finish_failure(&attempt, unknown_from_panic(payload));
            return;
        }
    };
    let future = create_shared_future(Box::pin(async move {
        return match AssertUnwindSafe(future).catch_unwind().await {
            Ok(result) => result,
            Err(payload) => Err(unknown_from_panic(payload)),
        };
    }));
    // A Promise.race loser keeps executing. The first factory/abort settlement wins,
    // while a separate host-driven factory observer remains alive after cancellation.
    let (sender, receiver) = oneshot::channel::<ResourceLoadResult<Unknown>>();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let factory_sender = sender.clone();
    (context.spawn.spawn)(Box::pin(async move {
        let result = future.await;
        let sender = factory_sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }));
    let abort_sender = sender;
    let original_controller = Arc::downgrade(&controller);
    let aborted = Arc::new(move || {
        let Some(controller) = original_controller.upgrade() else {
            return;
        };
        let reason = get_abort_signal_reason(&controller.signal)
            .flatten()
            .or_else(|| abort_error("Aborted", "AbortError"));
        let sender = abort_sender.lock().unwrap().take();
        if let Some(sender) = sender {
            let _ = sender.send(Err(reason));
        }
    });
    if is_abort_signal_aborted(&signal) {
        aborted();
    } else {
        add_abort_listener(&signal, aborted);
    }
    (context.spawn.spawn)(Box::pin(async move {
        yield_promise_turn().await;
        let result = match receiver.await {
            Ok(result) => result,
            Err(_) => std::future::pending().await,
        };
        stop_attempt(&attempt);
        match result {
            Ok(value) => {
                if let Err(payload) =
                    catch_unwind(AssertUnwindSafe(|| finish_success(&attempt, value)))
                {
                    finish_failure(&attempt, unknown_from_panic(payload));
                }
            }
            Err(error) => finish_failure(&attempt, error),
        }
    }));
}

pub fn set_resource_load_priority(loader: &Ref<ResourceLoader>, key: &str, priority: f32) {
    let state = loader.read().unwrap().state.clone();
    let pending = state.read().unwrap().pending.clone();
    let entry = pending
        .read()
        .unwrap()
        .iter()
        .find(|entry| entry.read().unwrap().key == key)
        .cloned();
    if let Some(entry) = entry {
        entry.write().unwrap().priority = priority;
    }
}

pub fn set_resource_loader_concurrency(loader: &Ref<ResourceLoader>, max_concurrent: f32) {
    let state = loader.read().unwrap().state.clone();
    let should_drain = {
        let mut state = state.write().unwrap();
        state.max_concurrent = max_concurrent;
        state.started && !state.paused && !state.cancelled
    };
    if should_drain {
        drain_queue(loader);
    }
}

fn settle_entry(entry: &EntryRef, loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    remove_in_flight(entry, &state);
    count_entry_settled(&state, entry);
    emit_progress(loader);
    release_pending_entry(entry, &state);
    let complete = {
        let state = state.read().unwrap();
        state.loaded == state.total
    };
    if complete {
        emit_complete(loader);
    } else {
        drain_queue(loader);
    }
}

pub fn start_resource_load(loader: &Ref<ResourceLoader>) {
    let state = loader.read().unwrap().state.clone();
    let empty = {
        let mut state = state.write().unwrap();
        if state.started && !state.streaming {
            return;
        }
        state.started = true;
        state.total == 0
    };
    if empty {
        emit_progress(loader);
        let signal = loader.read().unwrap().on_complete.clone();
        emit_signal(&signal, &Arc::new(RwLock::new(Vec::new())));
        return;
    }
    drain_queue(loader);
}

fn stop_attempt(attempt: &Attempt) {
    if let Some(timeout) = &attempt.timeout {
        (timeout.cancel)();
    }
    attempt.live.store(false, Ordering::SeqCst);
}

// flight-lint: allow(f64) D1 refill compares host millisecond instants and returns a rounded millisecond delay
fn token_bucket_delay(
    state: &Ref<ResourceLoaderInternal>,
    cost: f32,
    context: &ResourceLoaderContext,
) -> Option<f64> {
    let applies = cost > 0.0 && state.read().unwrap().throttle.is_some();
    if !applies {
        return None;
    }
    let now = (context.timers.now_ms)();
    let mut state = state.write().unwrap();
    let bucket = state.throttle.as_mut()?;
    let elapsed = ((now - bucket.last_refill_ms) / 1000.0) as f32;
    let replenished = bucket.tokens + elapsed * bucket.max_bytes_per_second;
    bucket.tokens = if replenished.is_nan() || bucket.max_bytes_per_second.is_nan() {
        f32::NAN
    } else {
        replenished.min(bucket.max_bytes_per_second)
    };
    bucket.last_refill_ms = now;
    if cost == 0.0 || bucket.tokens >= cost {
        return Some(0.0);
    }
    return Some((f64::from((cost - bucket.tokens) / bucket.max_bytes_per_second) * 1000.0).ceil());
}

/// Awaiting an already-settled JS Promise still queues a continuation. This future only yields;
/// the supplied host executor owns the task and wake queue.
async fn yield_promise_turn() {
    let mut yielded = false;
    std::future::poll_fn(move |context| {
        if yielded {
            return Poll::Ready(());
        }
        yielded = true;
        context.waker().wake_by_ref();
        return Poll::Pending;
    })
    .await;
}

impl Default for ResourceLoaderInternal {
    fn default() -> Self {
        return Self {
            cancelled: false,
            context: None,
            dedupe_map: HashMap::new(),
            error_policy: ResourceLoaderErrorPolicy::Continue,
            generation: 0,
            in_flight: Arc::new(RwLock::new(InFlightSet::default())),
            item_counter: 0,
            item_signals: None,
            loaded: 0,
            max_concurrent: 6.0,
            options: Arc::new(RwLock::new(ResourceLoaderOptions::default())),
            paused: false,
            pending: Arc::new(RwLock::new(Vec::new())),
            pool: Vec::new(),
            reports: Arc::new(RwLock::new(Vec::new())),
            started: false,
            streaming: false,
            throttle: None,
            total: 0,
            total_weight: 0.0,
            weight_loaded: 0.0,
        };
    }
}
