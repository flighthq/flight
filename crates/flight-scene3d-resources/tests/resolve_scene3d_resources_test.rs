use std::sync::{Arc, Mutex};

use flight_entity::{Ref, allocate_entity};
use flight_image::contract::*;
use flight_image_codec::{
    DecodedImage, HostImageDecodeCapabilities, HostImageDecodeFormatCapability,
};
use flight_resource::ResourceResolutionState;
use flight_scene3d::Scene3D;
use flight_scene3d_resources::contract::*;
use flight_signals::connect_signal;
use flight_stream::{create_abort_controller, is_abort_signal_aborted};
use flight_texture::Texture;

use crate::mock_host::MockHost;
use crate::support::*;

fn built_in_resolver(
    host: &MockHost,
    outcome: Arc<dyn Fn(usize) -> FetchOutcome + Send + Sync>,
) -> (Ref<Scene3DResourceResolver>, FetchCalls) {
    let (fetch, calls) = controlled_fetch(outcome);
    let options = Scene3DResourceResolverOptions {
        fetch: Some(fetch),
        image_decode: None,
        max_concurrent: None,
        registry: None,
    };
    let resolver =
        create_built_in_scene3d_resource_resolver(&host_image(), Some(&options), &context(host));
    return (resolver, calls);
}

fn mesh_scene(references: Vec<ImageResourceReference>, textures: &[&Ref<Texture>]) -> Ref<Scene3D> {
    let scene = scene_with(references);
    for texture in textures {
        add_scene_mesh(&scene, &unlit_mesh(texture));
    }
    return scene;
}

fn select_only(texture: &Ref<Texture>) -> UpdateScene3DResourceStreamingOptions {
    let wanted = texture.clone();
    return UpdateScene3DResourceStreamingOptions {
        select: Some(Arc::new(move |candidate, _| Arc::ptr_eq(candidate, &wanted))),
        priority: None,
    };
}

fn select_none() -> UpdateScene3DResourceStreamingOptions {
    return UpdateScene3DResourceStreamingOptions {
        select: Some(Arc::new(|_, _| false)),
        priority: None,
    };
}

fn settle(host: &MockHost, resolver: &Ref<Scene3DResourceResolver>) {
    let resolver = resolver.clone();
    drive(host, async move { wait_for_scene3d_resource_resolver(&resolver).await });
}

fn image_outcome(image: &Ref<ImageResource>) -> Arc<dyn Fn(usize) -> FetchOutcome + Send + Sync> {
    let image = image.clone();
    return Arc::new(move |_| FetchOutcome::Image(image.clone()));
}

mod initialize_image_resource_failure {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_image_resource_failure() {
        let mut failure: ImageResourceFailure = allocate_entity();
        flight_entity::set_entity_uid(&mut failure, "failure".to_string());
        // This package's own initializer; the image atom exports a different cause-based one.
        flight_scene3d_resources::contract::initialize_image_resource_failure(
            &mut failure,
            ImageResourceFailureKind::Unavailable,
            "missing".to_string(),
            None,
        );
        assert_eq!(flight_entity::get_entity_uid(&mut failure), "failure");
        assert_eq!(failure.kind, ImageResourceFailureKind::Unavailable);
        assert_eq!(failure.message, "missing");
        assert_eq!(failure.name, None);
    }
}

mod resolve_one_scene3d_resource_texture {
    use super::*;

    fn decode_capability(decoded: &Arc<Mutex<Vec<Vec<u8>>>>) -> HostImageDecodeFormatCapability {
        let decoded = decoded.clone();
        return HostImageDecodeFormatCapability {
            decode: Arc::new(move |bytes, _| {
                decoded.lock().unwrap().push(bytes);
                Box::pin(async {
                    DecodedImage {
                        data: vec![0; 16].into_boxed_slice(),
                        height: 2,
                        width: 2,
                    }
                })
            }),
        };
    }

