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

mod get_scene3d_kind_usage {
    use super::*;
    use crate::support::*;
    use flight_entity::Ref;
    use flight_materials::contract::*;
    use flight_node::add_node_child;
    use flight_shading::contract::*;
    use std::sync::{Arc, RwLock};

    struct CustomMaterial {
        fields: Material3DFields,
        modifiers: Vec<Ref<dyn Modifier>>,
    }
    flight_materials::impl_material3d!(CustomMaterial, custom_material);
    impl Material for CustomMaterial {
        fn as_any(&self) -> &dyn std::any::Any {
            return self;
        }
        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            return self;
        }
        fn material_fields(&self) -> &MaterialFields {
            return Material::material_fields(&self.fields);
        }
        fn material_fields_mut(&mut self) -> &mut MaterialFields {
            return Material::material_fields_mut(&mut self.fields);
        }
        fn modifier_stream(&self) -> Option<&dyn MaterialModifierStream> {
            return Some(self);
        }
    }
    impl MaterialModifierStream for CustomMaterial {
        fn len(&self) -> usize {
            return self.modifiers.len();
        }
        fn kind_at(&self, index: usize) -> Option<String> {
            return self
                .modifiers
                .get(index)
                .map(|m| m.read().unwrap().modifier_fields().kind.clone());
        }
    }
    fn attach(scene: &Scene3D, materials: Vec<Option<Ref<dyn Material3D>>>) {
        let mesh = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(materials)),
            None,
            None,
        );
        add_node_child(
            &(scene.root.clone() as flight_node::NodeRef),
            &as_node_ref(&mesh),
        );
    }
    fn image_reference(mime: Option<&str>) -> flight_image::ImageResourceReference {
        let r = flight_image::create_embedded_image_resource_reference(
            Arc::new(RwLock::new(vec![1, 2, 3].into_boxed_slice())),
            mime.map(str::to_string),
            None,
        );
        return flight_image::ImageResourceReference::Embedded(
            flight_image::EmbeddedImageResourceReferenceValue { reference: r },
        );
    }
    #[test]
    fn collects_sorted_distinct_materials_and_all_node_kinds_and_resets_every_list() {
        let scene = create_scene3d(None);
        let unlit: Ref<dyn Material3D> = Arc::new(RwLock::new(create_unlit_material()));
        attach(&scene, vec![None, Some(unlit.clone())]);
        attach(&scene, vec![Some(unlit)]);
        attach(
            &scene,
            vec![Some(Arc::new(RwLock::new(create_blinn_phong_material())))],
        );
        let group = node3d();
        add_node_child(
            &(scene.root.clone() as flight_node::NodeRef),
            &as_node_ref(&group),
        );
        let mut usage = create_scene3d_kind_usage();
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(
            usage.material_kinds,
            vec!["BlinnPhongMaterial", "UnlitMaterial"]
        );
        assert_eq!(usage.node_kinds, vec![MESH_KIND, NODE3D_KIND]);
        assert!(usage.modifier_kinds.is_empty());
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(
            usage.material_kinds,
            vec!["BlinnPhongMaterial", "UnlitMaterial"]
        );
        assert_eq!(usage.node_kinds, vec![MESH_KIND, NODE3D_KIND]);
        usage.modifier_kinds.push("stale".to_string());
        usage.resource_mime_types.push("stale".to_string());
        usage.texture_source_kinds.push("stale".to_string());
        get_scene3d_kind_usage(&mut usage, &create_scene3d(None));
        assert!(usage.material_kinds.is_empty());
        assert!(usage.modifier_kinds.is_empty());
        assert!(usage.resource_mime_types.is_empty());
        assert!(usage.texture_source_kinds.is_empty());
        assert_eq!(usage.node_kinds, vec![NODE3D_KIND]);
    }
    #[test]
    fn reads_actual_shaded_and_custom_stacks_without_replacing_modifier_entity_refs() {
        let rim: Ref<dyn Modifier> =
            Arc::new(RwLock::new(create_rim_modifier(&RimModifierOptions {
                color: 0x49d8ffff,
                intensity: Some(0.72),
                power: Some(2.4),
                bias: None,
            })));
        let mut shaded = create_shaded_material(None);
        shaded.modifiers = vec![rim.clone()];
        let scene = create_scene3d(None);
        attach(&scene, vec![Some(Arc::new(RwLock::new(shaded)))]);
        let mut usage = create_scene3d_kind_usage();
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(
            usage.modifier_kinds,
            vec![rim.read().unwrap().modifier_fields().kind.clone()]
        );
        assert_eq!(usage.material_kinds, vec!["ShadedMaterial"]);
        let custom = Arc::new(RwLock::new(CustomMaterial {
            fields: create_material3d("CustomStack".to_string()),
            modifiers: vec![rim.clone()],
        }));
        let scene = create_scene3d(None);
        attach(&scene, vec![Some(custom.clone())]);
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(usage.modifier_kinds, vec!["RimModifier"]);
        assert_eq!(usage.material_kinds, vec!["CustomStack"]);
        assert!(Arc::ptr_eq(&custom.read().unwrap().modifiers[0], &rim));
    }
    #[test]
    fn includes_only_consumed_resource_source_kinds_and_declared_mime_types() {
        let mut scene = create_scene3d(None);
        scene.resources.push(image_reference(Some("image/png")));
        let mut usage = create_scene3d_kind_usage();
        get_scene3d_kind_usage(&mut usage, &scene);
        assert!(usage.texture_source_kinds.is_empty());
        assert!(usage.resource_mime_types.is_empty());
        let _texture = flight_image::create_texture_from_image_resource(&scene.resources[0], None);
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(usage.texture_source_kinds, vec!["image"]);
        assert_eq!(usage.resource_mime_types, vec!["image/png"]);
        scene.resources = vec![image_reference(None)];
        let _texture = flight_image::create_texture_from_image_resource(&scene.resources[0], None);
        get_scene3d_kind_usage(&mut usage, &scene);
        assert_eq!(usage.texture_source_kinds, vec!["image"]);
        assert!(usage.resource_mime_types.is_empty());
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
