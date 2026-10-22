use std::collections::HashMap;
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, Unknown, allocate_entity, throw_type_error, unknown_from_panic};
use flight_image::{
    ImageResourceFailure, ImageResourceFailureKind, ImageResourceReference,
    create_image_resource_failure, resolve_image_resource_reference,
};
use flight_image_codec::HostImageDecodeCapabilities;
use flight_loader::{ResourceLoadInput, ResourceLoadItem, ResourceLoadResult, queue_resource_load};
use flight_resource::ResourceResolutionState;
use flight_scene3d::Scene3D;
use flight_signals::emit_signal;
use flight_stream::{
    AbortSignal, abort_controller, add_abort_listener, create_abort_controller,
    create_shared_future, get_abort_signal_reason, is_abort_signal_aborted,
};
use flight_texture::{Texture, TextureSourceRef, set_texture_source};
use futures::FutureExt;
use futures::channel::oneshot;

use crate::get_scene3d_resource_textures::{
    get_image_resource_reference_identity, get_scene3d_resource_textures,
    get_scene3d_texture_resource_reference, is_same_image_resource_reference,
};
use crate::types::*;

type Scene3DResourceWorkingMap = Vec<(ImageResourceReference, Vec<Ref<Texture>>)>;

pub fn initialize_image_resource_failure(
    out: &mut ImageResourceFailure,
    kind: ImageResourceFailureKind,
    message: String,
    name: Option<String>,
) {
    out.kind = kind;
    out.message = message;
    out.name = name;
}

fn add_scene3d_resource_subscriber(
    working: &mut Scene3DResourceWorkingMap,
    index: &mut HashMap<usize, usize>,
    reference: &ImageResourceReference,
    texture: &Ref<Texture>,
) {
    let key = get_image_resource_reference_identity(reference);
    let slot = *index.entry(key).or_insert_with(|| {
        working.push((reference.clone(), Vec::new()));
        working.len() - 1
    });
    working[slot].1.push(texture.clone());
}

fn bind_resolved_scene3d_resource(
    resolver: &Ref<Scene3DResourceResolver>,
    texture: &Ref<Texture>,
    reference: &ImageResourceReference,
    source: &TextureSourceRef,
) {
    {
        let mut guard = texture.write().unwrap();
        let Texture::Texture2D(texture_2d) = &*guard else {
            return;
        };
        if texture_2d
            .source
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, source))
        {
            return;
        }
        set_texture_source(&mut *guard, Some(source.clone()));
    }
    emit_scene3d_resource_event(resolver, texture, reference, true);
}

fn cancel_dropped_resolutions(
    resolver: &Ref<Scene3DResourceResolver>,
    working: &Scene3DResourceWorkingMap,
) {
    let state = resolver.read().unwrap().state.clone();
    let mut dropped = Vec::new();
    {
        let mut runtime = state.write().unwrap();
        runtime.in_flight.retain(|(reference, entry)| {
            let subscribers = working
                .iter()
                .find(|(candidate, _)| is_same_image_resource_reference(candidate, reference))
                .map(|(_, subscribers)| subscribers);
            if let Some(subscribers) = subscribers
                && !subscribers.is_empty()
            {
                entry.write().unwrap().subscribers = subscribers.clone();
                return true;
            }
            dropped.push((reference.clone(), entry.clone()));
            return false;
        });
    }
    for (reference, entry) in dropped {
        abort_controller(&entry.read().unwrap().controller, None);
        // A resource with no remaining subscribers reverts to Unresolved so a later pass re-requests it.
        if get_image_resource_reference_state(&reference) == ResourceResolutionState::Loading {
            set_image_resource_reference_state(&reference, ResourceResolutionState::Unresolved);
        }
    }
}

