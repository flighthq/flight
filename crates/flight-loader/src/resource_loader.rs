use crate::enums::{ResourceLoadItemStatus, ResourceLoadReportStatus, ResourceLoaderErrorPolicy};
use crate::types::*;
use flight_entity::{Ref, Unknown, allocate_entity, throw_error, throw_type_error};
use flight_signals::clear_signal;
use flight_stream::{AbortController, AbortSignal, create_abort_controller, create_shared_future};
use futures::channel::oneshot;
use std::any::Any;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

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

/// The typed bridge erases only storage; canonical Unknown values keep their original slot.
fn erase_value<T: Send + Sync + 'static>(value: T) -> Unknown {
    let value: Arc<dyn Any + Send + Sync> = Arc::new(value);
    if let Some(value) = value.downcast_ref::<Unknown>() {
        return value.clone();
    }
    return Some(value);
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

impl Default for ResourceLoaderInternal {
    fn default() -> Self {
        return Self {
            cancelled: false,
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
