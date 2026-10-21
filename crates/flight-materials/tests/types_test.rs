use flight_entity::{allocate_entity, set_entity_uid, get_entity_uid, Entity, Ref};
use flight_materials::*;
use flight_materials::material3d::create_material3d;
use flight_materials::pbr_materials::report_material_conversion_drop;
use flight_materials::standard_material::create_standard_material;
use std::sync::{Arc, Mutex, RwLock};

mod create_material_conversion_context {
    use super::*;

    #[test]
    fn wraps_guard_and_invokes_on_report() {
        let called = Arc::new(Mutex::new(false));
        let c = called.clone();
        let guard: MaterialConversionGuard = Arc::new(move |_, _| {
            *c.lock().unwrap() = true;
        });
        let ctx = create_material_conversion_context(guard);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test");
        assert!(*called.lock().unwrap());
    }

    #[test]
    fn sugar_new_delegates_to_free_function() {
        let called = Arc::new(Mutex::new(false));
        let c = called.clone();
        let guard: MaterialConversionGuard = Arc::new(move |_, _| {
            *c.lock().unwrap() = true;
        });
        let ctx = MaterialConversionContext::new(guard);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&ctx), &explanation, "test");
        assert!(*called.lock().unwrap());
    }
}

mod material2d_fields {
    use super::*;

    #[test]
    fn is_allocatable_as_entity() {
        let mat: Material2DFields = allocate_entity();
        assert_eq!(mat.kind, "");
        assert_eq!(mat.name, None);
    }

    #[test]
    fn derefs_to_material_fields() {
        let mut mat: Material2DFields = allocate_entity();
        mat.kind = "StandardMaterial".to_string();
        mat.name = Some("test".to_string());
        assert_eq!(mat.kind, "StandardMaterial");
        assert_eq!(mat.name, Some("test".to_string()));
    }

    #[test]
    fn entity_uid_round_trips() {
        let mut mat: Material2DFields = allocate_entity();
        set_entity_uid(&mut mat, "m2d_1".to_string());
        assert_eq!(get_entity_uid(&mut mat), "m2d_1");
    }

    #[test]
    fn implements_material2d_trait() {
        let mat: Material2DFields = allocate_entity();
        fn accepts_material2d(_m: &dyn Material2D) {}
        accepts_material2d(&mat);
    }
}

mod standard_material {
    use super::*;

    #[test]
    fn is_allocatable_as_entity() {
        let mat: StandardMaterial = allocate_entity();
        assert_eq!(mat.kind, STANDARD_MATERIAL_KIND);
    }

