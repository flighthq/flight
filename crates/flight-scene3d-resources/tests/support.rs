use std::future::Future;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_image::contract::*;
use flight_loader::ResourceLoaderContext;
use flight_materials::Material3D;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::{NodeRef, add_node_child};
use flight_resource::ResourceResolutionState;
use flight_scene3d::{Mesh, Scene3D, create_mesh, create_scene3d};
use flight_scene3d_resources::contract::*;
use flight_texture::{Texture, TextureSourceRef, create_texture, get_texture_source};

use flight_entity::throw_error;
use flight_stream::{AbortSignal, add_abort_listener, is_abort_signal_aborted, throw_if_aborted};
use futures::channel::oneshot;

use crate::mock_host::MockHost;

/// What one call to a controlled fetch does.
pub(crate) enum FetchOutcome {
    HangUntilAbort,
    Image(Ref<ImageResource>),
    Miss,
    Never,
    Panic(&'static str),
}

pub(crate) type FetchCalls = Arc<Mutex<Vec<AbortSignal>>>;

/// A caller fetch seam that records each request's signal and answers by call index.
pub(crate) fn controlled_fetch(
    outcome: Arc<dyn Fn(usize) -> FetchOutcome + Send + Sync>,
) -> (ImageResourceFetch, FetchCalls) {
    let calls: FetchCalls = Arc::new(Mutex::new(Vec::new()));
    let recorded = calls.clone();
    let fetch: ImageResourceFetch = Arc::new(move |_reference, signal| {
        let index = {
            let mut calls = recorded.lock().unwrap();
            calls.push(signal.clone());
            calls.len() - 1
        };
        match outcome(index) {
            FetchOutcome::HangUntilAbort => {
                let (aborted, on_abort) = oneshot::channel::<()>();
                let aborted = Mutex::new(Some(aborted));
                if !is_abort_signal_aborted(&signal) {
                    add_abort_listener(
                        &signal,
                        Arc::new(move || {
                            if let Some(aborted) = aborted.lock().unwrap().take() {
                                let _ = aborted.send(());
                            }
                        }),
                    );
                }
                Box::pin(async move {
                    if !is_abort_signal_aborted(&signal) {
                        let _ = on_abort.await;
                    }
                    throw_if_aborted(&signal);
                    return None;
                })
            }
            // A source `async () => value` settles one microtask after it is called.
            FetchOutcome::Image(image) => Box::pin(async move {
                yield_once().await;
                return Some(image);
            }),
            FetchOutcome::Miss => Box::pin(async {
                yield_once().await;
                return None;
            }),
            FetchOutcome::Never => Box::pin(futures::future::pending()),
            FetchOutcome::Panic(message) => Box::pin(async move {
                yield_once().await;
                if !message.is_empty() {
                    throw_error(message);
                }
                return None;
            }),
        }
    });
    return (fetch, calls);
}

pub(crate) fn add_scene_mesh(scene: &Ref<Scene3D>, mesh: &Ref<Mesh>) {
    let root: NodeRef = scene.read().unwrap().root.clone();
    let child: NodeRef = mesh.clone();
    add_node_child(&root, &child);
}

pub(crate) fn attach_texture(reference: &ImageResourceReference) -> Ref<Texture> {
    let texture = Arc::new(RwLock::new(create_texture(None)));
    match reference {
        ImageResourceReference::Embedded(value) => {
            value
                .reference
                .write()
                .unwrap()
                .textures
                .push(texture.clone());
        }
        ImageResourceReference::External(value) => {
            value
                .reference
                .write()
                .unwrap()
                .textures
                .push(texture.clone());
        }
    }
    return texture;
}

pub(crate) fn context(host: &MockHost) -> Scene3DResourceResolverContext {
    return Scene3DResourceResolverContext {
        image_resolver: Arc::new(RwLock::new(create_image_resolver_state())),
        loader: ResourceLoaderContext {
            spawn: host.spawn(),
            timers: host.timers(),
        },
    };
}

pub(crate) fn create_shared_texture() -> Ref<Texture> {
    return Arc::new(RwLock::new(create_texture(None)));
}

/// Runs `future` on the deterministic host until every ready task has quiesced, then returns its
/// output. A future still pending after the host is idle is a test failure.
pub(crate) fn drive<T: Send + 'static>(
    host: &MockHost,
    future: impl Future<Output = T> + Send + 'static,
) -> T {
    let output: Arc<Mutex<Option<T>>> = Arc::new(Mutex::new(None));
    let slot = output.clone();
    (host.spawn().spawn)(Box::pin(async move {
        let value = future.await;
        *slot.lock().unwrap() = Some(value);
    }));
    host.run_ready();
    return output
        .lock()
        .unwrap()
        .take()
        .expect("future settled on the idle host");
}

