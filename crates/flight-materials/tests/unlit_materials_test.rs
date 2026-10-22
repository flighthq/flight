use flight_materials::unlit_materials::*;
use flight_materials::*;

mod create_depth_material {
    use super::*;
    #[test]
    fn creates_depth_material_with_unit_range() {
        let m = create_depth_material();
        assert_eq!(m.kind, DEPTH_MATERIAL_KIND);
        assert_eq!(m.far, 1.0);
        assert_eq!(m.near, 0.0);
    }
}

mod create_emissive_material {
    use super::*;
    #[test]
    fn creates_white_emissive_at_unit_strength() {
        let m = create_emissive_material();
        assert_eq!(m.kind, EMISSIVE_MATERIAL_KIND);
        assert_eq!(m.emissive, 0xffffffff);
        assert_eq!(m.emissive_strength, 1.0);
        assert!(m.emissive_map.is_none());
    }
}

mod create_matcap_material {
    use super::*;
    #[test]
    fn creates_matcap_with_white_tint() {
        let m = create_matcap_material();
        assert_eq!(m.kind, MATCAP_MATERIAL_KIND);
        assert_eq!(m.tint, 0xffffffff);
        assert!(m.matcap.is_none());
    }
}

mod create_normal_material {
    use super::*;
    #[test]
    fn creates_normal_material_with_unit_scale() {
        let m = create_normal_material();
        assert_eq!(m.kind, NORMAL_MATERIAL_KIND);
        assert_eq!(m.normal_scale, 1.0);
        assert!(m.normal_map.is_none());
    }
}

mod create_toon_material {
    use super::*;
    #[test]
    fn creates_toon_with_3_steps() {
        let m = create_toon_material();
        assert_eq!(m.kind, TOON_MATERIAL_KIND);
        assert_eq!(m.base_color, 0xffffffff);
        assert_eq!(m.steps, 3);
        assert!(m.ramp.is_none());
    }
}

mod create_unlit_material {
    use super::*;
    #[test]
    fn creates_white_unlit() {
        let m = create_unlit_material();
        assert_eq!(m.kind, UNLIT_MATERIAL_KIND);
        assert_eq!(m.base_color, 0xffffffff);
        assert!(m.base_color_map.is_none());
    }
}

mod create_vertex_color_material {
    use super::*;
    #[test]
    fn creates_vertex_color_with_white_tint() {
        let m = create_vertex_color_material();
        assert_eq!(m.kind, VERTEX_COLOR_MATERIAL_KIND);
        assert_eq!(m.tint, 0xffffffff);
    }
}

mod create_wireframe_material {
    use super::*;
    #[test]
    fn creates_wireframe_with_unit_thickness() {
        let m = create_wireframe_material();
        assert_eq!(m.kind, WIREFRAME_MATERIAL_KIND);
        assert_eq!(m.color, 0xffffffff);
        assert_eq!(m.thickness, 1.0);
    }
}

mod initialize_depth_material {
    use super::*;

    // D23 (I): the public construction seam of create_depth_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_depth_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_depth_material(&mut out);
        let fresh = create_depth_material();
        assert_eq!(out.kind, DEPTH_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_emissive_material {
    use super::*;

    // D23 (I): the public construction seam of create_emissive_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_emissive_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_emissive_material(&mut out);
        let fresh = create_emissive_material();
        assert_eq!(out.kind, EMISSIVE_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_matcap_material {
    use super::*;

    // D23 (I): the public construction seam of create_matcap_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_matcap_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_matcap_material(&mut out);
        let fresh = create_matcap_material();
        assert_eq!(out.kind, MATCAP_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_normal_material {
    use super::*;

    // D23 (I): the public construction seam of create_normal_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_normal_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_normal_material(&mut out);
        let fresh = create_normal_material();
        assert_eq!(out.kind, NORMAL_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_toon_material {
    use super::*;

    // D23 (I): the public construction seam of create_toon_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_toon_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_toon_material(&mut out);
        let fresh = create_toon_material();
        assert_eq!(out.kind, TOON_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_unlit_material {
    use super::*;

    // D23 (I): the public construction seam of create_unlit_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_unlit_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_unlit_material(&mut out);
        let fresh = create_unlit_material();
        assert_eq!(out.kind, UNLIT_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_vertex_color_material {
    use super::*;

    // D23 (I): the public construction seam of create_vertex_color_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_vertex_color_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_vertex_color_material(&mut out);
        let fresh = create_vertex_color_material();
        assert_eq!(out.kind, VERTEX_COLOR_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}

mod initialize_wireframe_material {
    use super::*;

    // D23 (I): the public construction seam of create_wireframe_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_wireframe_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_wireframe_material(&mut out);
        let fresh = create_wireframe_material();
        assert_eq!(out.kind, WIREFRAME_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}