    #[test]
    fn derefs_through_material2d_fields_to_material() {
        let mut mat: StandardMaterial = allocate_entity();
        mat.name = Some("MyStandard".to_string());
        assert_eq!(mat.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(mat.name, Some("MyStandard".to_string()));
    }

    #[test]
    fn entity_uid_round_trips() {
        let mut mat: StandardMaterial = allocate_entity();
        set_entity_uid(&mut mat, "sm_1".to_string());
        assert_eq!(get_entity_uid(&mut mat), "sm_1");
    }

    #[test]
    fn implements_material2d_trait() {
        let mat: StandardMaterial = allocate_entity();
        fn accepts_material2d(_m: &dyn Material2D) {}
        accepts_material2d(&mat);
    }

    #[test]
    fn constructor_preserves_kind_and_name() {
        let opts = StandardMaterialOptions { name: Some("Named".to_string()) };
        let mat = create_standard_material(Some(&opts));
        assert_eq!(mat.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(mat.name, Some("Named".to_string()));
    }

    #[test]
    fn standard_material_fills_material2d_slot() {
        let mat = create_standard_material(None);
        let r: Ref<StandardMaterial> = Arc::new(RwLock::new(mat));
        let family_ref: Ref<dyn Material2D> = r.clone();
        let concrete_kind = r.read().unwrap().kind.clone();
        let family_kind = family_ref.read().unwrap().material2d_fields().kind.clone();
        assert_eq!(concrete_kind, STANDARD_MATERIAL_KIND);
        assert_eq!(family_kind, STANDARD_MATERIAL_KIND);
    }

    #[test]
    fn family_ref_preserves_identity() {
        let mat = create_standard_material(None);
        let r: Ref<StandardMaterial> = Arc::new(RwLock::new(mat));
        let family_ref: Ref<dyn Material2D> = r.clone();
        set_entity_uid(&mut *r.write().unwrap(), "sm_identity".to_string());
        let uid = get_entity_uid(&mut *r.write().unwrap());
        assert_eq!(uid, "sm_identity");
        r.write().unwrap().name = Some("mutated".to_string());
        assert_eq!(family_ref.read().unwrap().material2d_fields().name, Some("mutated".to_string()));
    }
}

mod material_alpha_mode {
    use super::*;

    #[test]
    fn material3d_initializes_alpha_mode_to_opaque() {
        let mat = create_material3d("TestMaterial".to_string(), None);
        assert_eq!(mat.alpha_mode, MaterialAlphaMode::Opaque);
    }
}

mod material_data_fields {
    use super::*;

    #[test]
    fn is_allocatable_as_entity() {
        let _fields: MaterialDataFields = allocate_entity();
    }

    #[test]
    fn entity_uid_round_trips() {
        let mut fields: MaterialDataFields = allocate_entity();
        set_entity_uid(&mut fields, "md_1".to_string());
        assert_eq!(get_entity_uid(&mut fields), "md_1");
    }
}

mod tint_material_data {
    use super::*;

    #[test]
    fn is_allocatable_as_entity() {
        let data: TintMaterialData = allocate_entity();
        assert_eq!(data.tint, 0);
    }

    #[test]
    fn retains_tint_value() {
        let mut data: TintMaterialData = allocate_entity();
        data.tint = 0xff0000ff;
        assert_eq!(data.tint, 0xff0000ff);
    }

    #[test]
    fn entity_uid_round_trips() {
        let mut data: TintMaterialData = allocate_entity();
        set_entity_uid(&mut data, "tmd_1".to_string());
        assert_eq!(get_entity_uid(&mut data), "tmd_1");
    }

    #[test]
    fn family_ref_upcasts_to_dyn_material_data() {
        let mut data: TintMaterialData = allocate_entity();
        data.tint = 0xaabbccdd;
        set_entity_uid(&mut data, "tmd_upcast".to_string());
        let concrete: Ref<TintMaterialData> = Arc::new(RwLock::new(data));
        let family_ref: Ref<dyn MaterialData> = concrete.clone();
        assert_eq!(get_entity_uid(&mut *concrete.write().unwrap()), "tmd_upcast");
        concrete.write().unwrap().tint = 0x11223344;
        assert_eq!(concrete.read().unwrap().tint, 0x11223344);
        fn accepts_family_ref(_r: &Ref<dyn MaterialData>) {}
        accepts_family_ref(&family_ref);
    }

    #[test]
    fn implements_material_data_trait() {
        let data: TintMaterialData = allocate_entity();
        fn accepts_material_data(_d: &dyn MaterialData) {}
        accepts_material_data(&data);
    }
}

mod custom_material_data {
    use super::*;

    #[derive(Clone, Debug)]
    struct CustomMaterialData {
        fields: MaterialDataFields,
        pub custom_value: f32,
    }

    impl Default for CustomMaterialData {
        fn default() -> Self {
            return Self {
                fields: MaterialDataFields::default(),
                custom_value: 0.0,
            };
        }
    }

    impl std::ops::Deref for CustomMaterialData {
        type Target = MaterialDataFields;

        fn deref(&self) -> &MaterialDataFields {
            return &self.fields;
        }
    }

    impl std::ops::DerefMut for CustomMaterialData {
        fn deref_mut(&mut self) -> &mut MaterialDataFields {
            return &mut self.fields;
        }
    }

    impl Entity for CustomMaterialData {
        fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
            return Entity::entity_runtime(&self.fields);
        }

        fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
            return Entity::entity_runtime_mut(&mut self.fields);
        }
    }

    impl MaterialData for CustomMaterialData {
        fn material_data_fields(&self) -> &MaterialDataFields {
            return &self.fields;
        }

        fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields {
            return &mut self.fields;
        }
    }

    #[test]
    fn external_material_data_is_allocatable() {
        let data: CustomMaterialData = allocate_entity();
        assert_eq!(data.custom_value, 0.0);
    }

    #[test]
    fn external_material_data_fills_family_slot() {
        let mut data: CustomMaterialData = allocate_entity();
        data.custom_value = 42.0;
        set_entity_uid(&mut data, "custom_1".to_string());
        let concrete: Ref<CustomMaterialData> = Arc::new(RwLock::new(data));
        let family_ref: Ref<dyn MaterialData> = concrete.clone();
        assert_eq!(get_entity_uid(&mut *concrete.write().unwrap()), "custom_1");
        concrete.write().unwrap().custom_value = 99.0;
        assert_eq!(concrete.read().unwrap().custom_value, 99.0);
        fn accepts_family_ref(_r: &Ref<dyn MaterialData>) {}
        accepts_family_ref(&family_ref);
    }

    #[test]
    fn heterogeneous_family_vec() {
        let mut tint: TintMaterialData = allocate_entity();
        tint.tint = 0xff;
        let mut custom = CustomMaterialData::default();
        custom.custom_value = 99.0;
        let slots: Vec<Ref<dyn MaterialData>> = vec![
            Arc::new(RwLock::new(tint)),
            Arc::new(RwLock::new(custom)),
        ];
        assert_eq!(slots.len(), 2);
    }
}
