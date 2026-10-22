use std::sync::{Arc, RwLock};

use flight_image::ImageResourceFetch;
use flight_loader::get_resource_load_counts;
use flight_materials::{STANDARD_PBR_MATERIAL_KIND, UNLIT_MATERIAL_KIND};
use flight_resource::ResourceResolutionState;
use flight_scene3d_resources::contract::*;
use flight_stream::{create_abort_controller, create_shared_future, is_abort_signal_aborted};

use crate::mock_host::MockHost;
use crate::support::{
    attach_texture, context, embedded_reference, host_image, set_reference_resolution,
};

mod create_built_in_scene3d_resource_resolver {
    use super::*;

    #[test]
    fn assembles_standard_pbr_and_unlit_discovery_only_through_the_explicit_built_in_constructor() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        {
            let registry = resolver.read().unwrap().registry.clone();
            let listers = registry.listers.read().unwrap();
            assert!(listers.contains_key(STANDARD_PBR_MATERIAL_KIND));
            assert!(listers.contains_key(UNLIT_MATERIAL_KIND));
        }
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod create_scene3d_resource_resolver {
    use super::*;

    #[test]
    fn creates_an_entity_with_an_empty_registry_and_private_runtime_machinery() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let runtime = get_scene3d_resource_resolver_runtime(&resolver);
        assert!(!flight_entity::get_entity_uid(&mut *resolver.write().unwrap()).is_empty());
        assert!(
            resolver
                .read()
                .unwrap()
                .registry
                .listers
                .read()
                .unwrap()
                .is_empty()
        );
        {
            let runtime = runtime.read().unwrap();
            assert!(runtime.in_flight.is_empty());
            assert!(runtime.signals.is_none());
            // The loader is real and started: it accepts work and counts nothing yet.
            assert_eq!(get_resource_load_counts(&runtime.loader).total_items, 0);
        }
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod create_scene3d_resource_resolver_options {
    use super::*;

    #[test]
    fn uses_a_caller_supplied_registry_and_fetch_wholesale() {
        let host = MockHost::new();
        let registry = create_scene3d_material_texture_registry();
        let fetch: ImageResourceFetch = Arc::new(|_, _| Box::pin(async { None }));
        let options = Scene3DResourceResolverOptions {
            fetch: Some(fetch.clone()),
            registry: Some(registry.clone()),
            image_decode: None,
            max_concurrent: None,
        };
        let resolver =
            create_scene3d_resource_resolver(&host_image(), Some(&options), &context(&host));
        {
            let resolver = resolver.read().unwrap();
            assert!(Arc::ptr_eq(&resolver.registry.listers, &registry.listers));
            assert!(Arc::ptr_eq(
                &resolver.registry.extension_listers,
                &registry.extension_listers
            ));
            assert!(
                !resolver
                    .registry
                    .listers
                    .read()
                    .unwrap()
                    .contains_key(UNLIT_MATERIAL_KIND)
            );
            assert!(Arc::ptr_eq(&resolver.fetch, &fetch));
        }
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod dispose_scene3d_resource_resolver {
    use super::*;

    #[test]
    fn aborts_every_in_flight_controller_and_clears_the_map() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let reference = embedded_reference(None);
        set_reference_resolution(&reference, None, ResourceResolutionState::Loading);
        let texture = attach_texture(&reference);
        let controller = create_abort_controller();
        let signal = controller.signal.clone();
        let entry = Arc::new(RwLock::new(Scene3DResourceInFlight {
            controller,
            promise: create_shared_future(Box::pin(async {})),
            subscribers: vec![texture],
        }));
        let runtime = get_scene3d_resource_resolver_runtime(&resolver);
        runtime.write().unwrap().in_flight.push((reference, entry));

        dispose_scene3d_resource_resolver(&resolver);
        assert!(is_abort_signal_aborted(&signal));
        assert!(runtime.read().unwrap().in_flight.is_empty());
    }
}

mod get_scene3d_resource_resolver_runtime {
    use super::*;

    #[test]
    fn returns_the_one_private_runtime_record_the_resolver_retains() {
        let host = MockHost::new();
        let resolver = create_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let first = get_scene3d_resource_resolver_runtime(&resolver);
        let second = get_scene3d_resource_resolver_runtime(&resolver);
        assert!(Arc::ptr_eq(&first, &second));
        dispose_scene3d_resource_resolver(&resolver);
    }
}

mod initialize_scene3d_resource_resolver {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_scene3d_resource_resolver() {
        let host = MockHost::new();
        let resolver =
            create_built_in_scene3d_resource_resolver(&host_image(), None, &context(&host));
        let previous = get_scene3d_resource_resolver_runtime(&resolver);
        {
            let mut out = resolver.write().unwrap();
            flight_entity::set_entity_uid(&mut *out, "resolver".to_string());
            initialize_scene3d_resource_resolver(&mut out, &host_image(), None, &context(&host));
            // Construction only: the receiver keeps its identity and gets the source defaults.
            assert_eq!(flight_entity::get_entity_uid(&mut *out), "resolver");
            assert!(out.registry.listers.read().unwrap().is_empty());
        }
        let runtime = get_scene3d_resource_resolver_runtime(&resolver);
        assert!(!Arc::ptr_eq(&previous, &runtime));
        assert!(runtime.read().unwrap().in_flight.is_empty());
        assert!(runtime.read().unwrap().signals.is_none());
        dispose_scene3d_resource_resolver(&resolver);
    }
}