    #[test]
    fn decodes_embedded_bytes_through_the_image_atom() {
        let host = MockHost::new();
        let decoded = Arc::new(Mutex::new(Vec::new()));
        let options = Scene3DResourceResolverOptions {
            image_decode: Some(Arc::new(HostImageDecodeCapabilities {
                jpeg: Some(decode_capability(&decoded)),
                avif: None,
                bmp: None,
                gif: None,
                png: None,
                webp: None,
            })),
            fetch: None,
            max_concurrent: None,
            registry: None,
        };
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), Some(&options), &context(&host));
        let reference = embedded_reference(Some("image/jpeg"));
        let signal = create_abort_controller().signal;
        let (task_resolver, task_reference) = (resolver.clone(), reference.clone());
        let result = drive(&host, async move {
            resolve_one_scene3d_resource_texture(&task_resolver, &task_reference, &signal).await
        });
        assert_eq!(*decoded.lock().unwrap(), vec![vec![9u8, 9]]);
        let source = result.unwrap();
        let fields = source.read().unwrap().texture_source_fields().clone();
        assert_eq!((fields.width, fields.height), (2, 2));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Resolved);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn passes_the_complete_plain_embedded_reference_to_the_shared_resource_atom() {
        // A reference with no MIME type and unrecognized bytes reaches the shared atom unchanged;
        // the atom, not this package, reports it unavailable and never calls a format decoder.
        let host = MockHost::new();
        let decoded = Arc::new(Mutex::new(Vec::new()));
        let options = Scene3DResourceResolverOptions {
            image_decode: Some(Arc::new(HostImageDecodeCapabilities {
                jpeg: Some(decode_capability(&decoded)),
                png: Some(decode_capability(&decoded)),
                avif: None,
                bmp: None,
                gif: None,
                webp: None,
            })),
            fetch: None,
            max_concurrent: None,
            registry: None,
        };
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), Some(&options), &context(&host));
        let reference = embedded_reference(None);
        let signal = create_abort_controller().signal;
        let (task_resolver, task_reference) = (resolver.clone(), reference.clone());
        let result = drive(&host, async move {
            resolve_one_scene3d_resource_texture(&task_resolver, &task_reference, &signal).await
        });
        assert!(result.is_none());
        assert!(decoded.lock().unwrap().is_empty());
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn routes_external_refs_through_the_resolver_fetch_seam() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, calls) = built_in_resolver(&host, image_outcome(&image));
        let reference = external_reference("leaf.png");
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let (task_resolver, task_reference) = (resolver.clone(), reference.clone());
        let result = drive(&host, async move {
            resolve_one_scene3d_resource_texture(&task_resolver, &task_reference, &signal).await
        });
        assert_eq!(calls.lock().unwrap().len(), 1);
        // The seam receives the caller's own signal: aborting it now reaches the recorded one.
        flight_stream::abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(&calls.lock().unwrap()[0]));
        assert!(same_source(result, &image));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod resolve_scene3d_resources {
    use super::*;

    #[test]
    fn does_not_cancel_acquisition_owned_by_a_streaming_update() {
        let host = MockHost::new();
        let (resolver, calls) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::HangUntilAbort));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&texture]);
        update_scene3d_resource_streaming(&scene, &resolver, None);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 1);

        let options = ResolveScene3DResourcesOptions {
            select: Some(Arc::new(|_, _| false)),
        };
        let resources = resolve_scene3d_resources(&scene, &resolver, Some(&options));

        assert!(resources.resolved.is_empty());
        assert!(resources.unresolved.is_empty());
        assert!(!is_abort_signal_aborted(&calls.lock().unwrap()[0]));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Loading);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn returns_the_selected_unresolved_working_set_without_starting_acquisition() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, calls) = built_in_resolver(&host, image_outcome(&image));
        let reference = external_reference("leaf.png");
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&a, &b]);

        let resources = resolve_scene3d_resources(&scene, &resolver, None);
        host.run_ready();

        assert!(Arc::ptr_eq(&resources.scene, &scene));
        assert!(resources.resolved.is_empty());
        assert_eq!(resources.unresolved.len(), 1);
        assert!(same_reference(&resources.unresolved[0].reference, &reference));
        assert!(same_textures(&resources.unresolved[0].textures, &[&a, &b]));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Unresolved);
        assert!(calls.lock().unwrap().is_empty());
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn binds_ready_content_across_subscribers_and_returns_its_resolved_group() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, _) = built_in_resolver(&host, image_outcome(&image));
        let reference = embedded_reference(Some("image/png"));
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        {
            let mut guard = a.write().unwrap();
            let Texture::Texture2D(texture_2d) = &mut *guard else {
                panic!("test texture must be 2d");
            };
            texture_2d.source = Some(image_source(&image));
        }
        let scene = mesh_scene(vec![reference.clone()], &[&a, &b]);

        let resources = resolve_scene3d_resources(&scene, &resolver, None);

        assert!(resources.unresolved.is_empty());
        assert_eq!(resources.resolved.len(), 1);
        assert!(same_reference(&resources.resolved[0].reference, &reference));
        assert!(same_source(Some(resources.resolved[0].source.clone()), &image));
        assert!(same_textures(&resources.resolved[0].textures, &[&a, &b]));
        assert!(same_source(texture_source(&b), &image));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Resolved);
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod update_scene3d_resource_streaming {
    use super::*;

    #[test]
    fn resolves_every_pending_texture_binding_the_image_and_advancing_state() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, _) = built_in_resolver(&host, image_outcome(&image));
        let first = external_reference("a.png");
        let second = external_reference("b.png");
        let a = attach_texture(&first);
        let b = attach_texture(&second);
        let scene = mesh_scene(vec![first.clone(), second.clone()], &[&a, &b]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert!(same_source(texture_source(&a), &image));
        assert!(same_source(texture_source(&b), &image));
        assert_eq!(reference_state(&first), ResourceResolutionState::Resolved);
        assert!(reference_failure(&first).is_none());
        assert_eq!(reference_state(&second), ResourceResolutionState::Resolved);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn fetches_and_decodes_one_shared_resource_once_then_binds_every_subscribed_texture() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, calls) = built_in_resolver(&host, image_outcome(&image));
        let reference = external_reference("leaf.png");
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&a, &b]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert_eq!(calls.lock().unwrap().len(), 1);
        assert!(same_source(texture_source(&a), &image));
        assert!(same_source(texture_source(&b), &image));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Resolved);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn keeps_a_shared_load_alive_until_its_final_subscriber_leaves_the_working_set() {
        let host = MockHost::new();
        let (resolver, calls) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::HangUntilAbort));
        let reference = external_reference("leaf.png");
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&a, &b]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 1);
        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_only(&b)));
        host.run_ready();
        assert!(!is_abort_signal_aborted(&calls.lock().unwrap()[0]));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Loading);

        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_none()));
        assert!(is_abort_signal_aborted(&calls.lock().unwrap()[0]));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Unresolved);
        host.run_ready();
        // The settled cancellation stays a cancel, not a failure.
        assert_eq!(reference_state(&reference), ResourceResolutionState::Unresolved);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn binds_a_later_subscriber_from_the_resolved_resource_cache_without_decoding_again() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, calls) = built_in_resolver(&host, image_outcome(&image));
        let reference = external_reference("leaf.png");
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&a, &b]);

        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_only(&a)));
        settle(&host, &resolver);
        assert!(same_source(texture_source(&a), &image));
        assert!(texture_source(&b).is_none());

        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_only(&b)));
        assert!(same_source(texture_source(&b), &image));
        assert_eq!(calls.lock().unwrap().len(), 1);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn limits_the_working_set_to_textures_the_select_predicate_accepts() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, _) = built_in_resolver(&host, image_outcome(&image));
        let wanted_reference = external_reference("wanted.png");
        let skipped_reference = external_reference("skipped.png");
        let wanted = attach_texture(&wanted_reference);
        let skipped = attach_texture(&skipped_reference);
        let scene = mesh_scene(
            vec![wanted_reference.clone(), skipped_reference.clone()],
            &[&wanted, &skipped],
        );

        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_only(&wanted)));
        settle(&host, &resolver);

        assert_eq!(reference_state(&wanted_reference), ResourceResolutionState::Resolved);
        assert_eq!(reference_state(&skipped_reference), ResourceResolutionState::Unresolved);
        assert!(texture_source(&skipped).is_none());
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn fails_a_texture_whose_external_fetch_returns_none() {
        let host = MockHost::new();
        let (resolver, _) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::Miss));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&texture]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert!(texture_source(&texture).is_none());
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        // The source mocks the shared image atom and asserts its stand-in message; the real atom
        // records its own Unavailable failure, which this package keeps rather than overwriting.
        let failure = reference_failure(&reference).unwrap();
        assert_eq!(failure.kind, ImageResourceFailureKind::Unavailable);
        assert_eq!(failure.message, "Image resource unavailable");
        assert_eq!(failure.name, None);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn fails_a_texture_whose_decode_throws() {
        let host = MockHost::new();
        let (resolver, _) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::Panic("bad image")));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&texture]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        let failure = reference_failure(&reference).unwrap();
        assert_eq!(failure.kind, ImageResourceFailureKind::Error);
        assert_eq!(failure.message, "bad image");
        assert_eq!(failure.name, Some("Error".to_string()));
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn cancels_and_reverts_a_load_dropped_from_the_working_set_then_re_requests_on_re_entry() {
        let host = MockHost::new();
        let (resolver, calls) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::HangUntilAbort));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference.clone()], &[&texture]);
        let select_all = UpdateScene3DResourceStreamingOptions {
            select: Some(Arc::new(|_, _| true)),
            priority: None,
        };

        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_all));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Loading);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 1);

        // Drop it: not in the working set this pass, so abort and revert.
        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_none()));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Unresolved);
        assert!(texture_source(&texture).is_none());
        assert!(is_abort_signal_aborted(&calls.lock().unwrap()[0]));
        host.run_ready();

        // Re-entry re-requests from scratch.
        update_scene3d_resource_streaming(&scene, &resolver, Some(&select_all));
        assert_eq!(reference_state(&reference), ResourceResolutionState::Loading);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 2);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn does_not_re_request_a_texture_already_in_flight() {
        let host = MockHost::new();
        let (resolver, calls) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::Never));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference], &[&texture]);

        update_scene3d_resource_streaming(&scene, &resolver, None);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 1);
        update_scene3d_resource_streaming(&scene, &resolver, None);
        host.run_ready();
        assert_eq!(calls.lock().unwrap().len(), 1);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn emits_on_resource_resolved_when_signals_are_enabled() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, _) = built_in_resolver(&host, image_outcome(&image));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference], &[&texture]);
        let signals = enable_scene3d_resource_signals(&resolver);
        let resolved: Arc<Mutex<Vec<Ref<Texture>>>> = Arc::new(Mutex::new(Vec::new()));
        let failed: Arc<Mutex<Vec<Ref<Texture>>>> = Arc::new(Mutex::new(Vec::new()));
        {
            let signals = signals.read().unwrap();
            let on_resolved = resolved.clone();
            connect_signal(
                &signals.on_resource_resolved,
                Arc::new(move |event: &Scene3DResourceEvent| {
                    on_resolved.lock().unwrap().push(event.texture.clone());
                }),
                None,
            );
            let on_failed = failed.clone();
            connect_signal(
                &signals.on_resource_failed,
                Arc::new(move |event: &Scene3DResourceEvent| {
                    on_failed.lock().unwrap().push(event.texture.clone());
                }),
                None,
            );
        }

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert!(same_textures(&resolved.lock().unwrap(), &[&texture]));
        assert!(failed.lock().unwrap().is_empty());
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn emits_on_resource_failed_when_a_decode_throws() {
        let host = MockHost::new();
        let (resolver, _) = built_in_resolver(&host, Arc::new(|_| FetchOutcome::Panic("bad image")));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = mesh_scene(vec![reference], &[&texture]);
        let signals = enable_scene3d_resource_signals(&resolver);
        let failed: Arc<Mutex<Vec<Ref<Texture>>>> = Arc::new(Mutex::new(Vec::new()));
        let on_failed = failed.clone();
        connect_signal(
            &signals.read().unwrap().on_resource_failed,
            Arc::new(move |event: &Scene3DResourceEvent| {
                on_failed.lock().unwrap().push(event.texture.clone());
            }),
            None,
        );

        update_scene3d_resource_streaming(&scene, &resolver, None);
        settle(&host, &resolver);

        assert!(same_textures(&failed.lock().unwrap(), &[&texture]));
        dispose_scene3d_resource_resolver(&resolver);
    }
}
