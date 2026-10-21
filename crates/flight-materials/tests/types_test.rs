use flight_entity::{allocate_entity, get_entity_uid, set_entity_uid, Entity, Ref};
use flight_materials::color_scale_bias::*;
use flight_materials::material::*;
use flight_materials::material3d::create_material3d;
use flight_materials::pbr_materials::report_material_conversion_drop;
use flight_materials::standard_material::create_standard_material;
use flight_materials::*;
use std::sync::{Arc, Mutex, RwLock};

mod color_scale_bias_sugar {
    use super::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_color_scale_bias(None);
        let sugar = ColorScaleBias::new(None);
        assert_eq!(free.red_scale, sugar.red_scale);
        assert_eq!(free.green_scale, sugar.green_scale);
        assert_eq!(free.blue_scale, sugar.blue_scale);
        assert_eq!(free.alpha_scale, sugar.alpha_scale);
        assert_eq!(free.red_bias, sugar.red_bias);
        assert_eq!(free.green_bias, sugar.green_bias);
        assert_eq!(free.blue_bias, sugar.blue_bias);
        assert_eq!(free.alpha_bias, sugar.alpha_bias);
    }

    #[test]
    fn sugar_clone_matches_free_function() {
        let opts = ColorScaleBiasOptions {
            red_scale: Some(0.5),
            green_scale: Some(0.6),
            blue_scale: Some(0.7),
            alpha_scale: Some(0.8),
            red_bias: Some(0.1),
            green_bias: Some(0.2),
            blue_bias: Some(0.3),
            alpha_bias: Some(0.4),
        };
        let source = create_color_scale_bias(Some(&opts));
        let free = clone_color_scale_bias(&source);
        let sugar = source.clone_color_scale_bias();
        assert_eq!(free.red_scale, sugar.red_scale);
        assert_eq!(free.alpha_bias, sugar.alpha_bias);
    }

    #[test]
    fn sugar_copy_from_matches_free_function() {
        let source = create_color_scale_bias(Some(&ColorScaleBiasOptions {
            red_scale: Some(2.0),
            green_scale: None,
            blue_scale: None,
            alpha_scale: None,
            red_bias: Some(0.5),
            green_bias: None,
            blue_bias: None,
            alpha_bias: None,
        }));
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        copy_color_scale_bias(&mut free_out, &source);
        sugar_out.copy_from(&source);
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.red_bias, sugar_out.red_bias);
    }

    #[test]
    fn sugar_equals_matches_free_function() {
        let a = create_color_scale_bias(None);
        let b = create_color_scale_bias(None);
        assert_eq!(equals_color_scale_bias(&a, &b), a.equals(&b));
    }

    #[test]
    fn sugar_equals_biases_matches_free_function() {
        let a = create_color_scale_bias(None);
        let b = create_color_scale_bias(None);
        assert_eq!(
            equals_color_scale_bias_biases(&a, &b, true),
            a.equals_biases(&b, true),
        );
        assert_eq!(
            equals_color_scale_bias_biases(&a, &b, false),
            a.equals_biases(&b, false),
        );
    }

    #[test]
    fn sugar_equals_scales_matches_free_function() {
        let a = create_color_scale_bias(None);
        let b = create_color_scale_bias(None);
        assert_eq!(
            equals_color_scale_bias_scales(&a, &b, true),
            a.equals_scales(&b, true),
        );
    }

    #[test]
    fn sugar_bias_rgb_matches_free_function() {
        let csb = create_color_scale_bias(None);
        assert_eq!(get_color_scale_bias_bias_rgb(&csb), csb.bias_rgb());
    }

    #[test]
    fn sugar_bias_rgba_matches_free_function() {
        let csb = create_color_scale_bias(None);
        assert_eq!(get_color_scale_bias_bias_rgba(&csb), csb.bias_rgba());
    }

    #[test]
    fn sugar_is_identity_matches_free_function() {
        let csb = create_color_scale_bias(None);
        assert_eq!(
            is_identity_color_scale_bias(&csb, true),
            csb.is_identity(true),
        );
        assert_eq!(
            is_identity_color_scale_bias(&csb, false),
            csb.is_identity(false),
        );
    }

    #[test]
    fn sugar_concat_matches_free_function() {
        let a = create_color_scale_bias(Some(&ColorScaleBiasOptions {
            red_scale: Some(0.5),
            green_scale: Some(1.0),
            blue_scale: Some(1.0),
            alpha_scale: Some(1.0),
            red_bias: Some(0.1),
            green_bias: Some(0.0),
            blue_bias: Some(0.0),
            alpha_bias: Some(0.0),
        }));
        let b = create_color_scale_bias(Some(&ColorScaleBiasOptions {
            red_scale: Some(2.0),
            green_scale: Some(1.0),
            blue_scale: Some(1.0),
            alpha_scale: Some(1.0),
            red_bias: Some(0.05),
            green_bias: Some(0.0),
            blue_bias: Some(0.0),
            alpha_bias: Some(0.0),
        }));
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        concat_color_scale_bias(&mut free_out, &a, &b);
        sugar_out.concat(&a, &b);
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.red_bias, sugar_out.red_bias);
    }

    #[test]
    fn sugar_invert_from_matches_free_function() {
        let source = create_color_scale_bias(Some(&ColorScaleBiasOptions {
            red_scale: Some(2.0),
            green_scale: Some(0.5),
            blue_scale: Some(1.0),
            alpha_scale: Some(1.0),
            red_bias: Some(0.1),
            green_bias: Some(0.0),
            blue_bias: Some(0.0),
            alpha_bias: Some(0.0),
        }));
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        invert_color_scale_bias(&mut free_out, &source);
        sugar_out.invert_from(&source);
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.red_bias, sugar_out.red_bias);
    }

    #[test]
    fn sugar_set_values_matches_free_function() {
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        set_color_scale_bias(&mut free_out, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8);
        sugar_out.set_values(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8);
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
    }

    #[test]
    fn sugar_set_bias_rgb_matches_free_function() {
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        set_color_scale_bias_bias_rgb(&mut free_out, 0xff8040);
        sugar_out.set_bias_rgb(0xff8040);
        assert_eq!(free_out.red_bias, sugar_out.red_bias);
        assert_eq!(free_out.green_bias, sugar_out.green_bias);
        assert_eq!(free_out.blue_bias, sugar_out.blue_bias);
    }

    #[test]
    fn sugar_set_bias_rgba_matches_free_function() {
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        set_color_scale_bias_bias_rgba(&mut free_out, 0xff8040cc);
        sugar_out.set_bias_rgba(0xff8040cc);
        assert_eq!(free_out.red_bias, sugar_out.red_bias);
        assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
    }

    #[test]
    fn sugar_set_identity_matches_free_function() {
        let opts = ColorScaleBiasOptions {
            red_scale: Some(2.0),
            green_scale: Some(3.0),
            blue_scale: Some(4.0),
            alpha_scale: Some(5.0),
            red_bias: Some(0.1),
            green_bias: Some(0.2),
            blue_bias: Some(0.3),
            alpha_bias: Some(0.4),
        };
        let mut free_out = create_color_scale_bias(Some(&opts));
        let mut sugar_out = create_color_scale_bias(Some(&opts));
        set_color_scale_bias_identity(&mut free_out);
        sugar_out.set_identity();
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
    }

    #[test]
    fn sugar_initialize_matches_free_function() {
        let opts = ColorScaleBiasOptions {
            red_scale: Some(0.5),
            green_scale: None,
            blue_scale: None,
            alpha_scale: None,
            red_bias: None,
            green_bias: None,
            blue_bias: None,
            alpha_bias: Some(0.9),
        };
        let mut free_out = create_color_scale_bias(None);
        let mut sugar_out = create_color_scale_bias(None);
        initialize_color_scale_bias(&mut free_out, Some(&opts));
        sugar_out.initialize(Some(&opts));
        assert_eq!(free_out.red_scale, sugar_out.red_scale);
        assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
    }

    #[test]
    fn sugar_copy_to_arrays_matches_free_function() {
        let csb = create_color_scale_bias(Some(&ColorScaleBiasOptions {
            red_scale: Some(0.5),
            green_scale: Some(0.6),
            blue_scale: Some(0.7),
            alpha_scale: Some(0.8),
            red_bias: Some(0.1),
            green_bias: Some(0.2),
            blue_bias: Some(0.3),
            alpha_bias: Some(0.4),
        }));
        let mut free_scales: Vec<f32> = Vec::new();
        let mut free_biases: Vec<f32> = Vec::new();
        let mut sugar_scales: Vec<f32> = Vec::new();
        let mut sugar_biases: Vec<f32> = Vec::new();
        copy_color_scale_bias_to_arrays(&mut free_scales, &mut free_biases, &csb);
        csb.copy_to_arrays(&mut sugar_scales, &mut sugar_biases);
        assert_eq!(free_scales, sugar_scales);
        assert_eq!(free_biases, sugar_biases);
    }
}

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
    fn sugar_new_matches_free_function() {
        let free_called = Arc::new(Mutex::new(false));
        let sugar_called = Arc::new(Mutex::new(false));
        let fc = free_called.clone();
        let sc = sugar_called.clone();
        let free_guard: MaterialConversionGuard = Arc::new(move |_, _| {
            *fc.lock().unwrap() = true;
        });
        let sugar_guard: MaterialConversionGuard = Arc::new(move |_, _| {
            *sc.lock().unwrap() = true;
        });
        let free_ctx = create_material_conversion_context(free_guard);
        let sugar_ctx = MaterialConversionContext::new(sugar_guard);
        let explanation = MaterialConversionExplanation {
            dropped_maps: vec!["map".to_string()],
            reason: None,
        };
        report_material_conversion_drop(Some(&free_ctx), &explanation, "test");
        report_material_conversion_drop(Some(&sugar_ctx), &explanation, "test");
        assert!(*free_called.lock().unwrap());
        assert!(*sugar_called.lock().unwrap());
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
        family_ref.write().unwrap().material2d_fields_mut().kind = "Mutated".to_string();
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

mod material3d_sugar {
    use super::*;
    use flight_materials::material3d::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_material3d("Test3D".to_string(), None);
        let sugar = Material3D::new("Test3D".to_string(), None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.name, sugar.name);
        assert_eq!(free.alpha_mode, sugar.alpha_mode);
        assert_eq!(free.alpha_cutoff, sugar.alpha_cutoff);
        assert_eq!(free.blend_mode, sugar.blend_mode);
        assert_eq!(free.double_sided, sugar.double_sided);
    }

    #[test]
    fn sugar_alpha_mode_matches_free_function() {
        let mat = create_material3d("Test".to_string(), None);
        assert_eq!(get_material3d_alpha_mode(&mat), mat.alpha_mode(),);
    }

    #[test]
    fn sugar_is_blended_matches_free_function() {
        let mat = create_material3d("Test".to_string(), None);
        assert_eq!(is_material3d_blended(&mat), mat.is_blended());
    }

    #[test]
    fn sugar_is_masked_matches_free_function() {
        let mat = create_material3d("Test".to_string(), None);
        assert_eq!(is_material3d_masked(&mat), mat.is_masked());
    }

    #[test]
    fn sugar_is_opaque_matches_free_function() {
        let mat = create_material3d("Test".to_string(), None);
        assert_eq!(is_material3d_opaque(&mat), mat.is_opaque());
    }

    #[test]
    fn sugar_initialize_matches_free_function() {
        let mut free_mat: Material3D = allocate_entity();
        let mut sugar_mat: Material3D = allocate_entity();
        initialize_material3d(&mut free_mat, "Init3D".to_string(), None);
        sugar_mat.initialize("Init3D".to_string(), None);
        assert_eq!(free_mat.kind, sugar_mat.kind);
        assert_eq!(free_mat.alpha_mode, sugar_mat.alpha_mode);
    }

    #[test]
    fn material3d_is_separate_from_material2d() {
        fn accepts_material3d(_m: &Material3D) {}
        let mat = create_material3d("Test".to_string(), None);
        accepts_material3d(&mat);
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

mod material_sugar {
    use super::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_material("TestKind".to_string());
        let sugar = Material::new("TestKind".to_string());
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.name, sugar.name);
    }

    #[test]
    fn sugar_clone_material_matches_free_function() {
        let mut source = create_material("CloneTest".to_string());
        source.name = Some("original".to_string());
        let free = clone_material(&source);
        let sugar = source.clone_material();
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.name, sugar.name);
    }

    #[test]
    fn sugar_copy_from_matches_free_function() {
        let mut source = create_material("CopyKind".to_string());
        source.name = Some("src".to_string());
        let mut free_out = create_material("".to_string());
        let mut sugar_out = create_material("".to_string());
        copy_material(&mut free_out, &source);
        sugar_out.copy_from(&source);
        assert_eq!(free_out.kind, sugar_out.kind);
        assert_eq!(free_out.name, sugar_out.name);
    }

    #[test]
    fn sugar_equals_matches_free_function() {
        let a = create_material("A".to_string());
        let b = create_material("A".to_string());
        let c = create_material("C".to_string());
        assert_eq!(equals_material(&a, &b), a.equals(&b));
        assert_eq!(equals_material(&a, &c), a.equals(&c));
    }

    #[test]
    fn sugar_of_kind_matches_free_function() {
        let mat = create_material("TargetKind".to_string());
        let free_some = get_material_of_kind(Some(&mat), "TargetKind");
        let sugar_some = Material::of_kind(Some(&mat), "TargetKind");
        assert!(free_some.is_some());
        assert!(sugar_some.is_some());
        assert_eq!(free_some.unwrap().kind, sugar_some.unwrap().kind);
        let free_none = get_material_of_kind(Some(&mat), "Other");
        let sugar_none = Material::of_kind(Some(&mat), "Other");
        assert!(free_none.is_none());
        assert!(sugar_none.is_none());
    }

    #[test]
    fn sugar_initialize_matches_free_function() {
        let mut free_out = create_material("".to_string());
        let mut sugar_out = create_material("".to_string());
        initialize_material(&mut free_out, "InitKind".to_string());
        sugar_out.initialize("InitKind".to_string());
        assert_eq!(free_out.kind, sugar_out.kind);
    }
}