fn emit_scene3d_resource_event(
    resolver: &Ref<Scene3DResourceResolver>,
    texture: &Ref<Texture>,
    reference: &ImageResourceReference,
    resolved: bool,
) {
    let state = resolver.read().unwrap().state.clone();
    let Some(signals) = state.read().unwrap().signals.clone() else {
        return;
    };
    let signal = {
        let signals = signals.read().unwrap();
        if resolved {
            signals.on_resource_resolved.clone()
        } else {
            signals.on_resource_failed.clone()
        }
    };
    let event = Scene3DResourceEvent {
        reference: reference.clone(),
        texture: texture.clone(),
    };
    emit_signal(&signal, &event);
}

fn fail_scene3d_resource_resolution(
    resolver: &Ref<Scene3DResourceResolver>,
    reference: &ImageResourceReference,
    entry: &Ref<Scene3DResourceInFlight>,
    cause: &Unknown,
) {
    if !take_scene3d_resource_in_flight(resolver, reference, entry) {
        return;
    }
    let (aborted, subscribers) = {
        let entry = entry.read().unwrap();
        (
            is_abort_signal_aborted(&entry.controller.signal),
            entry.subscribers.clone(),
        )
    };
    // An abort is a cancel, not a failure: the reference was already reverted when it was dropped.
    if aborted {
        return;
    }
    set_image_resource_reference_resolution(
        reference,
        Some(create_image_resource_failure(cause)),
        ResourceResolutionState::Failed,
    );
    for texture in &subscribers {
        emit_scene3d_resource_event(resolver, texture, reference, false);
    }
}

fn finish_scene3d_resource_resolution(
    resolver: &Ref<Scene3DResourceResolver>,
    reference: &ImageResourceReference,
    entry: &Ref<Scene3DResourceInFlight>,
    source: Option<TextureSourceRef>,
) {
    // Ignore a late settle whose entry was already cancelled or replaced by a newer request.
    if !take_scene3d_resource_in_flight(resolver, reference, entry) {
        return;
    }
    let subscribers = entry.read().unwrap().subscribers.clone();
    let Some(source) = source else {
        let failure = get_image_resource_reference_failure(reference).unwrap_or_else(|| {
            let mut out: ImageResourceFailure = allocate_entity();
            initialize_image_resource_failure(
                &mut out,
                ImageResourceFailureKind::Unavailable,
                "Image resource resolution returned no source".to_string(),
                None,
            );
            Arc::new(RwLock::new(out))
        });
        set_image_resource_reference_resolution(
            reference,
            Some(failure),
            ResourceResolutionState::Failed,
        );
        for texture in &subscribers {
            emit_scene3d_resource_event(resolver, texture, reference, false);
        }
        return;
    };
    let state = resolver.read().unwrap().state.clone();
    state.write().unwrap().resolved.insert(
        get_image_resource_reference_identity(reference),
        (reference.clone(), source.clone()),
    );
    set_image_resource_reference_resolution(reference, None, ResourceResolutionState::Resolved);
    for texture in &subscribers {
        bind_resolved_scene3d_resource(resolver, texture, reference, &source);
    }
}

pub(crate) fn get_image_resource_reference_failure(
    reference: &ImageResourceReference,
) -> Option<Ref<ImageResourceFailure>> {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().failure.clone(),
        ImageResourceReference::External(value) => value.reference.read().unwrap().failure.clone(),
    };
}

