use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_entity::Ref;
use flight_resource::ResourceResolutionState;
use flight_scene3d::Scene3D;
use flight_signals::emit_signal;
use futures::future::join_all;

use crate::get_scene3d_resource_textures::is_same_image_resource_reference;
use crate::resolve_scene3d_resources::{
    get_image_resource_reference_state, update_scene3d_resource_streaming,
};
use crate::types::*;

/// Eager, deterministic load: reconciles the selected working set, starts its acquisitions, then
/// awaits every in-flight load it started, so each reference has settled to Resolved or Failed on
/// return. Progressive callers use `update_scene3d_resource_streaming` instead.
pub async fn load_scene3d_resources(
    scene: &Ref<Scene3D>,
    resolver: &Ref<Scene3DResourceResolver>,
    options: Option<&LoadScene3DResourcesOptions>,
) {
    let streaming = UpdateScene3DResourceStreamingOptions {
        priority: options.and_then(|options| options.priority.clone()),
        select: options.and_then(|options| options.select.clone()),
    };
    let resources = update_scene3d_resource_streaming(scene, resolver, Some(&streaming));
    let mut references = Vec::new();
    let Scene3DResources {
        resolved: ready_groups,
        unresolved: pending_groups,
        ..
    } = &resources;
    let groups = ready_groups
        .iter()
        .map(|group| &group.reference)
        .chain(pending_groups.iter().map(|group| &group.reference));
    for reference in groups {
        if !references
            .iter()
            .any(|candidate| is_same_image_resource_reference(candidate, reference))
        {
            references.push(reference.clone());
        }
    }
    let state = resolver.read().unwrap().state.clone();
    let total = references.len();
    let loaded = Arc::new(AtomicUsize::new(0));
    let progress = options.and_then(|options| options.progress.clone());
    let mut pending = Vec::new();
    for reference in &references {
        let resolution = get_image_resource_reference_state(reference);
        if resolution == ResourceResolutionState::Resolved
            || resolution == ResourceResolutionState::Failed
        {
            loaded.fetch_add(1, Ordering::SeqCst);
            continue;
        }
        let entry = state
            .read()
            .unwrap()
            .in_flight
            .iter()
            .find(|(candidate, _)| is_same_image_resource_reference(candidate, reference))
            .map(|(_, entry)| entry.clone());
        let Some(entry) = entry else {
            continue;
        };
        let promise = entry.read().unwrap().promise.clone();
        let loaded = loaded.clone();
        let progress = progress.clone();
        pending.push(async move {
            promise.await;
            let count = loaded.fetch_add(1, Ordering::SeqCst) + 1;
            if let Some(progress) = &progress {
                emit_signal(progress, &Scene3DResourceLoadProgress { loaded: count, total });
            }
        });
    }
    if let Some(progress) = &progress {
        emit_signal(
            progress,
            &Scene3DResourceLoadProgress {
                loaded: loaded.load(Ordering::SeqCst),
                total,
            },
        );
    }
    join_all(pending).await;
}

/// Waits for the loads pending at call time without exposing the resolver's private request records.
/// Work queued after the snapshot belongs to the caller's next bracket.
pub async fn wait_for_scene3d_resource_resolver(resolver: &Ref<Scene3DResourceResolver>) {
    let state = resolver.read().unwrap().state.clone();
    let promises: Vec<_> = state
        .read()
        .unwrap()
        .in_flight
        .iter()
        .map(|(_, entry)| entry.read().unwrap().promise.clone())
        .collect();
    join_all(promises).await;
}