mod pbr_extension_sugar {
    use super::*;
    use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
    use flight_materials::clearcoat_pbr_extension::create_clearcoat_pbr_extension;

    #[test]
    fn sugar_kind_returns_wrapped_extension_kind() {
        let aniso = PbrExtension::Anisotropy(create_anisotropy_pbr_extension(None));
        assert_eq!(aniso.kind(), ANISOTROPY_PBR_EXTENSION_KIND);
        let clearcoat = PbrExtension::Clearcoat(create_clearcoat_pbr_extension(None));
        assert_eq!(clearcoat.kind(), CLEARCOAT_PBR_EXTENSION_KIND);
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
        family_ref.write().unwrap().material2d_fields_mut().name = Some("via_family".to_string());
        assert_eq!(
            concrete.read().unwrap().name,
            Some("via_family".to_string()),
        );
        let concrete_ptr = Arc::as_ptr(&concrete) as *const ();
        let family_ptr = Arc::as_ptr(&family_ref) as *const ();
        assert_eq!(concrete_ptr, family_ptr);
    }

    #[test]
    fn sugar_new_matches_free_function() {
        let opts = StandardMaterialOptions {
            name: Some("Sugar".to_string()),
        };
        let free = create_standard_material(Some(&opts));
        let sugar = StandardMaterial::new(Some(&opts));
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.name, sugar.name);
    }

    #[test]
    fn sugar_initialize_matches_free_function() {
        use flight_materials::standard_material::initialize_standard_material;
        let opts = StandardMaterialOptions {
            name: Some("Init".to_string()),
        };
        let mut free_out: StandardMaterial = allocate_entity();
        let mut sugar_out: StandardMaterial = allocate_entity();
        initialize_standard_material(&mut free_out, Some(&opts));
        sugar_out.initialize(Some(&opts));
        assert_eq!(free_out.kind, sugar_out.kind);
        assert_eq!(free_out.name, sugar_out.name);
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