pub(crate) fn get_image_resource_reference_state(
    reference: &ImageResourceReference,
) -> ResourceResolutionState {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        ImageResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

fn get_resolved_scene3d_resource_source(
    state: &Ref<Scene3DResourceResolverRuntime>,
    reference: &ImageResourceReference,
) -> Option<TextureSourceRef> {
    return state
        .read()
        .unwrap()
        .resolved
        .get(&get_image_resource_reference_identity(reference))
        .map(|(_, source)| source.clone());
}

fn get_texture_2d_source(texture: &Ref<Texture>) -> Option<TextureSourceRef> {
    return match &*texture.read().unwrap() {
        Texture::Texture2D(texture) => texture.source.clone(),
        _ => None,
    };
}

fn request_working_resolutions(
    resolver: &Ref<Scene3DResourceResolver>,
    working: &Scene3DResourceWorkingMap,
    options: Option<&UpdateScene3DResourceStreamingOptions>,
) {
    let state = resolver.read().unwrap().state.clone();
    for (reference, subscribers) in working {
        if let Some(resolved) = get_resolved_scene3d_resource_source(&state, reference) {
            set_image_resource_reference_resolution(
                reference,
                None,
                ResourceResolutionState::Resolved,
            );
            for texture in subscribers {
                bind_resolved_scene3d_resource(resolver, texture, reference, &resolved);
            }
            continue;
        }
        let in_flight = state
            .read()
            .unwrap()
            .in_flight
            .iter()
            .any(|(candidate, _)| is_same_image_resource_reference(candidate, reference));
        if in_flight {
            continue;
        }
        if get_image_resource_reference_state(reference) == ResourceResolutionState::Resolved {
            set_image_resource_reference_state(reference, ResourceResolutionState::Unresolved);
        }
        if get_image_resource_reference_state(reference) != ResourceResolutionState::Unresolved {
            continue;
        }
        set_image_resource_reference_resolution(reference, None, ResourceResolutionState::Loading);
        let mut priority = 0.0;
        if let Some(rank) = options.and_then(|options| options.priority.as_ref()) {
            priority = f32::NEG_INFINITY;
            for texture in subscribers {
                priority = priority.max(rank(texture, reference));
            }
        }
        start_scene3d_resource_resolution(resolver, reference, subscribers, priority);
    }
}

/// Resolves one reference to a texture source, or `None` for an expected failure: embedded bytes
/// decode through the image atom, external URIs go through the resolver's fetch seam. Cancellation
/// is carried by `signal`.
// flight-lint: allow(conform-params) Rust reserves the TS parameter name `ref`; `reference` is the exact semantic rename
pub async fn resolve_one_scene3d_resource_texture(
    resolver: &Ref<Scene3DResourceResolver>,
    reference: &ImageResourceReference,
    signal: &AbortSignal,
) -> Option<TextureSourceRef> {
    let (fetch, image_decode, image_resolver) = {
        let resolver = resolver.read().unwrap();
        let state = resolver.state.read().unwrap();
        let context = state
            .context
            .as_ref()
            .unwrap_or_else(|| throw_type_error("Scene3D resource resolver is not initialized"));
        (
            resolver.fetch.clone(),
            resolver.image_decode.clone(),
            context.image_resolver.read().unwrap().clone(),
        )
    };
    let image_decode =
        image_decode.unwrap_or_else(|| Arc::new(HostImageDecodeCapabilities::default()));
    return resolve_image_resource_reference(
        &image_decode,
        reference,
        &fetch,
        signal,
        None,
        &image_resolver,
    )
    .await;
}

/// Reconciles the selected working set synchronously: groups shared references, recognizes content
/// already present on a texture, and binds resolver-cached sources to every selected subscriber.
/// Acquisition, cancellation and priority policy belong to the explicit update and load operations.
pub fn resolve_scene3d_resources(
    scene: &Ref<Scene3D>,
    resolver: &Ref<Scene3DResourceResolver>,
    options: Option<&ResolveScene3DResourcesOptions>,
) -> Scene3DResources {
    let state = resolver.read().unwrap().state.clone();
    let mut textures = Vec::new();
    let mut working: Scene3DResourceWorkingMap = Vec::new();
    let mut working_index: HashMap<usize, usize> = HashMap::new();
    {
        let scene = scene.read().unwrap();
        get_scene3d_resource_textures(&mut textures, &scene);
        for texture in &textures {
            let Some(reference) = get_scene3d_texture_resource_reference(&scene, texture) else {
                continue;
            };
            if let Some(source) = get_texture_2d_source(texture) {
                state.write().unwrap().resolved.insert(
                    get_image_resource_reference_identity(&reference),
                    (reference.clone(), source),
                );
                set_image_resource_reference_resolution(
                    &reference,
                    None,
                    ResourceResolutionState::Resolved,
                );
            }
            let selected = options
                .and_then(|options| options.select.as_ref())
                .is_none_or(|select| select(texture, &reference));
            if !selected {
                continue;
            }
            add_scene3d_resource_subscriber(&mut working, &mut working_index, &reference, texture);
        }
    }
    let mut resolved = Vec::new();
    let mut unresolved = Vec::new();
    for (reference, subscribers) in working {
        let source = get_resolved_scene3d_resource_source(&state, &reference);
        let Some(source) = source else {
            if get_image_resource_reference_state(&reference) == ResourceResolutionState::Resolved {
                set_image_resource_reference_state(&reference, ResourceResolutionState::Unresolved);
            }
            unresolved.push(Scene3DResourceWorkingSet {
                reference,
                textures: subscribers,
            });
            continue;
        };
        set_image_resource_reference_resolution(
            &reference,
            None,
            ResourceResolutionState::Resolved,
        );
        for texture in &subscribers {
            bind_resolved_scene3d_resource(resolver, texture, &reference, &source);
        }
        resolved.push(Scene3DResourceResolution {
            reference,
            source,
            textures: subscribers,
        });
    }
    return Scene3DResources {
        resolved,
        scene: scene.clone(),
        unresolved,
    };
}

fn set_image_resource_reference_resolution(
    reference: &ImageResourceReference,
    failure: Option<Ref<ImageResourceFailure>>,
    state: ResourceResolutionState,
) {
    match reference {
        ImageResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = failure;
            reference.state = state;
        }
        ImageResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = failure;
            reference.state = state;
        }
    }
}

