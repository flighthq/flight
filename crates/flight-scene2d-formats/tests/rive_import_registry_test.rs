use std::sync::{Arc, Mutex};

use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const FILL: i32 = 20;
const PATH: i32 = 12;
const PARAMETRIC_PATH: i32 = 15;
const SHAPE_PAINT: i32 = 21;
const STAR: i32 = 52;
const UNKNOWN_TYPE: i32 = 999_999;

mod apply_rive_artboard_handlers {
    use super::*;

    #[test]
    fn runs_a_handler_registered_under_several_type_keys_exactly_once() {
        let runs = Arc::new(Mutex::new(0));
        let captured = runs.clone();
        let shared = Arc::new(RiveCoreObjectHandler {
            apply_artboard: Some(Arc::new(move |_| *captured.lock().unwrap() += 1)),
            apply_document: None,
            import_component: None,
        });
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(&mut registry, PATH, shared.clone());
        register_rive_core_object_handler(&mut registry, SHAPE_PAINT, shared);
        let artboard = artboard();
        let root: Node2DRef = create_display_object();
        let mut context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root, &[], None);
        apply_rive_artboard_handlers(&mut context);
        assert_eq!(*runs.lock().unwrap(), 1);
    }

    #[test]
    fn runs_each_pass_in_registration_order() {
        let order = Arc::new(Mutex::new(Vec::new()));
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(
            &mut registry,
            PATH,
            artboard_handler(order.clone(), "path"),
        );
        register_rive_core_object_handler(
            &mut registry,
            SHAPE_PAINT,
            artboard_handler(order.clone(), "paint"),
        );
        let artboard = artboard();
        let root: Node2DRef = create_display_object();
        let mut context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root, &[], None);
        apply_rive_artboard_handlers(&mut context);
        assert_eq!(*order.lock().unwrap(), ["path", "paint"]);
    }

    #[test]
    fn skips_a_handler_that_registers_no_artboard_pass() {
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(
            &mut registry,
            PATH,
            Arc::new(RiveCoreObjectHandler {
                apply_artboard: None,
                apply_document: None,
                import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
            }),
        );
        let artboard = artboard();
        let root: Node2DRef = create_display_object();
        let mut context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root, &[], None);
        apply_rive_artboard_handlers(&mut context);
        assert_eq!(context.nodes.len(), 1);
    }
}

mod apply_rive_document_handlers {
    use super::*;

    #[test]
    fn runs_each_document_pass_once_in_registration_order() {
        let order = Arc::new(Mutex::new(Vec::new()));
        let shared_order = order.clone();
        let shared = Arc::new(RiveCoreObjectHandler {
            apply_artboard: None,
            apply_document: Some(Arc::new(move |_| {
                shared_order.lock().unwrap().push("shared")
            })),
            import_component: None,
        });
        let star_order = order.clone();
        let star = Arc::new(RiveCoreObjectHandler {
            apply_artboard: None,
            apply_document: Some(Arc::new(move |_| star_order.lock().unwrap().push("star"))),
            import_component: None,
        });
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(&mut registry, PATH, shared.clone());
        register_rive_core_object_handler(&mut registry, SHAPE_PAINT, shared);
        register_rive_core_object_handler(&mut registry, STAR, star);
        let mut context = create_rive_document_import_context(&registry, &[], None);
        apply_rive_document_handlers(&mut context);
        assert_eq!(*order.lock().unwrap(), ["shared", "star"]);
    }
}

mod create_rive_artboard_import_context {
    use super::*;

    #[test]
    fn numbers_the_root_as_component_zero_so_nodes_stay_index_for_index_with_the_artboard() {
        let registry = create_rive_import_registry();
        let root: Node2DRef = create_display_object();
        let artboard = artboard();
        let context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root.clone(), &[], None);
        assert_eq!(context.nodes.len(), 1);
        assert!(Arc::ptr_eq(context.nodes[0].as_ref().unwrap(), &root));
        assert!(Arc::ptr_eq(&context.root, &root));
    }

    #[test]
    fn starts_every_collected_output_empty() {
        let registry = create_rive_import_registry();
        let root: Node2DRef = create_display_object();
        let artboard = artboard();
        let font_names = ["Inter".to_string()];
        let context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root, &font_names, None);
        assert!(context.advanced_blends.is_empty());
        assert!(context.layouts.is_empty());
        assert!(context.state_machines.is_empty());
        assert!(context.skeleton.is_none());
        assert!(context.shape_paths.is_empty());
        assert!(context.rebuilds.is_empty());
        assert_eq!(context.font_names, ["Inter"]);
    }
}

mod create_rive_document_import_context {
    use super::*;

    #[test]
    fn carries_the_whole_object_stream_and_starts_with_no_assets() {
        let registry = create_rive_import_registry();
        let objects = [core_object(PATH as u64)];
        let context = create_rive_document_import_context(&registry, &objects, None);
        assert!(std::ptr::eq(context.objects, objects.as_slice()));
        assert!(context.assets.is_empty());
        assert!(context.diagnostics.is_none());
    }
}

mod create_rive_import_registry {
    use super::*;

    #[test]
    fn gives_every_registry_its_own_handler_table() {
        let mut first = create_rive_import_registry();
        let second = create_rive_import_registry();
        register_rive_core_object_handler(&mut first, PATH, data_handler());
        assert!(second.handlers.is_empty());
    }

    #[test]
    fn starts_empty_so_nothing_is_read_until_a_family_is_registered() {
        assert!(create_rive_import_registry().handlers.is_empty());
    }
}