pub(crate) fn embedded_reference(mime_type: Option<&str>) -> ImageResourceReference {
    let reference = create_embedded_image_resource_reference(Arc::new(RwLock::new(
        vec![9u8, 9].into_boxed_slice(),
    )));
    reference.write().unwrap().mime_type = mime_type.map(str::to_string);
    return ImageResourceReference::Embedded(EmbeddedImageResourceReferenceValue { reference });
}

pub(crate) fn external_reference(uri: &str) -> ImageResourceReference {
    let reference = create_external_image_resource_reference(uri.to_string());
    return ImageResourceReference::External(ExternalImageResourceReferenceValue { reference });
}

pub(crate) fn fake_image() -> Ref<ImageResource> {
    return create_image_resource(
        Arc::new(flight_host::HostImageSource {
            handle: Arc::new(()),
            provider: Arc::new(()),
        }),
        &create_image_resolver_state(),
    );
}

pub(crate) fn host_image() -> HostImageCapability {
    return HostImageCapability {
        create_image_from_bitmap: None,
        create_image_from_surface: None,
        load_image_from_url: Arc::new(|_, _, _| Box::pin(futures::future::pending())),
        provider: Arc::new(()),
    };
}

pub(crate) fn image_source(image: &Ref<ImageResource>) -> TextureSourceRef {
    return image.clone();
}

pub(crate) fn mesh_of(materials: Vec<Ref<dyn Material3D>>) -> Ref<Mesh> {
    let materials = materials.into_iter().map(Some).collect();
    return create_mesh(
        Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None))),
        Arc::new(RwLock::new(materials)),
    );
}

pub(crate) fn reference_failure(
    reference: &ImageResourceReference,
) -> Option<ImageResourceFailure> {
    let failure = match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().failure.clone(),
        ImageResourceReference::External(value) => value.reference.read().unwrap().failure.clone(),
    };
    return failure.map(|failure| failure.read().unwrap().clone());
}

pub(crate) fn reference_state(reference: &ImageResourceReference) -> ResourceResolutionState {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        ImageResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

pub(crate) fn same_reference(a: &ImageResourceReference, b: &ImageResourceReference) -> bool {
    return match (a, b) {
        (ImageResourceReference::Embedded(a), ImageResourceReference::Embedded(b)) => {
            Arc::ptr_eq(&a.reference, &b.reference)
        }
        (ImageResourceReference::External(a), ImageResourceReference::External(b)) => {
            Arc::ptr_eq(&a.reference, &b.reference)
        }
        _ => false,
    };
}

pub(crate) fn same_source(actual: Option<TextureSourceRef>, expected: &Ref<ImageResource>) -> bool {
    return actual.is_some_and(|actual| {
        Arc::as_ptr(&actual) as *const () == Arc::as_ptr(expected) as *const ()
    });
}

pub(crate) fn same_textures(actual: &[Ref<Texture>], expected: &[&Ref<Texture>]) -> bool {
    return actual.len() == expected.len()
        && actual
            .iter()
            .zip(expected)
            .all(|(actual, expected)| Arc::ptr_eq(actual, expected));
}

pub(crate) fn scene_with(resources: Vec<ImageResourceReference>) -> Ref<Scene3D> {
    let mut scene = create_scene3d();
    scene.resources = resources;
    return Arc::new(RwLock::new(scene));
}

pub(crate) fn set_reference_resolution(
    reference: &ImageResourceReference,
    failure: Option<ImageResourceFailure>,
    state: ResourceResolutionState,
) {
    let failure = failure.map(|failure| Arc::new(RwLock::new(failure)));
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

pub(crate) fn texture_source(texture: &Ref<Texture>) -> Option<TextureSourceRef> {
    return get_texture_source(&*texture.read().unwrap());
}

/// Completes on its second poll after waking its task: one microtask turn on the host.
pub(crate) async fn yield_once() {
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

pub(crate) fn unlit_mesh(texture: &Ref<Texture>) -> Ref<Mesh> {
    let mut material = flight_materials::contract::create_unlit_material();
    material.base_color_map = Some(texture.clone());
    return mesh_of(vec![Arc::new(RwLock::new(material))]);
}
