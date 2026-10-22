use flight_scene3d_formats::*;
use std::sync::Arc;

mod obj_all_material_handlers {
    use super::*;

    #[test]
    fn matches_the_original_classic_and_pbr_registry_fixtures() {
        let mut classic = super::super::obj_test_helper::material_fixture("classic");
        classic.diffuse = [0.8; 3];
        classic.specular = [0.0; 3];
        classic.specular_exponent = 0.0;
        let mut pbr = super::super::obj_test_helper::material_fixture("pbr");
        pbr.diffuse = [0.8; 3];
        pbr.specular = [0.0; 3];
        pbr.specular_exponent = 0.0;
        pbr.metallic = Some(0.0);
        pbr.roughness = Some(0.5);
        let matches_classic = OBJ_BLINN_PHONG_MATERIAL_HANDLER
            .read()
            .unwrap()
            .matches
            .clone();
        let matches_pbr = OBJ_STANDARD_PBR_MATERIAL_HANDLER
            .read()
            .unwrap()
            .matches
            .clone();
        assert!(matches_classic(&classic));
        assert!(!matches_classic(&pbr));
        assert!(matches_pbr(&pbr));
        assert!(!matches_pbr(&classic));
        classic.roughness = Some(0.5);
        assert!(matches_pbr(&classic));
        classic.roughness = None;
        classic.metallic = Some(1.0);
        assert!(matches_pbr(&classic));
    }

    #[test]
    fn retains_both_original_families_in_first_match_dispatch_order() {
        assert_eq!(OBJ_ALL_MATERIAL_HANDLERS.len(), 2);
        assert!(Arc::ptr_eq(
            &OBJ_ALL_MATERIAL_HANDLERS[0],
            &OBJ_BLINN_PHONG_MATERIAL_HANDLER
        ));
        assert!(Arc::ptr_eq(
            &OBJ_ALL_MATERIAL_HANDLERS[1],
            &OBJ_STANDARD_PBR_MATERIAL_HANDLER
        ));
        assert_eq!(OBJ_BLINN_PHONG_MATERIAL_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &OBJ_BLINN_PHONG_MATERIAL_FAMILY[0],
            &OBJ_BLINN_PHONG_MATERIAL_HANDLER
        ));
        assert_eq!(OBJ_STANDARD_PBR_MATERIAL_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &OBJ_STANDARD_PBR_MATERIAL_FAMILY[0],
            &OBJ_STANDARD_PBR_MATERIAL_HANDLER
        ));
    }
}
