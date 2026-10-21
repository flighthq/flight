use crate::enums::AssetLoadStatus;
use crate::types::*;
use flight_entity::{FlightError, FlightErrorKind, unknown_from_panic};
use flight_entity::{Ref, Unknown, allocate_entity, throw_error, throw_type_error};
use flight_loader::ResourceLoaderContext;
use flight_loader::{
    ResourceLoadFuture, ResourceLoadInput, ResourceLoadResult, ResourceLoadThunk,
    create_resource_loader, dispose_resource_loader, get_resource_load_counts, queue_resource_load,
    start_resource_load,
};
use flight_signals::{connect_signal, emit_signal};
use flight_stream::{SharedFuture, create_shared_future};
use futures::FutureExt;
use futures::channel::oneshot;
use std::any::{Any, TypeId};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex, RwLock};
use std::task::Poll;

// flight-lint: allow(conform-params) D5 retained canonical scheduler context replaces ambient execution in group and acquisition continuations
pub fn create_asset_library(context: &ResourceLoaderContext) -> Ref<AssetLibrary> {
    let mut out: AssetLibrary = allocate_entity();
    initialize_asset_library(&mut out, context);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D5 retained canonical scheduler context replaces ambient execution in group and acquisition continuations
pub fn initialize_asset_library(out: &mut AssetLibrary, context: &ResourceLoaderContext) {
    out.library_runtime = Arc::new(RwLock::new(AssetLibraryRuntime {
        context: Some(context.clone()),
        ..AssetLibraryRuntime::default()
    }));
}

// flight-lint: allow(contract-vocabulary) Principal137e9de4 approved native same-T generic promise projection preserves the canonical shared operation and actual opaque value
pub fn acquire_asset<T: Clone + Send + Sync + 'static>(
    library: &Ref<AssetLibrary>,
    id: &str,
) -> SharedFuture<ResourceLoadResult<T>> {
    let runtime = library.read().unwrap().library_runtime.clone();
    let descriptor = runtime.read().unwrap().descriptors.get(id).cloned();
    let Some(descriptor) = descriptor else {
        invoke_acquire_guard(
            library,
            &runtime,
            id,
            AssetLoadStatus::MissingDescriptor,
            None,
        );
        return rejected_promise(&format!("assets: no descriptor for id \"{id}\""));
    };
    let key = descriptor.read().unwrap().r#type.clone();
    let adapter = runtime.read().unwrap().adapter_calls.get(&key).cloned();
    let Some(adapter) = adapter else {
        invoke_acquire_guard(
            library,
            &runtime,
            id,
            AssetLoadStatus::MissingLoader,
            Some(key.clone()),
        );
        return rejected_promise(&format!("assets: no loader for type \"{key}\""));
    };
    let existing = runtime.read().unwrap().entries.get(id).cloned();
    if let Some(entry) = existing {
        let (resident, value, promise) = {
            let mut entry = entry.write().unwrap();
            entry.refcount += 1;
            (
                entry.resident,
                entry.value.clone(),
                entry.load_promise.clone(),
            )
        };
        if resident {
            let value = restore_value::<T>(&value.unwrap());
            return create_shared_future(Box::pin(async move { Ok(value) }));
        }
        let Some(promise) = promise else {
            throw_error(&format!(
                "assets: acquire for \"{id}\" re-entered before its load promise was initialized"
            ));
        };
        return project_promise(&runtime, &entry, promise);
    }
    let entry = Arc::new(RwLock::new(AssetEntry {
        value: None,
        refcount: 1,
        load_promise: None,
        resident: false,
    }));
    let context = {
        let mut runtime = runtime.write().unwrap();
        runtime.freed_ids.retain(|freed| freed != id);
        runtime.entries.insert(id.to_string(), entry.clone());
        let order = runtime.next_order;
        runtime.next_order += 1;
        runtime.entry_order.push(EntryOrder {
            order,
            id: id.to_string(),
            entry: entry.clone(),
        });
        runtime.context.clone().unwrap()
    };
    // A synchronous adapter throw leaves the half-initialized entry, exactly as in the source.
    let future = (adapter.load)(&descriptor);
    let original_runtime = runtime.clone();
    let original_entry = entry.clone();
    let original_id = id.to_string();
    let promise = create_shared_future(Box::pin(async move {
        let outcome = AssertUnwindSafe(async move {
            yield_promise_turn().await;
            let result = AssertUnwindSafe(future)
                .catch_unwind()
                .await
                .unwrap_or_else(|error| Err(unknown_from_panic(error)));
            match result {
                Ok(value) => {
                    let current = original_runtime
                        .read()
                        .unwrap()
                        .entries
                        .get(&original_id)
                        .cloned();
                    let attached = current
                        .as_ref()
                        .is_some_and(|current| Arc::ptr_eq(current, &original_entry));
                    if !attached || original_entry.read().unwrap().refcount == 0 {
                        (adapter.dispose)(value.clone());
                        return Ok(value);
                    }
                    {
                        let mut entry = original_entry.write().unwrap();
                        entry.value = Some(value.clone());
                        entry.resident = true;
                        entry.load_promise = None;
                    }
                    clear_projections(&original_runtime, &original_entry);
                    return Ok(value);
                }
                Err(error) => {
                    let current = original_runtime
                        .read()
                        .unwrap()
                        .entries
                        .get(&original_id)
                        .cloned();
                    if current
                        .as_ref()
                        .is_some_and(|current| Arc::ptr_eq(current, &original_entry))
                    {
                        delete_entry(&original_runtime, &original_id);
                    }
                    return Err(error);
                }
            }
        })
        .catch_unwind()
        .await;
        return outcome.unwrap_or_else(|error| Err(unknown_from_panic(error)));
    }));
    entry.write().unwrap().load_promise = Some(promise.clone());
    let typed = project_promise(&runtime, &entry, promise.clone());
    (context.spawn.spawn)(Box::pin(async move {
        let _ = promise.await;
    }));
    return typed;
}

