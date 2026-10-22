use flight_materials::custom_shader_material::*;
use flight_materials::*;

mod create_custom_shader_material {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let m = create_custom_shader_material();
        assert_eq!(m.kind, CUSTOM_SHADER_MATERIAL_KIND);
        assert_eq!(m.alpha_cutoff, 0.5);
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.blend_mode, BLEND_MODE_NORMAL);
        assert!(!m.double_sided);
        assert!(m.shader_key.is_empty());
        assert!(m.textures.is_none());
        assert!(m.uniforms.is_none());
    }
}

mod initialize_custom_shader_material {
    use super::*;

    // D23 (I): the public construction seam of create_custom_shader_material. It writes the source defaults over an
    // existing allocation and keeps the receiver's entity identity (D12).
    #[test]
    fn writes_the_source_defaults_and_keeps_the_receivers_identity() {
        let mut out = create_custom_shader_material();
        let id = flight_entity::get_entity_id(&out);
        out.kind = "Changed".to_string();
        out.name = Some("changed".to_string());
        out.alpha_mode = MaterialAlphaMode::Blend;
        out.alpha_cutoff = 0.9;
        out.double_sided = true;
        initialize_custom_shader_material(&mut out);
        let fresh = create_custom_shader_material();
        assert_eq!(out.kind, CUSTOM_SHADER_MATERIAL_KIND);
        assert_eq!(out.name, None);
        assert_eq!(out.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(out.alpha_cutoff, fresh.alpha_cutoff);
        assert_eq!(out.double_sided, false);
        assert_eq!(flight_entity::get_entity_id(&out), id);
    }
}
