use flight_particles_formats::contract::*;

const PLIST_SNIPPET: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<plist version=\"1.0\">\n<dict>\n  <key>maxParticles</key><integer>200</integer>\n</dict>\n</plist>";
const SPINE_JSON: &str = "{\"name\":\"spark\",\"continuous\":true,\"emission\":{\"low\":10,\"high\":30},\"life\":{\"low\":500,\"high\":1500}}";
const UNITY_JSON: &str = "{\"name\":\"smoke\",\"looping\":true,\"startLifetime\":{\"mode\":\"twoConstants\",\"constantMin\":1.0,\"constantMax\":2.5},\"gravityModifier\":0.1}";
const LIBGDX_SNIPPET: &str = "Particle Effect\n- Spark -\nmaxParticleCount: 50\nadditive: true\n";
const STARLING_PEX_SNIPPET: &str = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<particleEmitterConfig>\n  <attribute name=\"maxParticles\" value=\"200\"/>\n</particleEmitterConfig>";
const PIXI_JSON: &str = "{\"pos\":{\"x\":0,\"y\":0},\"alpha\":{\"start\":1,\"end\":0},\"speed\":{\"start\":100,\"end\":50},\"lifetime\":{\"min\":0.5,\"max\":1.5},\"maxParticles\":500}";

fn registry() -> ParticleFormatRegistry {
    let mut registry = create_particle_format_registry();
    register_built_in_particle_formats(&mut registry);
    return registry;
}

fn detected(text: &str) -> Option<String> {
    return detect_particle_format(&registry(), text);
}

mod detect_particle_format {
    use super::*;

    #[test]
    fn detects_libgdx_by_its_first_line() {
        assert_eq!(
            detected(LIBGDX_SNIPPET),
            Some(LIBGDX_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_libgdx_with_leading_whitespace() {
        assert_eq!(
            detected("  \nParticle Effect\n- Emitter -\n"),
            Some(LIBGDX_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_particle_designer_plist_by_the_plist_tag() {
        assert_eq!(
            detected(PLIST_SNIPPET),
            Some(PARTICLE_DESIGNER_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_particle_designer_plist_with_leading_whitespace() {
        assert_eq!(
            detected(&format!("  \n{}", PLIST_SNIPPET)),
            Some(PARTICLE_DESIGNER_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_pixi_json_by_pos_and_alpha_range() {
        assert_eq!(
            detected(PIXI_JSON),
            Some(PIXI_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_spine_json_by_continuous_boolean() {
        assert_eq!(
            detected(SPINE_JSON),
            Some(SPINE_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_spine_json_by_emission_range_object() {
        let json = "{\"emission\":{\"low\":10,\"high\":30},\"life\":{\"low\":500,\"high\":1500}}";
        assert_eq!(detected(json), Some(SPINE_PARTICLE_FORMAT_KIND.to_string()));
    }

    #[test]
    fn detects_starling_pex_by_its_root_element() {
        assert_eq!(
            detected(STARLING_PEX_SNIPPET),
            Some(STARLING_PEX_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_unity_json_by_start_lifetime_mode() {
        assert_eq!(
            detected(UNITY_JSON),
            Some(UNITY_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_unity_json_by_gravity_modifier() {
        assert_eq!(
            detected("{\"gravityModifier\":0.5}"),
            Some(UNITY_PARTICLE_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn detects_unity_json_by_looping_and_start_lifetime() {
        let json = "{\"looping\":true,\"startLifetime\":{\"mode\":\"constant\",\"constant\":1}}";
        assert_eq!(detected(json), Some(UNITY_PARTICLE_FORMAT_KIND.to_string()));
    }

    #[test]
    fn returns_none_for_garbage_input() {
        assert_eq!(detected("not a particle file at all"), None);
    }

    #[test]
    fn returns_none_for_empty_string() {
        assert_eq!(detected(""), None);
    }

    #[test]
    fn returns_none_for_valid_json_matching_no_format() {
        assert_eq!(detected("{\"foo\":\"bar\",\"baz\":42}"), None);
    }

    #[test]
    fn returns_none_for_a_json_array() {
        assert_eq!(detected("[1,2,3]"), None);
    }

    #[test]
    fn returns_none_for_xml_that_is_not_plist_or_pex() {
        assert_eq!(detected("<svg width=\"100\"><circle/></svg>"), None);
    }

    #[test]
    fn does_not_detect_a_built_in_format_after_its_codec_is_unregistered() {
        let mut registry = registry();
        unregister_particle_format(&mut registry, PIXI_PARTICLE_FORMAT_KIND);
        assert_eq!(detect_particle_format(&registry, PIXI_JSON), None);
    }
}