fn clear_projections(runtime: &Ref<AssetLibraryRuntime>, entry: &Ref<AssetEntry>) {
    runtime.write().unwrap().projections.retain(|projection| {
        projection
            .entry
            .upgrade()
            .is_some_and(|current| !Arc::ptr_eq(&current, entry))
    });
}

fn copy_asset_descriptor(descriptor: &Ref<AssetDescriptor>) -> Ref<AssetDescriptor> {
    let mut stored = descriptor.read().unwrap().clone();
    if let Some(group_names) = stored.groups.as_mut() {
        let mut unique = Vec::new();
        for group in group_names.iter() {
            if !unique.contains(group) {
                unique.push(group.clone());
            }
        }
        *group_names = unique;
    }
    return Arc::new(RwLock::new(stored));
}

fn delete_entry(runtime: &Ref<AssetLibraryRuntime>, id: &str) {
    let mut runtime = runtime.write().unwrap();
    let entry = runtime.entries.remove(id);
    runtime.entry_order.retain(|slot| slot.id != id);
    if let Some(entry) = entry {
        runtime.projections.retain(|projection| {
            projection
                .entry
                .upgrade()
                .is_some_and(|current| !Arc::ptr_eq(&current, &entry))
        });
    }
}

fn dispose_asset_entry(runtime: &Ref<AssetLibraryRuntime>, id: &str, entry: &Ref<AssetEntry>) {
    delete_entry(runtime, id);
    {
        let mut runtime = runtime.write().unwrap();
        if !runtime.freed_ids.iter().any(|freed| freed == id) {
            runtime.freed_ids.push(id.to_string());
        }
    }
    let (resident, value) = {
        let entry = entry.read().unwrap();
        (entry.resident, entry.value.clone())
    };
    if !resident {
        return;
    }
    let adapter = registered_disposer(runtime, id);
    if let Some(adapter) = adapter {
        (adapter.dispose)(value.unwrap());
    }
}

