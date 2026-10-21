use flight_entity::{allocate_entity, set_entity_uid, get_entity_uid, Entity, Ref};
use flight_materials::*;
use flight_materials::material3d::create_material3d;
use flight_materials::pbr_materials::report_material_conversion_drop;
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

mod material2d {
    use super::*;

    #[test]
    fn is_allocatable_as_entity() {
        let mat: Material2D = allocate_entity();
        assert_eq!(mat.kind, "");
        assert_eq!(mat.name, None);
    }

    #[test]
    fn derefs_to_material_fields() {
        let mut mat: Material2D = allocate_entity();
        mat.kind = "StandardMaterial".to_string();
        mat.name = Some("test".to_string());
        assert_eq!(mat.kind, "StandardMaterial");
        assert_eq!(mat.name, Some("test".to_string()));
    }

    #[test]
    fn entity_uid_round_trips() {
        let mut mat: Material2D = allocate_entity();
        set_entity_uid(&mut mat, "m2d_1".to_string());
        assert_eq!(get_entity_uid(&mut mat), "m2d_1");
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
    fn family_ref_retains_concrete_data() {
        let mut data: TintMaterialData = allocate_entity();
        data.tint = 0xaabbccdd;
        let r: Ref<TintMaterialData> = Arc::new(RwLock::new(data));
        let family_ref: Ref<TintMaterialData> = r.clone();
        assert_eq!(family_ref.read().unwrap().tint, 0xaabbccdd);
        assert!(Arc::ptr_eq(&r, &family_ref));
    }

    #[test]
    fn implements_material_data_trait() {
        let data: TintMaterialData = allocate_entity();
        fn accepts_material_data(_d: &dyn MaterialData) {}
        accepts_material_data(&data);
    }
}
