use flight_entity::{allocate_entity, get_entity_uid, set_entity_uid};
use flight_scene3d::contract::*;

mod create_scene3d_kind_usage {
    use super::*;
    #[test]
    fn starts_empty_for_reuse_across_scenes() {
        let mut usage = create_scene3d_kind_usage();
        assert!(usage.material_kinds.is_empty());
        assert!(usage.modifier_kinds.is_empty());
        assert!(usage.node_kinds.is_empty());
        assert!(usage.resource_mime_types.is_empty());
        assert!(usage.texture_source_kinds.is_empty());
        set_entity_uid(&mut usage, "usage".to_string());
        assert_eq!(get_entity_uid(&mut usage), "usage");
    }
}

mod initialize_scene3d_kind_usage {
    use super::*;
    #[test]
    fn initializes_all_lists_and_preserves_the_entity_runtime() {
        let mut usage: Scene3DKindUsage = allocate_entity();
        set_entity_uid(&mut usage, "kept".to_string());
        usage.material_kinds.push("Material".to_string());
        usage.modifier_kinds.push("Modifier".to_string());
        usage.node_kinds.push("Mesh".to_string());
        usage.resource_mime_types.push("image/png".to_string());
        usage.texture_source_kinds.push("image".to_string());
        initialize_scene3d_kind_usage(&mut usage);
        assert!(usage.material_kinds.is_empty());
        assert!(usage.modifier_kinds.is_empty());
        assert!(usage.node_kinds.is_empty());
        assert!(usage.resource_mime_types.is_empty());
        assert!(usage.texture_source_kinds.is_empty());
        assert_eq!(get_entity_uid(&mut usage), "kept");
    }
}
