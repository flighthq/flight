use flight_materials::specular_pbr_extension::*;
use flight_materials::*;

mod create_specular_pbr_extension {
    use super::*;

    #[test]
    fn creates_with_defaults() {
        let ext = create_specular_pbr_extension(None);
        assert_eq!(ext.kind, SPECULAR_PBR_EXTENSION_KIND);
        assert_eq!(ext.specular, 1.0);
        assert_eq!(ext.specular_color, 0xffffffff);
    }
}

mod initialize_specular_pbr_extension {
    use super::*;

    #[test]
    fn sets_kind_and_defaults() {
        let mut ext = create_specular_pbr_extension(None);
        ext.specular = 0.5;
        initialize_specular_pbr_extension(&mut ext, None);
        assert_eq!(ext.kind, SPECULAR_PBR_EXTENSION_KIND);
        assert_eq!(ext.specular, 1.0);
    }
}

mod is_valid_specular_pbr_extension {
    use super::*;

    #[test]
    fn validates_default_as_valid() {
        assert!(is_valid_specular_pbr_extension(
            &create_specular_pbr_extension(None)
        ));
    }
}

mod sugar {
    use super::*;

    #[test]
    fn sugar_new_matches_free_function() {
        let free = create_specular_pbr_extension(None);
        let sugar = SpecularPbrExtension::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.specular, sugar.specular);
    }

    #[test]
    fn sugar_is_valid_matches_free_function() {
        let ext = create_specular_pbr_extension(None);
        assert_eq!(is_valid_specular_pbr_extension(&ext), ext.is_valid());
    }
}
