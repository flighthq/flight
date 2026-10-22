use std::sync::Arc;

use flight_entity::allocate_entity;
use flight_image::contract::{ImageResourceFailure, ImageResourceFailureKind};
use flight_resource::ResourceResolutionState;
use flight_scene3d_resources::contract::*;

use crate::mock_host::MockHost;
use crate::support::*;

mod retry_failed_scene3d_resources {
    use super::*;

    #[test]
    fn resets_one_shared_failed_identity_and_re_requests_it_for_every_subscriber() {
        let host = MockHost::new();
        let image = fake_image();
        let returned = image.clone();
        let (fetch, calls) = controlled_fetch(Arc::new(move |index| {
            if index == 0 {
                FetchOutcome::Miss
            } else {
                FetchOutcome::Image(returned.clone())
            }
        }));
        let options = Scene3DResourceResolverOptions {
            fetch: Some(fetch),
            image_decode: None,
            max_concurrent: None,
            registry: None,
        };
        let resolver = create_built_in_scene3d_resource_resolver(
            &host_image(),
            Some(&options),
            &context(&host),
        );
        let reference = external_reference("leaf.png");
        let a = attach_texture(&reference);
        let b = attach_texture(&reference);
        let scene = scene_with(vec![reference.clone()]);
        add_scene_mesh(&scene, &unlit_mesh(&a));
        add_scene_mesh(&scene, &unlit_mesh(&b));

        let (load_scene, load_resolver) = (scene.clone(), resolver.clone());
        drive(&host, async move {
            load_scene3d_resources(&load_scene, &load_resolver, None).await
        });
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        assert_eq!(
            reference_failure(&reference).unwrap().kind,
            ImageResourceFailureKind::Unavailable
        );

        assert_eq!(retry_failed_scene3d_resources(&scene, &resolver, None), 1);
        let waited = resolver.clone();
        drive(&host, async move {
            wait_for_scene3d_resource_resolver(&waited).await
        });
        assert_eq!(calls.lock().unwrap().len(), 2);
        assert!(reference_failure(&reference).is_none());
        assert!(same_source(texture_source(&a), &image));
        assert!(same_source(texture_source(&b), &image));
        dispose_scene3d_resource_resolver(&resolver);
    }

    #[test]
    fn honors_selection_and_leaves_an_excluded_failure_untouched() {
        let host = MockHost::new();
        let reference = external_reference("leaf.png");
        let mut failure: ImageResourceFailure = allocate_entity();
        initialize_image_resource_failure(
            &mut failure,
            ImageResourceFailureKind::Unavailable,
            "missing".to_string(),
            None,
        );
        set_reference_resolution(&reference, Some(failure), ResourceResolutionState::Failed);
        let texture = attach_texture(&reference);
        let scene = scene_with(vec![reference.clone()]);
        add_scene_mesh(&scene, &unlit_mesh(&texture));
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let options = UpdateScene3DResourceStreamingOptions {
            select: Some(Arc::new(|_, _| false)),
            priority: None,
        };
        assert_eq!(
            retry_failed_scene3d_resources(&scene, &resolver, Some(&options)),
            0
        );
        assert_eq!(reference_state(&reference), ResourceResolutionState::Failed);
        dispose_scene3d_resource_resolver(&resolver);
    }
}
