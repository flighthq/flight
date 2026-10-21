use flight_materials::custom_shader_material::*;
use flight_materials::*;

mod create_custom_shader_material {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let m = create_custom_shader_material(None);
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
