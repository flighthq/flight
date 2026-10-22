use std::sync::{Arc, Mutex};

use flight_entity::Ref;
use flight_resource::ResourceResolutionState;
use flight_scene3d_resources::contract::*;
use flight_signals::{Signal, connect_signal, create_signal};
use flight_texture::Texture;

use crate::mock_host::MockHost;
use crate::support::*;

fn resolver_with(
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

fn recorded_progress() -> (
    Signal<Scene3DResourceLoadProgress>,
    Arc<Mutex<Vec<Scene3DResourceLoadProgress>>>,
) {
    let progress = create_signal::<Scene3DResourceLoadProgress>();
    let events = Arc::new(Mutex::new(Vec::new()));
    let captured = events.clone();
    connect_signal(
        &progress,
        Arc::new(move |event: &Scene3DResourceLoadProgress| captured.lock().unwrap().push(*event)),
        None,
    );
    return (progress, events);
}

fn load(
    host: &MockHost,
    scene: &Ref<flight_scene3d::Scene3D>,
    resolver: &Ref<Scene3DResourceResolver>,
    options: Option<LoadScene3DResourcesOptions>,
) {
    let (scene, resolver) = (scene.clone(), resolver.clone());
    drive(host, async move {
        load_scene3d_resources(&scene, &resolver, options.as_ref()).await;
    });
}

fn two_mesh_scene() -> (
    Ref<flight_scene3d::Scene3D>,
    [ImageResourceReferenceAndTexture; 2],
) {
    let first = external_reference("leaf.png");
    let second = external_reference("leaf.png");
    let a = attach_texture(&first);
    let b = attach_texture(&second);
    let scene = scene_with(vec![first.clone(), second.clone()]);
    add_scene_mesh(&scene, &unlit_mesh(&a));
    add_scene_mesh(&scene, &unlit_mesh(&b));
    return (scene, [(first, a), (second, b)]);
}

type ImageResourceReferenceAndTexture = (flight_image::ImageResourceReference, Ref<Texture>);

mod load_scene3d_resources {
    use super::*;

    #[test]
    fn awaits_every_started_load_so_the_scene_is_fully_resolved_on_return() {
        let host = MockHost::new();
        let image = fake_image();
        let returned = image.clone();
        let (resolver, _) = resolver_with(
            &host,
            Arc::new(move |_| FetchOutcome::Image(returned.clone())),
        );
        let (scene, [(first, a), (_, b)]) = two_mesh_scene();

        load(&host, &scene, &resolver, None);

        assert!(same_source(texture_source(&a), &image));
        assert!(same_source(texture_source(&b), &image));
        assert_eq!(reference_state(&first), ResourceResolutionState::Resolved);
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn resolves_immediately_when_there_is_nothing_pending() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, calls) =
            resolver_with(&host, Arc::new(move |_| FetchOutcome::Image(image.clone())));
        let scene = scene_with(Vec::new());
        load(&host, &scene, &resolver, None);
        assert!(calls.lock().unwrap().is_empty());
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn reports_operation_scoped_progress_as_unique_references_settle() {
        let host = MockHost::new();
        let image = fake_image();
        let (resolver, _) =
            resolver_with(&host, Arc::new(move |_| FetchOutcome::Image(image.clone())));
        let (scene, _) = two_mesh_scene();
        let (progress, events) = recorded_progress();

        let options = LoadScene3DResourcesOptions {
            progress: Some(progress),
            priority: None,
            select: None,
        };
        load(&host, &scene, &resolver, Some(options));

        let events = events.lock().unwrap();
        assert_eq!(
            events[0],
            Scene3DResourceLoadProgress {
                loaded: 0,
                total: 2
            }
        );
        assert_eq!(
            *events.last().unwrap(),
            Scene3DResourceLoadProgress {
                loaded: 2,
                total: 2
            }
        );
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn counts_failed_references_as_terminal_without_hiding_their_failure_state() {
        let host = MockHost::new();
        let (resolver, _) = resolver_with(&host, Arc::new(|_| FetchOutcome::Miss));
        let reference = external_reference("leaf.png");
        let texture = attach_texture(&reference);
        let scene = scene_with(vec![reference.clone()]);
        add_scene_mesh(&scene, &unlit_mesh(&texture));
        let (progress, events) = recorded_progress();

        let options = LoadScene3DResourcesOptions {
            progress: Some(progress),
            priority: None,
            select: None,
        };
        load(&host, &scene, &resolver, Some(options));

        assert!(texture_source(&texture).is_none());
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        assert_eq!(
            *events.lock().unwrap(),
            vec![
                Scene3DResourceLoadProgress {
                    loaded: 0,
                    total: 1
                },
                Scene3DResourceLoadProgress {
                    loaded: 1,
                    total: 1
                },
            ]
        );
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn waits_and_reports_only_the_references_selected_for_this_operation() {
        let host = MockHost::new();
        let image = fake_image();
        let returned = image.clone();
        let (resolver, calls) = resolver_with(
            &host,
            Arc::new(move |_| FetchOutcome::Image(returned.clone())),
        );
        let (scene, [(_, selected), (deferred_reference, deferred)]) = two_mesh_scene();
        let (progress, events) = recorded_progress();
        let wanted = selected.clone();

        let options = LoadScene3DResourcesOptions {
            progress: Some(progress),
            select: Some(Arc::new(move |texture, _| Arc::ptr_eq(texture, &wanted))),
            priority: None,
        };
        load(&host, &scene, &resolver, Some(options));

        assert!(same_source(texture_source(&selected), &image));
        assert!(texture_source(&deferred).is_none());
        assert_eq!(
            reference_state(&deferred_reference),
            ResourceResolutionState::Unresolved
        );
        assert_eq!(calls.lock().unwrap().len(), 1);
        assert_eq!(
            *events.lock().unwrap().last().unwrap(),
            Scene3DResourceLoadProgress {
                loaded: 1,
                total: 1
            }
        );
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod wait_for_scene3d_resource_resolver {
    use super::*;

    #[test]
    fn resolves_immediately_when_the_resolver_has_no_pending_requests() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let waited = resolver.clone();
        drive(&host, async move {
            wait_for_scene3d_resource_resolver(&waited).await
        });
        dispose_scene3d_resource_resolver(&resolver);
    }
}
