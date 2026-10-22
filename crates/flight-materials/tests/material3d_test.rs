use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, allocate_entity, get_entity_runtime};
use flight_materials::classic_materials::*;
use flight_materials::material3d::*;
use flight_materials::pbr_materials::*;
use flight_materials::unlit_materials::*;
use flight_materials::*;

/// A caller-declared 3D material kind (the open family's custom-kind path).
#[derive(Clone, Debug)]
pub struct ProbeMaterial {
    fields: Material3DFields,
    pub intensity: f32,
}

flight_materials::impl_material3d!(ProbeMaterial);

/// The probe kind's constructor: a blended `ProbeMaterial` over the shared base initializer.
fn create_probe_material() -> ProbeMaterial {
    let mut fields = create_material3d("ProbeMaterial".to_string());
    fields.alpha_mode = MaterialAlphaMode::Blend;
    return ProbeMaterial {
        fields,
        intensity: 2.0,
    };
}

fn shared<T: Material3D>(value: T) -> Material3DRef {
    return Arc::new(RwLock::new(value));
}

fn kinds(list: &[Material3DRef]) -> Vec<String> {
    return list
        .iter()
        .map(|m| m.read().unwrap().material3d_fields().kind.clone())
        .collect();
}

mod create_material3d {
    use super::*;

    #[test]
    fn carries_the_given_kind() {
        let m = create_material3d("TestMaterial3D".to_string());
        assert_eq!(m.kind, "TestMaterial3D");
    }

    #[test]
    fn defaults_to_opaque_single_sided() {
        let m = create_material3d("TestMaterial3D".to_string());
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.alpha_cutoff, 0.5);
        assert_eq!(m.blend_mode, BLEND_MODE_NORMAL);
        assert!(!m.double_sided);
    }

    #[test]
    fn forwards_trailer_fields_from_opts() {
        let m = {
            let mut value = create_material3d("TestMaterial3D".to_string());
            value.alpha_cutoff = 0.25;
            value.alpha_mode = MaterialAlphaMode::Mask;
            value.double_sided = true;
            value
        };
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Mask);
        assert_eq!(m.alpha_cutoff, 0.25);
        assert!(m.double_sided);
    }
}

mod get_material3d_alpha_mode {
    use super::*;

    #[test]
    fn returns_the_alpha_mode() {
        let m = create_material3d("T".to_string());
        assert_eq!(get_material3d_alpha_mode(&m), MaterialAlphaMode::Opaque);
    }
}

mod initialize_material3d {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut m = create_material3d("Placeholder".to_string());
        initialize_material3d(&mut m, "NewKind".to_string());
        assert_eq!(m.kind, "NewKind");
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.alpha_cutoff, 0.5);
        assert!(!m.double_sided);
    }

    #[test]
    fn applies_options() {
        let mut m = create_material3d("Placeholder".to_string());
        initialize_material3d(&mut m, "NewKind".to_string());
        m.alpha_cutoff = 0.75;
        m.alpha_mode = MaterialAlphaMode::Blend;
        m.double_sided = true;
        m.name = Some("test".to_string());
        assert_eq!(m.kind, "NewKind");
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Blend);
        assert_eq!(m.alpha_cutoff, 0.75);
        assert!(m.double_sided);
        assert_eq!(m.name.as_deref(), Some("test"));
    }
}

mod is_material3d_blended {
    use super::*;

    #[test]
    fn returns_true_only_for_blend() {
        let mut m = create_material3d("T".to_string());
        assert!(!is_material3d_blended(&m));
        m.alpha_mode = MaterialAlphaMode::Blend;
        assert!(is_material3d_blended(&m));
    }
}

mod is_material3d_masked {
    use super::*;

    #[test]
    fn returns_true_only_for_mask() {
        let mut m = create_material3d("T".to_string());
        assert!(!is_material3d_masked(&m));
        m.alpha_mode = MaterialAlphaMode::Mask;
        assert!(is_material3d_masked(&m));
    }
}

mod is_material3d_opaque {
    use super::*;

