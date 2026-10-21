use crate::support::*;
use flight_entity::Ref;
use flight_materials::{Material3D, create_standard_pbr_material};
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
mod create_billboard {
    use super::*;
    #[test]
    fn uses_default_kind_and_full_facing_and_retains_actual_geometry_and_materials() {
        let g = test_geometry();
        let m: Ref<dyn Material3D> = Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let materials = Arc::new(RwLock::new(vec![Some(m.clone())]));
        let b = create_billboard(g.clone(), materials.clone(), None, None, None);
        let b = b.read().unwrap();
        assert_eq!(b.kind, BILLBOARD_KIND);
        assert_eq!(b.mode, BillboardMode::Full);
        assert!(Arc::ptr_eq(&b.geometry, &g));
        assert!(Arc::ptr_eq(&b.materials, &materials));
        assert!(Arc::ptr_eq(
            b.materials.read().unwrap()[0].as_ref().unwrap(),
            &m
        ));
    }
    #[test]
    fn accepts_explicit_mode_and_custom_kind() {
        let b = create_billboard(
            test_geometry(),
            empty_materials(),
            Some(BillboardMode::AxisY),
            None,
            None,
        );
        assert_eq!(b.read().unwrap().mode, BillboardMode::AxisY);
        let b = create_billboard(
            test_geometry(),
            empty_materials(),
            Some(BillboardMode::ScreenAligned),
            Some("acme.Billboard".to_string()),
            None,
        );
        assert_eq!(b.read().unwrap().kind, "acme.Billboard");
        assert!(is_billboard(&*b.read().unwrap()));
    }
}
mod enable_billboard_signals {
    use super::*;
    #[test]
    fn returns_the_original_node_signal_group() {
        let b = create_billboard(test_geometry(), empty_materials(), None, None, None);
        let s = enable_billboard_signals(&as_node_ref(&b));
        assert!(Arc::ptr_eq(
            &s,
            &get_billboard_signals(&b.read().unwrap()).unwrap()
        ));
    }
}
mod get_billboard_runtime {
    use super::*;
    #[test]
    fn returns_actual_scene_runtime_with_null_world_matrix() {
        let b = create_billboard(test_geometry(), empty_materials(), None, None, None);
        let b = b.read().unwrap();
        assert!(std::ptr::eq(
            get_billboard_runtime(&b),
            get_billboard_runtime(&b)
        ));
        assert!(
            get_billboard_runtime(&b)
                .transform3d
                .world_matrix4
                .is_none()
        );
    }
}
mod get_billboard_signals {
    use super::*;
    #[test]
    fn returns_null_before_signals_are_enabled() {
        let b = create_billboard(test_geometry(), empty_materials(), None, None, None);
        assert!(get_billboard_signals(&b.read().unwrap()).is_none());
    }
}
mod is_billboard {
    use super::*;
    #[test]
    fn recognizes_geometry_plus_mode_and_rejects_plain_mesh_and_bare_group() {
        let b = create_billboard(test_geometry(), empty_materials(), None, None, None);
        assert!(is_billboard(&*b.read().unwrap()));
        assert!(!is_billboard(&*test_mesh().read().unwrap()));
        assert!(!is_billboard(&*node3d().read().unwrap()));
    }
}
