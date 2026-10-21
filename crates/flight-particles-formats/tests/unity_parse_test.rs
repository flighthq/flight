use flight_particles_formats::contract::*;

const UNITY: &str = "{\"name\":\"spark\",\"duration\":5,\"looping\":true,\"prewarm\":true,\"maxParticles\":100,\"startLifetime\":{\"mode\":\"twoConstants\",\"constantMin\":1,\"constantMax\":2},\"startSpeed\":{\"mode\":\"constant\",\"constant\":5},\"startSize\":{\"mode\":\"constant\",\"constant\":1},\"startRotation\":{\"mode\":\"constant\",\"constant\":0},\"startColor\":{\"r\":1,\"g\":0,\"b\":0,\"a\":1},\"gravityModifier\":1,\"physicsGravity\":9.81,\"emission\":{\"rateOverTime\":{\"mode\":\"constant\",\"constant\":10},\"bursts\":[{\"time\":0,\"count\":5,\"cycleCount\":2,\"repeatInterval\":1},{\"time\":1,\"count\":2}]},\"shape\":{\"enabled\":true,\"shapeType\":\"Cone\",\"radius\":1,\"angle\":25,\"scale\":{\"x\":1,\"y\":1,\"z\":1}},\"colorOverLifetime\":{\"enabled\":false},\"sizeOverLifetime\":{\"enabled\":false},\"rotationOverLifetime\":{\"enabled\":false},\"noise\":{\"enabled\":true},\"textureSheetAnimation\":{\"enabled\":true}}";

mod parse_unity_particle {
    use super::*;

    #[test]
    fn converts_world_units_with_the_default_pixels_per_unit() {
        let config = parse_unity_particle(UNITY, None);
        assert_eq!(config.max_particles, 100.0);
        assert_eq!(config.lifetime_min, 1.0);
        assert_eq!(config.lifetime_max, 2.0);
        assert_eq!(config.speed_min, 500.0);
        assert_eq!(config.speed_max, 500.0);
        assert!((config.gravity_y - 981.0).abs() < 0.01);
        assert_eq!(format!("{:?}", config.emitter_shape), "Circle");
        assert_eq!(config.emitter_radius, 100.0);
        assert_eq!(config.burst_count, 5.0);
        assert_eq!(config.burst_interval, 1.0);
    }

    #[test]
    fn rejects_non_object_roots() {
        assert!(std::panic::catch_unwind(|| parse_unity_particle("null", None)).is_err());
    }
}

mod parse_unity_particle_document {
    use super::*;

    #[test]
    fn preserves_the_document_and_reports_modules_and_prewarm() {
        let result = parse_unity_particle_document(UNITY, None);
        assert_eq!(result.document.name, "spark");
        assert_eq!(result.document.emission.bursts.len(), 2);
        let modules = result
            .diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.kind == "unity.module-unsupported")
            .count();
        assert_eq!(modules, 2);
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "unity.prewarm-unsupported")
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "unity.extra-bursts-unsupported")
        );
        assert!(
            !result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.kind == "unity.start-rotation-unsupported")
        );
    }
}