pub fn dispose_asset_library(library: &Ref<AssetLibrary>) {
    let runtime = library.read().unwrap().library_runtime.clone();
    let mut after = None;
    loop {
        let next = runtime
            .read()
            .unwrap()
            .entry_order
            .iter()
            .find(|slot| after.is_none_or(|order| slot.order > order))
            .cloned();
        let Some(slot) = next else {
            break;
        };
        after = Some(slot.order);
        let (resident, value) = {
            let entry = slot.entry.read().unwrap();
            (entry.resident, entry.value.clone())
        };
        if !resident {
            continue;
        }
        let adapter = registered_disposer(&runtime, &slot.id);
        if let Some(adapter) = adapter {
            (adapter.dispose)(value.unwrap());
        }
    }
    let mut runtime = runtime.write().unwrap();
    runtime.adapters.clear();
    runtime.adapter_calls.clear();
    runtime.acquire_guard = None;
    runtime.descriptors.clear();
    runtime.entries.clear();
    runtime.entry_order.clear();
    runtime.projections.clear();
    runtime.freed_ids.clear();
    runtime.groups.clear();
}

fn erase_value<T: Send + Sync + 'static>(value: T) -> Unknown {
    let value: Arc<dyn Any + Send + Sync> = Arc::new(value);
    if let Some(value) = value.downcast_ref::<Unknown>() {
        return value.clone();
    }
    return Some(value);
}

pub fn get_asset<T: Clone + 'static>(library: &Ref<AssetLibrary>, id: &str) -> Option<T> {
    let runtime = library.read().unwrap().library_runtime.clone();
    let entry = runtime.read().unwrap().entries.get(id).cloned()?;
    let value = {
        let entry = entry.read().unwrap();
        if !entry.resident {
            return None;
        }
        entry.value.clone().unwrap()
    };
    return Some(restore_value(&value));
}

pub fn get_asset_group_ids(library: &Ref<AssetLibrary>, name: &str) -> Vec<String> {
    let runtime = library.read().unwrap().library_runtime.clone();
    let group = runtime.read().unwrap().groups.get(name).cloned();
    return group
        .map(|group| group.read().unwrap().clone())
        .unwrap_or_default();
}

pub fn get_asset_ids(library: &Ref<AssetLibrary>) -> Vec<String> {
    let runtime = library.read().unwrap().library_runtime.clone();
    return runtime
        .read()
        .unwrap()
        .entry_order
        .iter()
        .map(|slot| slot.id.clone())
        .collect();
}

pub fn get_asset_ref_count(library: &Ref<AssetLibrary>, id: &str) -> usize {
    let runtime = library.read().unwrap().library_runtime.clone();
    let entry = runtime.read().unwrap().entries.get(id).cloned();
    return entry
        .map(|entry| entry.read().unwrap().refcount)
        .unwrap_or(0);
}

fn invoke_acquire_guard(
    library: &Ref<AssetLibrary>,
    runtime: &Ref<AssetLibraryRuntime>,
    id: &str,
    status: AssetLoadStatus,
    r#type: Option<String>,
) {
    let guard = runtime.read().unwrap().acquire_guard.clone();
    if let Some(guard) = guard {
        let explanation = Arc::new(RwLock::new(AssetLoadExplanation {
            id: id.to_string(),
            ref_count: 0,
            status,
            r#type,
        }));
        guard(library, &explanation);
    }
}

fn is_equivalent_asset_descriptor(a: &Ref<AssetDescriptor>, b: &Ref<AssetDescriptor>) -> bool {
    let a = a.read().unwrap().clone();
    let b = b.read().unwrap().clone();
    if a.id != b.id || a.r#type != b.r#type || a.url != b.url {
        return false;
    }
    let a = a.groups.unwrap_or_default();
    let b = b.groups.unwrap_or_default();
    return a.iter().all(|value| b.contains(value)) && b.iter().all(|value| a.contains(value));
}