fn set_image_resource_reference_state(
    reference: &ImageResourceReference,
    state: ResourceResolutionState,
) {
    match reference {
        ImageResourceReference::Embedded(value) => value.reference.write().unwrap().state = state,
        ImageResourceReference::External(value) => value.reference.write().unwrap().state = state,
    }
}

fn set_scene3d_resource_working_group(
    working: &mut Scene3DResourceWorkingMap,
    reference: &ImageResourceReference,
    textures: &[Ref<Texture>],
) {
    if let Some(slot) = working
        .iter_mut()
        .find(|(candidate, _)| is_same_image_resource_reference(candidate, reference))
    {
        slot.1 = textures.to_vec();
        return;
    }
    working.push((reference.clone(), textures.to_vec()));
}

fn start_scene3d_resource_resolution(
    resolver: &Ref<Scene3DResourceResolver>,
    reference: &ImageResourceReference,
    subscribers: &[Ref<Texture>],
    priority: f32,
) {
    let state = resolver.read().unwrap().state.clone();
    let (loader, spawn) = {
        let runtime = state.read().unwrap();
        let context = runtime
            .context
            .as_ref()
            .unwrap_or_else(|| throw_type_error("Scene3D resource resolver is not initialized"));
        (runtime.loader.clone(), context.loader.spawn.clone())
    };
    let controller = create_abort_controller();
    let signal = controller.signal.clone();
    let (settled, on_settled) = oneshot::channel::<()>();
    let entry = Arc::new(RwLock::new(Scene3DResourceInFlight {
        controller,
        promise: create_shared_future(Box::pin(async move {
            let _ = on_settled.await;
        })),
        subscribers: subscribers.to_vec(),
    }));
    let load_resolver = resolver.clone();
    let load_reference = reference.clone();
    let load_entry = entry.clone();
    let handle = queue_resource_load::<Option<TextureSourceRef>>(
        &loader,
        ResourceLoadInput::Item(ResourceLoadItem {
            bytes_hint: None,
            group: None,
            key: None,
            load: Arc::new(move |loader_signal, _report_bytes| {
                // Wire the loader's own cancellation (dispose/cancel) into this request's controller.
                let controller_entry = load_entry.clone();
                let forward_signal = loader_signal.clone();
                if is_abort_signal_aborted(&loader_signal) {
                    abort_controller(
                        &controller_entry.read().unwrap().controller,
                        get_abort_signal_reason(&loader_signal),
                    );
                } else {
                    add_abort_listener(
                        &loader_signal,
                        Arc::new(move || {
                            abort_controller(
                                &controller_entry.read().unwrap().controller,
                                get_abort_signal_reason(&forward_signal),
                            );
                        }),
                    );
                }
                let resolver = load_resolver.clone();
                let reference = load_reference.clone();
                let signal = signal.clone();
                Box::pin(async move {
                    let result = AssertUnwindSafe(resolve_one_scene3d_resource_texture(
                        &resolver, &reference, &signal,
                    ))
                    .catch_unwind()
                    .await;
                    return result.map_err(unknown_from_panic);
                })
            }),
            on_bytes_progress: None,
            priority: Some(priority),
            retries: None,
            timeout_ms: None,
            weight: None,
        }),
    );
    let promise = handle.read().unwrap().promise.clone();
    state
        .write()
        .unwrap()
        .in_flight
        .push((reference.clone(), entry.clone()));
    let settle_resolver = resolver.clone();
    let settle_reference = reference.clone();
    (spawn.spawn)(Box::pin(async move {
        let result: ResourceLoadResult<Option<TextureSourceRef>> = promise.await;
        // The source's `promise.then(...)` settles in a later microtask, never inside the
        // synchronous pass that queued it, even when the load is already complete.
        yield_to_host().await;
        match result {
            Ok(source) => finish_scene3d_resource_resolution(
                &settle_resolver,
                &settle_reference,
                &entry,
                source,
            ),
            Err(cause) => fail_scene3d_resource_resolution(
                &settle_resolver,
                &settle_reference,
                &entry,
                &cause,
            ),
        }
        let _ = settled.send(());
    }));
}

