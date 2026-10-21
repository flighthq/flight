use flight_path_boolean::MARTINEZ_PATH_BOOLEAN_KERNEL;
use flight_scene2d_formats::contract::*;

mod register_all_rive_handlers {
    use super::*;

    #[test]
    fn installs_every_family_this_package_reads() {
        let mut registry = create_rive_import_registry();
        register_all_rive_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        let missing = [3, 12, 21, 42, 49, 147, 409, 134, 40, 53, 103]
            .into_iter()
            .filter(|type_key| get_rive_core_object_handler(&registry, *type_key).is_none())
            .collect::<Vec<_>>();
        assert!(missing.is_empty(), "missing family anchors: {missing:?}");
    }

    #[test]
    fn runs_clipping_before_the_shape_pass() {
        let passes = artboard_passes();
        let clipping = passes.iter().position(|key| *key == 42).unwrap();
        let shape = passes.iter().position(|key| *key == 3).unwrap();
        assert!(clipping < shape);
    }

    #[test]
    fn runs_the_skeleton_pass_before_layout() {
        let passes = artboard_passes();
        let skeleton = passes.iter().position(|key| *key == 39).unwrap();
        let layout = passes.iter().position(|key| *key == 409).unwrap();
        assert!(skeleton < layout);
    }

    fn artboard_passes() -> Vec<i32> {
        let mut registry = create_rive_import_registry();
        register_all_rive_handlers(&MARTINEZ_PATH_BOOLEAN_KERNEL, &mut registry);
        return registry
            .handlers
            .iter()
            .filter(|entry| entry.handle.apply_artboard.is_some())
            .map(|entry| entry.type_key)
            .collect();
    }
}
