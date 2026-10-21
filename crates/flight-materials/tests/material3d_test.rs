use flight_materials::material3d::*;
use flight_materials::*;

mod create_material3d {
    use super::*;

    #[test]
    fn carries_the_given_kind() {
        let m = create_material3d("TestMaterial3D".to_string(), None);
        assert_eq!(m.kind, "TestMaterial3D");
    }

    #[test]
    fn defaults_to_opaque_single_sided() {
        let m = create_material3d("TestMaterial3D".to_string(), None);
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.alpha_cutoff, 0.5);
        assert_eq!(m.blend_mode, BLEND_MODE_NORMAL);
        assert!(!m.double_sided);
    }

    #[test]
    fn forwards_trailer_fields_from_opts() {
        let opts = Material3DOptions {
            alpha_cutoff: Some(0.25),
            alpha_mode: Some(MaterialAlphaMode::Mask),
            blend_mode: None,
            double_sided: Some(true),
            name: None,
        };
        let m = create_material3d("TestMaterial3D".to_string(), Some(&opts));
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Mask);
        assert_eq!(m.alpha_cutoff, 0.25);
        assert!(m.double_sided);
    }
}

mod get_material3d_alpha_mode {
    use super::*;

    #[test]
    fn returns_the_alpha_mode() {
        let m = create_material3d("T".to_string(), None);
        assert_eq!(get_material3d_alpha_mode(&m), MaterialAlphaMode::Opaque);
    }
}

mod initialize_material3d {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut m = create_material3d("Placeholder".to_string(), None);
        initialize_material3d(&mut m, "NewKind".to_string(), None);
        assert_eq!(m.kind, "NewKind");
        assert_eq!(m.alpha_mode, MaterialAlphaMode::Opaque);
        assert_eq!(m.alpha_cutoff, 0.5);
        assert!(!m.double_sided);
    }

    #[test]
    fn applies_options() {
        let mut m = create_material3d("Placeholder".to_string(), None);
        let opts = Material3DOptions {
            alpha_cutoff: Some(0.75),
            alpha_mode: Some(MaterialAlphaMode::Blend),
            blend_mode: None,
            double_sided: Some(true),
            name: Some("test".to_string()),
        };
        initialize_material3d(&mut m, "NewKind".to_string(), Some(&opts));
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
        let mut m = create_material3d("T".to_string(), None);
        assert!(!is_material3d_blended(&m));
        m.alpha_mode = MaterialAlphaMode::Blend;
        assert!(is_material3d_blended(&m));
    }
}

mod is_material3d_masked {
    use super::*;

    #[test]
    fn returns_true_only_for_mask() {
        let mut m = create_material3d("T".to_string(), None);
        assert!(!is_material3d_masked(&m));
        m.alpha_mode = MaterialAlphaMode::Mask;
        assert!(is_material3d_masked(&m));
    }
}

mod is_material3d_opaque {
    use super::*;

    #[test]
    fn returns_true_only_for_opaque() {
        let m = create_material3d("T".to_string(), None);
        assert!(is_material3d_opaque(&m));
        let mut blended = create_material3d("T".to_string(), None);
        blended.alpha_mode = MaterialAlphaMode::Blend;
        assert!(!is_material3d_opaque(&blended));
    }
}