pub fn load_asset_group(
    library: &Ref<AssetLibrary>,
    name: &str,
    options: Option<&Ref<AssetGroupLoadOptions>>,
) -> SharedFuture<ResourceLoadResult<()>> {
    let prepared = catch_unwind(AssertUnwindSafe(|| {
        prepare_asset_group(library, name, options)
    }));
    match prepared {
        Ok(Some((future, context))) => {
            let future = create_shared_future(Box::pin(async move {
                return AssertUnwindSafe(future)
                    .catch_unwind()
                    .await
                    .unwrap_or_else(|error| Err(unknown_from_panic(error)));
            }));
            let task = future.clone();
            (context.spawn.spawn)(Box::pin(async move {
                let _ = task.await;
            }));
            return future;
        }
        Ok(None) => return create_shared_future(Box::pin(async { Ok(()) })),
        Err(error) => {
            let error = unknown_from_panic(error);
            return create_shared_future(Box::pin(async move { Err(error) }));
        }
    }
}

fn prepare_asset_group(
    library: &Ref<AssetLibrary>,
    name: &str,
    options: Option<&Ref<AssetGroupLoadOptions>>,
) -> Option<(ResourceLoadFuture<()>, ResourceLoaderContext)> {
    let runtime = library.read().unwrap().library_runtime.clone();
    let ids = runtime.read().unwrap().groups.get(name).cloned()?;
    if ids.read().unwrap().is_empty() {
        return None;
    }
    let context = runtime.read().unwrap().context.clone().unwrap();
    let loader = create_resource_loader(None, &context);
    let progress = options.and_then(|options| options.read().unwrap().progress.clone());
    if let Some(progress) = progress {
        let current = loader.clone();
        let signal = loader.read().unwrap().on_progress.clone();
        connect_signal(
            &signal,
            Arc::new(move |_| {
                let counts = get_resource_load_counts(&current);
                let value = Arc::new(RwLock::new(AssetLoadProgress {
                    loaded: counts.settled_items,
                    total: counts.total_items,
                }));
                let signal = progress.read().unwrap().clone();
                emit_signal(&signal, &value);
            }),
            None,
        );
    }
    let mut promises = Vec::new();
    let mut index = 0;
    loop {
        let id = ids.read().unwrap().get(index).cloned();
        let Some(id) = id else {
            break;
        };
        index += 1;
        let entry = runtime.read().unwrap().entries.get(&id).cloned();
        if entry.is_some_and(|entry| entry.read().unwrap().resident) {
            promises.push(acquire_asset::<Unknown>(library, &id));
            continue;
        }
        let current = library.clone();
        let handle = queue_resource_load(
            &loader,
            ResourceLoadInput::Thunk(ResourceLoadThunk {
                load: Arc::new(move || {
                    let future = acquire_asset::<Unknown>(&current, &id);
                    return Box::pin(future);
                }),
            }),
        );
        promises.push(handle.read().unwrap().promise.clone());
    }
    // Install every settlement observer before starting factories, preserving allSettled ordering.
    let settlements = create_shared_future(Box::pin(futures::future::join_all(promises)));
    let observed = settlements.clone();
    (context.spawn.spawn)(Box::pin(async move {
        let _ = observed.await;
    }));
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let signal = loader.read().unwrap().on_complete.clone();
    connect_signal(
        &signal,
        Arc::new(move |_| {
            let sender = sender.lock().unwrap().take();
            if let Some(sender) = sender {
                let _ = sender.send(());
            }
        }),
        None,
    );
    start_resource_load(&loader);
    let future = Box::pin(async move {
        yield_promise_turn().await;
        if receiver.await.is_err() {
            std::future::pending::<()>().await;
        }
        let results = settlements.await;
        dispose_resource_loader(&loader);
        for result in results {
            if let Err(error) = result {
                return Err(error);
            }
        }
        return Ok(());
    });
    return Some((future, context));
}