mod get_rive_core_object_handler {
    use super::*;

    #[test]
    fn prefers_the_nearest_registration_so_a_narrow_family_overrides_a_wide_one() {
        let mut registry = create_rive_import_registry();
        let wide = data_handler();
        let narrow = data_handler();
        register_rive_core_object_handler(&mut registry, PATH, wide.clone());
        register_rive_core_object_handler(&mut registry, STAR, narrow.clone());
        assert!(Arc::ptr_eq(
            &get_rive_core_object_handler(&registry, STAR).unwrap(),
            &narrow
        ));
        assert!(Arc::ptr_eq(
            &get_rive_core_object_handler(&registry, PARAMETRIC_PATH).unwrap(),
            &wide
        ));
    }

    #[test]
    fn resolves_a_derived_type_through_the_chain_it_inherits() {
        let mut registry = create_rive_import_registry();
        let path = data_handler();
        register_rive_core_object_handler(&mut registry, PATH, path.clone());
        for key in [STAR, PARAMETRIC_PATH, PATH] {
            assert!(Arc::ptr_eq(
                &get_rive_core_object_handler(&registry, key).unwrap(),
                &path
            ));
        }
    }

    #[test]
    fn returns_none_for_a_key_this_object_model_does_not_define() {
        let registry = create_rive_import_registry();
        assert!(get_rive_core_object_handler(&registry, UNKNOWN_TYPE).is_none());
    }

    #[test]
    fn returns_none_for_a_type_no_registration_covers() {
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(&mut registry, PATH, data_handler());
        assert!(get_rive_core_object_handler(&registry, SHAPE_PAINT).is_none());
    }
}

mod import_rive_core_object_as_data {
    use super::*;

    #[test]
    fn contributes_no_display_object() {
        assert!(import_rive_core_object_as_data().is_none());
    }
}

mod initialize_rive_artboard_import_context {
    use super::*;

    #[test]
    fn fills_every_field_of_a_freshly_allocated_context() {
        let registry = create_rive_import_registry();
        let artboard = artboard();
        let root: Node2DRef = create_display_object();
        let mut diagnostics = Vec::new();
        let mut context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root.clone(), &[], None);
        initialize_rive_artboard_import_context(
            &mut context,
            &registry,
            &artboard,
            &[],
            root.clone(),
            &[],
            Some(&mut diagnostics),
        );
        assert!(std::ptr::eq(context.registry, &registry));
        assert!(Arc::ptr_eq(context.nodes[0].as_ref().unwrap(), &root));
        assert!(context.diagnostics.is_some());
    }
}

mod initialize_rive_document_import_context {
    use super::*;

    #[test]
    fn fills_every_field_of_a_freshly_allocated_context() {
        let registry = create_rive_import_registry();
        let mut context = create_rive_document_import_context(&registry, &[], None);
        initialize_rive_document_import_context(&mut context, &registry, &[], None);
        assert!(std::ptr::eq(context.registry, &registry));
        assert!(context.assets.is_empty());
    }
}

mod register_rive_core_object_handler {
    use super::*;

    #[test]
    fn keeps_a_replaced_key_in_its_original_pass_position() {
        let order = Arc::new(Mutex::new(Vec::new()));
        let mut registry = create_rive_import_registry();
        register_rive_core_object_handler(
            &mut registry,
            PATH,
            artboard_handler(order.clone(), "first"),
        );
        register_rive_core_object_handler(
            &mut registry,
            SHAPE_PAINT,
            artboard_handler(order.clone(), "second"),
        );
        register_rive_core_object_handler(
            &mut registry,
            PATH,
            artboard_handler(order.clone(), "replaced"),
        );
        let artboard = artboard();
        let root: Node2DRef = create_display_object();
        let mut context =
            create_rive_artboard_import_context(&registry, &artboard, &[], root, &[], None);
        apply_rive_artboard_handlers(&mut context);
        assert_eq!(*order.lock().unwrap(), ["replaced", "second"]);
    }

    #[test]
    fn replaces_a_handler_for_a_key_it_already_holds() {
        let mut registry = create_rive_import_registry();
        let replacement = data_handler();
        register_rive_core_object_handler(&mut registry, FILL, data_handler());
        register_rive_core_object_handler(&mut registry, FILL, replacement.clone());
        assert_eq!(registry.handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &get_rive_core_object_handler(&registry, FILL).unwrap(),
            &replacement
        ));
    }
}

fn artboard() -> RiveArtboardGraph {
    return RiveArtboardGraph {
        objects: Vec::new(),
        parent_indices: Vec::new(),
        stream_end: 0,
        stream_start: 0,
    };
}

fn artboard_handler(
    order: Arc<Mutex<Vec<&'static str>>>,
    name: &'static str,
) -> Arc<RiveCoreObjectHandler> {
    return Arc::new(RiveCoreObjectHandler {
        apply_artboard: Some(Arc::new(move |_| order.lock().unwrap().push(name))),
        apply_document: None,
        import_component: None,
    });
}

fn core_object(type_key: u64) -> RiveCoreObject {
    return RiveCoreObject {
        properties: Vec::new(),
        type_key,
    };
}

fn data_handler() -> Arc<RiveCoreObjectHandler> {
    return Arc::new(RiveCoreObjectHandler {
        apply_artboard: None,
        apply_document: None,
        import_component: Some(Arc::new(|_, _| import_rive_core_object_as_data())),
    });
}
