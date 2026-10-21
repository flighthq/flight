use flight_materials::clearcoat_pbr_extension::*;
use flight_materials::*;

mod create_clearcoat_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_clearcoat_pbr_extension(None);
        assert_eq!(ext.kind, CLEARCOAT_PBR_EXTENSION_KIND);
        assert_eq!(ext.clearcoat, 0.0);
        assert_eq!(ext.clearcoat_roughness, 0.0);
        assert_eq!(ext.clearcoat_normal_scale, 1.0);
    }
}

mod initialize_clearcoat_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_clearcoat_pbr_extension(None);
        ext.clearcoat = 0.5;
        initialize_clearcoat_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, CLEARCOAT_PBR_EXTENSION_KIND);
        assert_eq!(ext.clearcoat, 0.0);
    }
}

mod is_valid_clearcoat_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_clearcoat_pbr_extension(
            &create_clearcoat_pbr_extension(None)
        ));
    }
}

// flight-lint: allow(test-method-call) D18 sugar comparison: tests intentionally call methods to verify delegation
mod sugar {
    use super::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_clearcoat_pbr_extension(None);
        let sugar = ClearcoatPbrExtension::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.clearcoat, sugar.clearcoat);
    }

    #[test]
    fn sugar_is_valid_matches_free_function() {
        let ext = create_clearcoat_pbr_extension(None);
        assert_eq!(is_valid_clearcoat_pbr_extension(&ext), ext.is_valid());
    }
}