    #[test]
    fn returns_true_only_for_opaque() {
        let m = create_material3d("T".to_string());
        assert!(is_material3d_opaque(&m));
        let mut blended = create_material3d("T".to_string());
        blended.alpha_mode = MaterialAlphaMode::Blend;
        assert!(!is_material3d_opaque(&blended));
    }
}

mod material3d_family {
    use super::*;

    #[test]
    fn holds_heterogeneous_built_in_and_custom_kinds_as_their_original_allocations() {
        let phong = shared(create_blinn_phong_material());
        let pbr = shared(create_standard_pbr_material());
        let unlit = shared(create_unlit_material());
        let probe = shared(create_probe_material());
        let list = vec![phong.clone(), pbr.clone(), unlit.clone(), probe.clone()];
        assert_eq!(
            kinds(&list),
            vec![
                BLINN_PHONG_MATERIAL_KIND,
                STANDARD_PBR_MATERIAL_KIND,
                UNLIT_MATERIAL_KIND,
                "ProbeMaterial"
            ]
        );
        assert!(Arc::ptr_eq(&list[0], &phong) && Arc::ptr_eq(&list[3], &probe));
    }

    #[test]
    fn dedupes_by_allocation_identity_not_by_value() {
        let a = shared(create_standard_pbr_material());
        let b = shared(create_standard_pbr_material());
        let list = [a.clone(), b.clone(), a.clone()];
        let mut unique: Vec<Material3DRef> = Vec::new();
        for m in &list {
            if !unique.iter().any(|u| Arc::ptr_eq(u, m)) {
                unique.push(m.clone());
            }
        }
        assert_eq!(unique.len(), 2);
        assert!(Arc::ptr_eq(&unique[0], &a) && Arc::ptr_eq(&unique[1], &b));
    }

    #[test]
    fn narrows_back_to_the_concrete_kind_and_mutates_it_in_place() {
        let probe = shared(create_probe_material());
        let phong = shared(create_phong_material());
        {
            let mut guard = probe.write().unwrap();
            let concrete = guard.as_any_mut().downcast_mut::<ProbeMaterial>().unwrap();
            concrete.intensity = 5.0;
            concrete.double_sided = true;
        }
        let guard = probe.read().unwrap();
        assert_eq!(
            guard
                .as_any()
                .downcast_ref::<ProbeMaterial>()
                .unwrap()
                .intensity,
            5.0
        );
        assert!(guard.material3d_fields().double_sided);
        assert!(
            phong
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<ProbeMaterial>()
                .is_none()
        );
    }

    #[test]
    fn generic_readers_accept_any_kind_through_the_trait() {
        let probe = shared(create_probe_material());
        let mut masked = create_lambert_material();
        masked.alpha_mode = MaterialAlphaMode::Mask;
        assert!(is_material3d_blended(&*probe.read().unwrap()));
        assert_eq!(
            get_material3d_alpha_mode(&*probe.read().unwrap()),
            MaterialAlphaMode::Blend
        );
        assert!(is_material3d_masked(&masked) && !is_material3d_opaque(&masked));
        assert!(is_material3d_opaque(&create_depth_material()));
    }

    #[test]
    fn a_kind_carries_one_entity_runtime_shared_with_its_base_fields() {
        let phong = create_phong_material();
        assert!(get_entity_runtime(&phong).is_none());
        let fields: &Material3DFields = &phong;
        assert!(std::ptr::eq(
            flight_entity::Entity::entity_runtime(&phong) as *const EntityRuntimeSlot,
            flight_entity::Entity::entity_runtime(fields) as *const EntityRuntimeSlot
        ));
    }

    #[test]
    fn the_base_kind_is_itself_a_material3d() {
        let base: Material3DFields = allocate_entity();
        let handle = shared(base);
        assert_eq!(handle.read().unwrap().material3d_fields().kind, "");
        assert!(
            handle
                .read()
                .unwrap()
                .as_any()
                .downcast_ref::<Material3DFields>()
                .is_some()
        );
    }
}
