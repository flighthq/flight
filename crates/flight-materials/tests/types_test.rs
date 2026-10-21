use flight_entity::{allocate_entity, get_entity_uid, set_entity_uid, Entity, Ref};
use flight_materials::color_scale_bias::*;
use flight_materials::material::*;
use flight_materials::material3d::create_material3d;
use flight_materials::pbr_materials::report_material_conversion_drop;
use flight_materials::standard_material::create_standard_material;
use flight_materials::*;
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
}

mod custom_material2d {
    use super::*;

    #[derive(Clone, Debug)]
    struct CustomMaterial2D {
        fields: Material2DFields,
        pub custom_value: f32,
    }

    impl Default for CustomMaterial2D {
        fn default() -> Self {
            return Self {
                fields: allocate_entity(),
                custom_value: 0.0,
            };
        }
    }

    // flight-lint: allow(sugar-delegates) D16 open-family composition: CustomMaterial2D → Material2DFields
    impl std::ops::Deref for CustomMaterial2D {
        type Target = Material2DFields;

        fn deref(&self) -> &Material2DFields {
            return &self.fields;
        }
    }

    // flight-lint: allow(sugar-delegates) D16 open-family composition: CustomMaterial2D → Material2DFields
    impl std::ops::DerefMut for CustomMaterial2D {
        fn deref_mut(&mut self) -> &mut Material2DFields {
            return &mut self.fields;
        }
    }

    // flight-lint: allow(sugar-delegates) D16 open-family composition: CustomMaterial2D Entity delegation
    impl Entity for CustomMaterial2D {
        fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
            return Entity::entity_runtime(&self.fields);
        }

        fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
            return Entity::entity_runtime_mut(&mut self.fields);
        }
    }

    impl Material for CustomMaterial2D {
        fn as_any(&self) -> &dyn std::any::Any {
            return self;
        }

        fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
            return self;
        }

        fn material_fields(&self) -> &MaterialFields {
            return &self.fields;
        }

        fn material_fields_mut(&mut self) -> &mut MaterialFields {
            return &mut self.fields;
        }
    }

    impl Material2D for CustomMaterial2D {
        fn material2d_fields(&self) -> &Material2DFields {
            return &self.fields;
        }

        fn material2d_fields_mut(&mut self) -> &mut Material2DFields {
            return &mut self.fields;
        }
    }

    #[test]
    fn external_material2d_is_allocatable() {
        let mat: CustomMaterial2D = allocate_entity();
        assert_eq!(mat.custom_value, 0.0);
        assert_eq!(mat.kind, "");
    }

    #[test]
    fn external_material2d_fills_family_slot() {
        let mut mat: CustomMaterial2D = allocate_entity();
        mat.custom_value = 42.0;
        mat.kind = "CustomMat".to_string();
        set_entity_uid(&mut mat, "cm2d_1".to_string());
        let concrete: Ref<CustomMaterial2D> = Arc::new(RwLock::new(mat));
        let family_ref: Ref<dyn Material2D> = concrete.clone();
        Material2D::material2d_fields_mut(&mut *family_ref.write().unwrap()).kind =
            "Mutated".to_string();
        assert_eq!(concrete.read().unwrap().kind, "Mutated");
        assert_eq!(get_entity_uid(&mut *concrete.write().unwrap()), "cm2d_1",);
        let concrete_ptr = Arc::as_ptr(&concrete) as *const ();
        let family_ptr = Arc::as_ptr(&family_ref) as *const ();
        assert_eq!(concrete_ptr, family_ptr);
    }

    #[test]
    fn heterogeneous_material2d_vec() {
        let sm = create_standard_material(None);
        let custom: CustomMaterial2D = allocate_entity();
        let slots: Vec<Ref<dyn Material2D>> =
            vec![Arc::new(RwLock::new(sm)), Arc::new(RwLock::new(custom))];
        assert_eq!(slots.len(), 2);
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
                fields: allocate_entity(),
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
        let concrete_ptr = Arc::as_ptr(&concrete) as *const ();
        let family_ptr = Arc::as_ptr(&family_ref) as *const ();
        assert_eq!(concrete_ptr, family_ptr);
    }

    #[test]
    fn heterogeneous_family_vec() {
        let mut tint: TintMaterialData = allocate_entity();
        tint.tint = 0xff;
        let mut custom: CustomMaterialData = allocate_entity();
        custom.custom_value = 99.0;
        let slots: Vec<Ref<dyn MaterialData>> =
            vec![Arc::new(RwLock::new(tint)), Arc::new(RwLock::new(custom))];
        assert_eq!(slots.len(), 2);
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
        let opts = StandardMaterialOptions {
            name: Some("Named".to_string()),
        };
        let mat = create_standard_material(Some(&opts));
        assert_eq!(mat.kind, STANDARD_MATERIAL_KIND);
        assert_eq!(mat.name, Some("Named".to_string()));
    }

    #[test]
    fn standard_material_fills_material2d_slot() {
        let mat = create_standard_material(None);
        let concrete: Ref<StandardMaterial> = Arc::new(RwLock::new(mat));
        let _family_ref: Ref<dyn Material2D> = concrete.clone();
        assert_eq!(concrete.read().unwrap().kind, STANDARD_MATERIAL_KIND);
    }

    #[test]
    fn family_ref_preserves_identity() {
        let mat = create_standard_material(None);
        let concrete: Ref<StandardMaterial> = Arc::new(RwLock::new(mat));
        let family_ref: Ref<dyn Material2D> = concrete.clone();
        set_entity_uid(&mut *concrete.write().unwrap(), "sm_identity".to_string());
        assert_eq!(
            get_entity_uid(&mut *concrete.write().unwrap()),
            "sm_identity",
        );
        Material2D::material2d_fields_mut(&mut *family_ref.write().unwrap()).name =
            Some("via_family".to_string());
        assert_eq!(
            concrete.read().unwrap().name,
            Some("via_family".to_string()),
        );
        let concrete_ptr = Arc::as_ptr(&concrete) as *const ();
        let family_ptr = Arc::as_ptr(&family_ref) as *const ();
        assert_eq!(concrete_ptr, family_ptr);
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
        assert_eq!(
            get_entity_uid(&mut *concrete.write().unwrap()),
            "tmd_upcast",
        );
        concrete.write().unwrap().tint = 0x11223344;
        assert_eq!(concrete.read().unwrap().tint, 0x11223344);
        let concrete_ptr = Arc::as_ptr(&concrete) as *const ();
        let family_ptr = Arc::as_ptr(&family_ref) as *const ();
        assert_eq!(concrete_ptr, family_ptr);
    }

    #[test]
    fn implements_material_data_trait() {
        let data: TintMaterialData = allocate_entity();
        fn accepts_material_data(_d: &dyn MaterialData) {}
        accepts_material_data(&data);
    }
}