fn take_scene3d_resource_in_flight(
    resolver: &Ref<Scene3DResourceResolver>,
    reference: &ImageResourceReference,
    entry: &Ref<Scene3DResourceInFlight>,
) -> bool {
    let state = resolver.read().unwrap().state.clone();
    let mut runtime = state.write().unwrap();
    let Some(index) = runtime
        .in_flight
        .iter()
        .position(|(candidate, _)| is_same_image_resource_reference(candidate, reference))
    else {
        return false;
    };
    if !Arc::ptr_eq(&runtime.in_flight[index].1, entry) {
        return false;
    }
    runtime.in_flight.remove(index);
    return true;
}

/// Explicit progressive pass. Repeated calls reconcile the resolver's in-flight state with the
/// current selection and priority; disposal remains the cancellation boundary of the resolver.
pub fn update_scene3d_resource_streaming(
    scene: &Ref<Scene3D>,
    resolver: &Ref<Scene3DResourceResolver>,
    options: Option<&UpdateScene3DResourceStreamingOptions>,
) -> Scene3DResources {
    let resolve_options = ResolveScene3DResourcesOptions {
        select: options.and_then(|options| options.select.clone()),
    };
    let resources = resolve_scene3d_resources(scene, resolver, Some(&resolve_options));
    let mut working: Scene3DResourceWorkingMap = Vec::new();
    let Scene3DResources {
        resolved: ready_groups,
        unresolved: pending_groups,
        ..
    } = &resources;
    for group in ready_groups {
        set_scene3d_resource_working_group(&mut working, &group.reference, &group.textures);
    }
    for group in pending_groups {
        set_scene3d_resource_working_group(&mut working, &group.reference, &group.textures);
    }
    cancel_dropped_resolutions(resolver, &working);
    request_working_resolutions(resolver, &working, options);
    return resources;
}

// Completes on its second poll, after waking its task: one microtask turn on the driving host.
async fn yield_to_host() {
    let mut yielded = false;
    std::future::poll_fn(|context| {
        if yielded {
            return std::task::Poll::Ready(());
        }
        yielded = true;
        context.waker().wake_by_ref();
        return std::task::Poll::Pending;
    })
    .await;
}
