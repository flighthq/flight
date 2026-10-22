use flight_particles::ParticleBlendMode;
use flight_particles_formats::contract::*;

const PIXI: &str = "{\"maxParticles\":50,\"frequency\":0.1,\"lifetime\":{\"min\":0.5,\"max\":1},\"speed\":{\"start\":100,\"end\":50},\"alpha\":{\"start\":1,\"end\":0},\"scale\":{\"start\":1,\"end\":0.5},\"angle\":{\"min\":0,\"max\":90},\"spawnCircle\":{\"r\":10},\"blendMode\":\"additive\",\"color\":{\"start\":\"ff0000\",\"end\":\"0000ff\"}}";

mod parse_pixi_particle {
    use super::*;

    #[test]
    fn maps_spawn_rate_lifetime_speed_shape_and_blend() {
        let config = parse_pixi_particle(PIXI);
        assert_eq!(config.max_particles, 50.0);
        assert_eq!(config.spawn_rate, 10.0);
        assert_eq!(config.lifetime_min, 0.5);
        assert_eq!(config.lifetime_max, 1.0);
        assert_eq!(config.speed_min, 50.0);
        assert_eq!(config.speed_max, 100.0);
        assert_eq!(format!("{:?}", config.emitter_shape), "Circle");
        assert_eq!(config.emitter_radius, 10.0);
        assert_eq!(config.blend_mode, Some(ParticleBlendMode::Add));
        assert_eq!(config.color_start_r, 1.0);
        assert_eq!(config.color_end_b, 1.0);
    }

    #[test]
    fn rejects_malformed_json_and_non_object_roots() {
        assert!(std::panic::catch_unwind(|| parse_pixi_particle("{not json")).is_err());
        assert!(std::panic::catch_unwind(|| parse_pixi_particle("42")).is_err());
    }
}

mod parse_pixi_particle_document {
    use super::*;

    #[test]
    fn reports_unsupported_bursts_acceleration_and_behaviors() {
        let json = "{\"pos\":{\"x\":0,\"y\":0},\"alpha\":{\"start\":1},\"spawnBurst\":{},\"acceleration\":{\"x\":2,\"y\":0},\"behaviors\":[]}";
        let result = parse_pixi_particle_document(json);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "pixi.spawn-burst-mapped-to-point")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "pixi.acceleration-unsupported")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "pixi.behaviors-partial")
        );
    }
}
