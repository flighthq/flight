use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_image::HostImageCapability;
use flight_loader::{
    ResourceLoaderOptions, cancel_resource_load, create_resource_loader, dispose_resource_loader,
    start_resource_load,
};
use flight_stream::abort_controller;

use crate::image_resource_fetch::create_web_image_resource_fetch;
use crate::scene_material_texture_registry::{
    create_scene3d_material_texture_registry, register_extended_pbr_scene3d_material_textures,
    register_standard_pbr_scene3d_material_textures, register_unlit_scene3d_material_textures,
};
use crate::types::*;

/// Explicit preconfigured assembly for the common Standard PBR + Unlit path. The primitive
/// constructor stays empty, so creating it never pulls material families into a custom lane.
// flight-lint: allow(conform-params) D5 explicit resolver context (loader spawn/timers, image resolver state) replaces ambient Promise execution and the image module global
pub fn create_built_in_scene3d_resource_resolver(
    host_image: &HostImageCapability,
    options: Option<&Scene3DResourceResolverOptions>,
    context: &Scene3DResourceResolverContext,
) -> Ref<Scene3DResourceResolver> {
    let resolver = create_scene3d_resource_resolver(host_image, options, context);
    let registry = resolver.read().unwrap().registry.clone();
    register_standard_pbr_scene3d_material_textures(&registry);
    register_unlit_scene3d_material_textures(&registry);
    register_extended_pbr_scene3d_material_textures(&registry);
    return resolver;
}

// D23 KEEP: construction derives a started streaming loader and the default fetch from the host
// image capability; the options are the source's configuration record.
// flight-lint: allow(conform-params) D5 explicit resolver context (loader spawn/timers, image resolver state) replaces ambient Promise execution and the image module global
pub fn create_scene3d_resource_resolver(
    host_image: &HostImageCapability,
    options: Option<&Scene3DResourceResolverOptions>,
    context: &Scene3DResourceResolverContext,
) -> Ref<Scene3DResourceResolver> {
    let mut out: Scene3DResourceResolver = allocate_entity();
    initialize_scene3d_resource_resolver(&mut out, host_image, options, context);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D5 explicit resolver context (loader spawn/timers, image resolver state) replaces ambient Promise execution and the image module global
pub fn initialize_scene3d_resource_resolver(
    out: &mut Scene3DResourceResolver,
    host_image: &HostImageCapability,
    options: Option<&Scene3DResourceResolverOptions>,
    context: &Scene3DResourceResolverContext,
) {
    let loader_options = ResourceLoaderOptions {
        dedupe: Some(false),
        max_concurrent: options.and_then(|options| options.max_concurrent),
        streaming: Some(true),
        ..ResourceLoaderOptions::default()
    };
    let loader = create_resource_loader(
        Some(&Arc::new(RwLock::new(loader_options))),
        &context.loader,
    );
    start_resource_load(&loader);
    out.fetch = options
        .and_then(|options| options.fetch.clone())
        .unwrap_or_else(|| create_web_image_resource_fetch(host_image));
    out.image_decode = options.and_then(|options| options.image_decode.clone());
    out.registry = options
        .and_then(|options| options.registry.clone())
        .unwrap_or_else(create_scene3d_material_texture_registry);
    out.state = Arc::new(RwLock::new(Scene3DResourceResolverRuntime {
        context: Some(context.clone()),
        failure_attempt: 0,
        failure_guard: None,
        in_flight: Vec::new(),
        loader,
        resolved: HashMap::new(),
        signals: None,
    }));
}

/// Releases the resolver: cancels and disposes the loader, aborts every in-flight controller, and
/// clears the in-flight and settled tables. No native resource is held, so dispose, not destroy.
pub fn dispose_scene3d_resource_resolver(resolver: &Ref<Scene3DResourceResolver>) {
    let state = resolver.read().unwrap().state.clone();
    let loader = state.read().unwrap().loader.clone();
    cancel_resource_load(&loader);
    dispose_resource_loader(&loader);
    let in_flight = std::mem::take(&mut state.write().unwrap().in_flight);
    for (_, entry) in in_flight {
        abort_controller(&entry.read().unwrap().controller, None);
    }
    state.write().unwrap().resolved.clear();
}

/// The resolver's private runtime, the TS value under `Scene3DResourceResolverRuntimeKey`.
// flight-lint: allow(conform-extra) D12 native accessor for the symbol-keyed private runtime the source reads as resolver[Scene3DResourceResolverRuntimeKey]
pub fn get_scene3d_resource_resolver_runtime(
    resolver: &Ref<Scene3DResourceResolver>,
) -> Ref<Scene3DResourceResolverRuntime> {
    return resolver.read().unwrap().state.clone();
}
