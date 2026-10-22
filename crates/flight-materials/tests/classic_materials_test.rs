use flight_materials::classic_materials::*;
use flight_materials::*;

mod create_blinn_phong_material {
    use super::*;

    #[test]
    fn creates_white_blinn_phong_with_shininess_32() {
        let m = create_blinn_phong_material();
        assert_eq!(m.kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert!(m.normal_map.is_none());
        assert!(m.alpha_map.is_none());
    }
}

mod create_lambert_material {
    use super::*;

    #[test]
    fn creates_white_diffuse_with_no_emission() {
        let m = create_lambert_material();
        assert_eq!(m.kind, LAMBERT_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.emissive, 0x000000ff);
        assert!(m.diffuse_map.is_none());
        assert!(m.emissive_map.is_none());
    }
}

mod create_phong_material {
    use super::*;

    #[test]
    fn creates_white_phong_with_shininess_32() {
        let m = create_phong_material();
        assert_eq!(m.kind, PHONG_MATERIAL_KIND);
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.specular, 0xffffffff);
        assert_eq!(m.shininess, 32.0);
        assert_eq!(m.normal_scale, 1.0);
    }
}

mod initialize_blinn_phong_material {
    use super::*;

    // D23 (I): the public construction seam of create_blinn_phong_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_blinn_phong_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_blinn_phong_material(&mut out);
        let fresh = create_blinn_phong_material();
        assert_eq!(out.kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_lambert_material {
    use super::*;

    // D23 (I): the public construction seam of create_lambert_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_lambert_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_lambert_material(&mut out);
        let fresh = create_lambert_material();
        assert_eq!(out.kind, LAMBERT_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_phong_material {
    use super::*;

    // D23 (I): the public construction seam of create_phong_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_phong_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_phong_material(&mut out);
        let fresh = create_phong_material();
        assert_eq!(out.kind, PHONG_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}