fn project_promise<T: Clone + Send + Sync + 'static>(
    runtime: &Ref<AssetLibraryRuntime>,
    entry: &Ref<AssetEntry>,
    promise: SharedFuture<ResourceLoadResult<Unknown>>,
) -> SharedFuture<ResourceLoadResult<T>> {
    let same: &dyn Any = &promise;
    if let Some(promise) = same.downcast_ref::<SharedFuture<ResourceLoadResult<T>>>() {
        return promise.clone();
    }
    let cached = runtime
        .read()
        .unwrap()
        .projections
        .iter()
        .find(|projection| {
            projection.type_id == TypeId::of::<T>()
                && projection
                    .entry
                    .upgrade()
                    .is_some_and(|current| Arc::ptr_eq(&current, entry))
        })
        .map(|projection| projection.promise.clone());
    if let Some(Some(cached)) = cached {
        return cached
            .downcast_ref::<SharedFuture<ResourceLoadResult<T>>>()
            .unwrap()
            .clone();
    }
    let promise = create_shared_future(Box::pin(async move {
        return promise.await.map(|value| restore_value::<T>(&value));
    }));
    runtime
        .write()
        .unwrap()
        .projections
        .push(PromiseProjection {
            entry: Arc::downgrade(entry),
            type_id: TypeId::of::<T>(),
            promise: Some(Arc::new(promise.clone())),
        });
    return promise;
}

pub fn register_asset_descriptor(library: &Ref<AssetLibrary>, descriptor: &Ref<AssetDescriptor>) {
    let runtime = library.read().unwrap().library_runtime.clone();
    let id = descriptor.read().unwrap().id.clone();
    let (previous, acquired) = {
        let runtime = runtime.read().unwrap();
        (
            runtime.descriptors.get(&id).cloned(),
            runtime.entries.contains_key(&id),
        )
    };
    if let Some(previous) = &previous {
        if acquired {
            if is_equivalent_asset_descriptor(previous, descriptor) {
                return;
            }
            throw_error(&format!(
                "assets: cannot replace acquired descriptor \"{id}\" (releaseAsset first)"
            ));
        }
        remove_asset_descriptor_groups(&runtime, previous);
        if !is_equivalent_asset_descriptor(previous, descriptor) {
            runtime
                .write()
                .unwrap()
                .freed_ids
                .retain(|freed| freed != &id);
        }
    }
    let stored = copy_asset_descriptor(descriptor);
    let group_names = stored.read().unwrap().groups.clone();
    runtime
        .write()
        .unwrap()
        .descriptors
        .insert(id.clone(), stored);
    if let Some(group_names) = group_names {
        for group in group_names {
            let members = runtime
                .write()
                .unwrap()
                .groups
                .entry(group)
                .or_insert_with(|| Arc::new(RwLock::new(Vec::new())))
                .clone();
            let mut members = members.write().unwrap();
            if !members.contains(&id) {
                members.push(id.clone());
            }
        }
    }
}

