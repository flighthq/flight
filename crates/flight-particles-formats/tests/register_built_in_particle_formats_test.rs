use flight_particles_formats::contract::*;

fn detect_probe(kind: &str) -> String {
    return match kind {
        LIBGDX_PARTICLE_FORMAT_KIND => String::from("Particle Effect\n"),
        STARLING_PEX_FORMAT_KIND => String::from("<particleEmitterConfig/>"),
        PARTICLE_DESIGNER_FORMAT_KIND => {
            String::from("<plist><dict><key>maxParticles</key><integer>1</integer></dict></plist>")
        }
        UNITY_PARTICLE_FORMAT_KIND => String::from("{\"gravityModifier\":1}"),
        PIXI_PARTICLE_FORMAT_KIND => String::from("{\"pos\":{},\"alpha\":{\"start\":1}}"),
        _ => String::from("{\"continuous\":true}"),
    };
}

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

mod apply_particle_import_options_source_cases {
    use super::*;

    #[test]
    fn list_order_decides_detection_for_a_document_both_formats_accept() {
        let both = "{\"continuous\":true,\"startLifetime\":{\"mode\":\"TwoConstants\"}}";
        let mut first = registry();
        apply_particle_import_options(
            &mut first,
            &ParticleImportOptions {
                formats: Some(vec![
                    get_unity_particle_format(),
                    get_spine_particle_format(),
                ]),
            },
        );
        assert_eq!(
            detect_particle_format(&first, both),
            Some(UNITY_PARTICLE_FORMAT_KIND.to_string())
        );
        let mut second = registry();
        apply_particle_import_options(
            &mut second,
            &ParticleImportOptions {
                formats: Some(vec![
                    get_spine_particle_format(),
                    get_unity_particle_format(),
                ]),
            },
        );
        assert_eq!(
            detect_particle_format(&second, both),
            Some(SPINE_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn pairs_each_descriptor_with_the_kind_it_registers() {
        for format in create_particle_all_formats() {
            let mut registry = registry();
            apply_particle_import_options(
                &mut registry,
                &ParticleImportOptions {
                    formats: Some(vec![format.clone()]),
                },
            );
            assert_eq!(
                get_registered_particle_formats(&registry),
                vec![format.kind.clone()]
            );
            assert!((get_particle_format_codec(&registry, &format.kind)
                .expect("registered codec")
                .detect)(&detect_probe(&format.kind)));
        }
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

mod particle_all_formats_source_cases {
    use super::*;

    #[test]
    fn preset_installs_exactly_the_built_in_registration_in_the_same_order() {
        let mut from_preset = registry();
        apply_particle_import_options(
            &mut from_preset,
            &ParticleImportOptions {
                formats: Some(create_particle_all_formats()),
            },
        );
        let mut from_built_ins = registry();
        register_built_in_particle_formats(&mut from_built_ins);
        assert_eq!(
            get_registered_particle_formats(&from_preset),
            get_registered_particle_formats(&from_built_ins)
        );
    }

    #[test]
    fn every_row_carries_the_codec_identity_it_registers() {
        let mut registry = registry();
        register_built_in_particle_formats(&mut registry);
        for format in create_particle_all_formats() {
            assert!((get_particle_format_codec(&registry, &format.kind)
                .expect("registered codec")
                .detect)(&detect_probe(&format.kind)));
        }
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

mod register_built_in_source_cases {
    use super::*;

    #[test]
    fn installs_every_built_in_only_when_called() {
        let mut registry = registry();
        assert!(get_registered_particle_formats(&registry).is_empty());
        register_built_in_particle_formats(&mut registry);
        assert_eq!(get_registered_particle_formats(&registry).len(), 6);
    }

    #[test]
    fn exposes_pixi_as_parse_only_and_serializers_for_the_other_built_ins() {
        let mut registry = registry();
        register_built_in_particle_formats(&mut registry);
        assert!(
            get_particle_format_codec(&registry, PIXI_PARTICLE_FORMAT_KIND)
                .unwrap()
                .serialize
                .is_none()
        );
        for kind in [
            LIBGDX_PARTICLE_FORMAT_KIND,
            STARLING_PEX_FORMAT_KIND,
            PARTICLE_DESIGNER_FORMAT_KIND,
            UNITY_PARTICLE_FORMAT_KIND,
            SPINE_PARTICLE_FORMAT_KIND,
        ] {
            assert!(
                get_particle_format_codec(&registry, kind)
                    .unwrap()
                    .serialize
                    .is_some()
            );
        }
    }
}
