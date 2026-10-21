use flight_particles_formats::contract::*;

const LIBGDX: &str = "Particle Effect\n- Spark -\nmaxParticleCount: 100\n";
const PEX: &str = "<particleEmitterConfig><attribute name=\"maxParticles\" value=\"10\"/></particleEmitterConfig>";
const PLIST: &str =
    "<plist version=\"1.0\"><dict><key>maxParticles</key><integer>10</integer></dict></plist>";

fn registry() -> ParticleFormatRegistry {
    let mut registry = create_particle_format_registry();
    register_built_in_particle_formats(&mut registry);
    return registry;
}

mod detect_particle_format {
    use super::*;

    #[test]
    fn detects_each_built_in_format_by_its_registered_codec() {
        let registry = registry();
        assert_eq!(
            detect_particle_format(&registry, LIBGDX),
            Some(LIBGDX_PARTICLE_FORMAT_KIND.to_string())
        );
        assert_eq!(
            detect_particle_format(&registry, PEX),
            Some(STARLING_PEX_FORMAT_KIND.to_string())
        );
        assert_eq!(
            detect_particle_format(&registry, PLIST),
            Some(PARTICLE_DESIGNER_FORMAT_KIND.to_string())
        );
    }

    #[test]
    fn returns_none_when_no_registered_codec_recognises_the_input() {
        let registry = registry();
        assert_eq!(
            detect_particle_format(&registry, "not a particle document"),
            None
        );
        assert_eq!(
            detect_particle_format(&create_particle_format_registry(), LIBGDX),
            None
        );
    }
}
