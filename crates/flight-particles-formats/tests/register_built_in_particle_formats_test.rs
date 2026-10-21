use flight_particles_formats::contract::*;

fn registry() -> ParticleFormatRegistry {
    return create_particle_format_registry();
}

mod apply_particle_import_options {
    use super::*;

    #[test]
    fn installs_only_the_named_descriptors_in_list_order() {
        let mut registry = registry();
        let options = ParticleImportOptions {
            formats: Some(vec![
                get_spine_particle_format(),
                get_pixi_particle_format(),
            ]),
        };
        apply_particle_import_options(&mut registry, &options);
        assert_eq!(
            get_registered_particle_formats(&registry),
            vec![
                SPINE_PARTICLE_FORMAT_KIND.to_string(),
                PIXI_PARTICLE_FORMAT_KIND.to_string()
            ]
        );
    }

    #[test]
    fn installs_nothing_when_formats_are_omitted() {
        let mut registry = registry();
        apply_particle_import_options(&mut registry, &ParticleImportOptions { formats: None });
        assert!(get_registered_particle_formats(&registry).is_empty());
    }
}

mod create_particle_all_formats {
    use super::*;

    #[test]
    fn lists_every_built_in_kind_in_detection_order() {
        let kinds: Vec<String> = create_particle_all_formats()
            .iter()
            .map(|format| format.kind.clone())
            .collect();
        assert_eq!(
            kinds,
            vec![
                LIBGDX_PARTICLE_FORMAT_KIND.to_string(),
                STARLING_PEX_FORMAT_KIND.to_string(),
                PARTICLE_DESIGNER_FORMAT_KIND.to_string(),
                UNITY_PARTICLE_FORMAT_KIND.to_string(),
                PIXI_PARTICLE_FORMAT_KIND.to_string(),
                SPINE_PARTICLE_FORMAT_KIND.to_string(),
            ]
        );
    }
}

mod get_libgdx_particle_format {
    use super::*;

    #[test]
    fn detects_the_particle_effect_header_and_serializes() {
        let format = get_libgdx_particle_format();
        assert_eq!(format.kind, LIBGDX_PARTICLE_FORMAT_KIND);
        assert!((format.codec.detect)("Particle Effect\n"));
        assert!(format.codec.serialize.is_some());
    }
}

mod get_particle_designer_particle_format {
    use super::*;

    #[test]
    fn requires_a_plist_root_and_a_particle_designer_key() {
        let format = get_particle_designer_particle_format();
        assert_eq!(format.kind, PARTICLE_DESIGNER_FORMAT_KIND);
        assert!((format.codec.detect)(
            "<plist><dict><key>maxParticles</key><integer>1</integer></dict></plist>"
        ));
        assert!(!(format.codec.detect)(
            "<plist><dict><key>frames</key></dict></plist>"
        ));
    }
}

mod get_pixi_particle_format {
    use super::*;

    #[test]
    fn requires_pos_and_an_alpha_start_or_end_and_never_serializes() {
        let format = get_pixi_particle_format();
        assert_eq!(format.kind, PIXI_PARTICLE_FORMAT_KIND);
        assert!((format.codec.detect)(
            "{\"pos\":{},\"alpha\":{\"start\":1}}"
        ));
        assert!(!(format.codec.detect)("{\"pos\":{},\"alpha\":1}"));
        assert!(format.codec.serialize.is_none());
    }
}

mod get_spine_particle_format {
    use super::*;

    #[test]
    fn detects_continuous_or_a_low_high_range() {
        let format = get_spine_particle_format();
        assert_eq!(format.kind, SPINE_PARTICLE_FORMAT_KIND);
        assert!((format.codec.detect)("{\"continuous\":true}"));
        assert!((format.codec.detect)("{\"life\":{\"low\":1,\"high\":2}}"));
        assert!(!(format.codec.detect)("{}"));
    }
}

mod get_starling_pex_particle_format {
    use super::*;

    #[test]
    fn detects_the_pex_root_element() {
        let format = get_starling_pex_particle_format();
        assert_eq!(format.kind, STARLING_PEX_FORMAT_KIND);
        assert!((format.codec.detect)("<particleEmitterConfig/>"));
        assert!(!(format.codec.detect)("<plist/>"));
    }
}

mod get_unity_particle_format {
    use super::*;

    #[test]
    fn detects_a_min_max_curve_mode_or_gravity_modifier() {
        let format = get_unity_particle_format();
        assert_eq!(format.kind, UNITY_PARTICLE_FORMAT_KIND);
        assert!((format.codec.detect)(
            "{\"startLifetime\":{\"mode\":\"constant\"}}"
        ));
        assert!((format.codec.detect)("{\"gravityModifier\":1}"));
        assert!(!(format.codec.detect)("{}"));
    }
}

mod register_built_in_particle_formats {
    use super::*;

    #[test]
    fn installs_the_full_preset_idempotently() {
        let mut registry = registry();
        register_built_in_particle_formats(&mut registry);
        register_built_in_particle_formats(&mut registry);
        assert_eq!(get_registered_particle_formats(&registry).len(), 6);
        assert_eq!(
            detect_particle_format(&registry, "Particle Effect\n"),
            Some(LIBGDX_PARTICLE_FORMAT_KIND.to_string())
        );
    }
}