// flight-lint: allow(contract-vocabulary) Approved native same-T erasure preserves actual generic adapter/value identities with canonical Unknown storage
pub fn register_asset_loader<T: Clone + Send + Sync + 'static>(
    library: &Ref<AssetLibrary>,
    r#type: &str,
    adapter: &Ref<AssetLoaderAdapter<T>>,
) {
    let original = adapter.clone();
    let load = Arc::new(move |descriptor: &Ref<AssetDescriptor>| {
        let load = original.read().unwrap().load.clone();
        let future = load(descriptor);
        return Box::pin(async move {
            return future.await.map(erase_value);
        }) as flight_loader::ResourceLoadFuture<Unknown>;
    });
    let original = adapter.clone();
    let dispose = Arc::new(move |value: Unknown| {
        let value = restore_value::<T>(&value);
        let dispose = original.read().unwrap().dispose.clone();
        dispose(value);
    });
    let runtime = library.read().unwrap().library_runtime.clone();
    let mut runtime = runtime.write().unwrap();
    runtime
        .adapters
        .insert(r#type.to_string(), Some(Arc::new(adapter.clone())));
    runtime
        .adapter_calls
        .insert(r#type.to_string(), AdapterCalls { load, dispose });
}

pub fn register_asset_manifest(library: &Ref<AssetLibrary>, manifest: &AssetManifest) {
    let mut manifest_values: Vec<(String, Ref<AssetDescriptor>)> = Vec::new();
    for descriptor in manifest {
        let id = descriptor.read().unwrap().id.clone();
        if let Some((_, stored)) = manifest_values.iter_mut().find(|(key, _)| key == &id) {
            *stored = descriptor.clone();
        } else {
            manifest_values.push((id, descriptor.clone()));
        }
    }
    let runtime = library.read().unwrap().library_runtime.clone();
    for (id, descriptor) in &manifest_values {
        let (previous, acquired) = {
            let runtime = runtime.read().unwrap();
            (
                runtime.descriptors.get(id).cloned(),
                runtime.entries.contains_key(id),
            )
        };
        if let Some(previous) = previous {
            if acquired && !is_equivalent_asset_descriptor(&previous, descriptor) {
                throw_error(&format!(
                    "assets: cannot replace acquired descriptor \"{id}\" (releaseAsset first)"
                ));
            }
        }
    }
    for (_, descriptor) in manifest_values {
        register_asset_descriptor(library, &descriptor);
    }
}

fn registered_disposer(runtime: &Ref<AssetLibraryRuntime>, id: &str) -> Option<AdapterCalls> {
    let descriptor = runtime.read().unwrap().descriptors.get(id).cloned()?;
    let key = descriptor.read().unwrap().r#type.clone();
    return runtime.read().unwrap().adapter_calls.get(&key).cloned();
}

fn rejected_promise<T: Clone + Send + 'static>(
    message: &str,
) -> SharedFuture<ResourceLoadResult<T>> {
    let error: Unknown = Some(Arc::new(FlightError {
        kind: FlightErrorKind::Error,
        message: message.to_string(),
    }));
    return create_shared_future(Box::pin(async move { Err(error) }));
}

pub fn release_asset(library: &Ref<AssetLibrary>, id: &str) {
    let runtime = library.read().unwrap().library_runtime.clone();
    let entry = runtime.read().unwrap().entries.get(id).cloned();
    let Some(entry) = entry else {
        return;
    };
    {
        let mut entry = entry.write().unwrap();
        entry.refcount -= 1;
        if entry.refcount > 0 {
            return;
        }
    }
    dispose_asset_entry(&runtime, id, &entry);
}

pub fn release_asset_group(library: &Ref<AssetLibrary>, name: &str) {
    let runtime = library.read().unwrap().library_runtime.clone();
    let ids = runtime.read().unwrap().groups.get(name).cloned();
    let Some(ids) = ids else {
        return;
    };
    let mut index = 0;
    loop {
        let id = ids.read().unwrap().get(index).cloned();
        let Some(id) = id else {
            return;
        };
        index += 1;
        release_asset(library, &id);
    }
}

fn remove_asset_descriptor_groups(
    runtime: &Ref<AssetLibraryRuntime>,
    descriptor: &Ref<AssetDescriptor>,
) {
    let descriptor = descriptor.read().unwrap().clone();
    if let Some(group_names) = descriptor.groups {
        for group in group_names {
            let members = runtime.read().unwrap().groups.get(&group).cloned();
            let Some(members) = members else {
                continue;
            };
            let mut members = members.write().unwrap();
            if let Some(index) = members.iter().position(|id| id == &descriptor.id) {
                members.remove(index);
            }
            if members.is_empty() {
                runtime.write().unwrap().groups.remove(&group);
            }
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
    throw_type_error("Asset value does not match its native type");
}

pub fn set_asset_acquire_guard(library: &Ref<AssetLibrary>, guard: Option<AssetAcquireGuard>) {
    let runtime = library.read().unwrap().library_runtime.clone();
    runtime.write().unwrap().acquire_guard = guard;
}

async fn yield_promise_turn() {
    let mut yielded = false;
    futures::future::poll_fn(move |context| {
        if yielded {
            return Poll::Ready(());
        }
        yielded = true;
        context.waker().wake_by_ref();
        return Poll::Pending;
    })
    .await;
}
