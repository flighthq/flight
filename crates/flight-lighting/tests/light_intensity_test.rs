use flight_lighting::contract::*;

fn close(actual: f32, expected: f32, tolerance: f32) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "{actual} != {expected}"
    );
}

mod apply_light_exposure {
    use super::*;

    #[test]
    fn applies_positive_negative_and_fractional_stops() {
        assert_eq!(apply_light_exposure(3.0, 0.0), 3.0);
        assert_eq!(apply_light_exposure(3.0, 1.0), 6.0);
        assert_eq!(apply_light_exposure(3.0, -1.0), 1.5);
        close(
            apply_light_exposure(2.0, 0.5),
            2.0 * 2.0_f32.sqrt(),
            0.000_001,
        );
        close(
            apply_light_exposure(apply_light_exposure(7.0, 2.25), -2.25),
            7.0,
            0.000_01,
        );
    }
}

mod convert_light_intensity {
    use super::*;

    #[test]
    fn preserves_identity_round_trips_and_the_four_pi_relation() {
        assert_eq!(
            convert_light_intensity(LightUnit::Lux, LightUnit::Lux, 777.0),
            777.0
        );
        let lumen = convert_light_intensity(LightUnit::Candela, LightUnit::Lumen, 1.0);
        close(lumen, 4.0 * std::f32::consts::PI, 0.000_01);
        let converted = convert_light_intensity(LightUnit::Lux, LightUnit::Lumen, 123.0);
        close(
            convert_light_intensity(LightUnit::Lumen, LightUnit::Lux, converted),
            123.0,
            0.000_1,
        );
    }
}

mod get_light_linear_intensity {
    use super::*;

    #[test]
    fn uses_the_source_renderer_anchors() {
        assert_eq!(get_light_linear_intensity(LightUnit::Unitless, 6.25), 6.25);
        close(
            get_light_linear_intensity(LightUnit::Lux, 100_000.0),
            1.0,
            0.000_001,
        );
        close(
            get_light_linear_intensity(LightUnit::Candela, 1.0)
                / get_light_linear_intensity(LightUnit::Lumen, 1.0),
            4.0 * std::f32::consts::PI,
            0.000_01,
        );
    }
}

mod get_light_photometric_intensity {
    use super::*;

    #[test]
    fn reads_the_authored_unit_from_the_descriptor() {
        let sun = create_directional_light(Some(&DirectionalLightOptions {
            intensity: Some(1.0),
            intensity_unit: Some(LUX_LIGHT_UNIT),
            ..crate::directional_options()
        }));
        close(get_light_photometric_intensity(&sun), 100_000.0, 0.01);
        let plain = create_ambient_light(Some(&AmbientLightOptions {
            intensity: Some(2.5),
            ..crate::ambient_options()
        }));
        assert_eq!(get_light_photometric_intensity(&plain), 2.5);
    }
}

mod set_light_photometric_intensity {
    use super::*;

    #[test]
    fn stores_linear_intensity_and_round_trips_all_units() {
        for unit in [
            LightUnit::Unitless,
            LightUnit::Lux,
            LightUnit::Candela,
            LightUnit::Lumen,
        ] {
            let mut light = create_point_light(Some(&PointLightOptions {
                intensity: Some(0.0),
                intensity_unit: Some(unit),
                ..crate::point_options()
            }));
            set_light_photometric_intensity(&mut light, 1234.5);
            close(get_light_photometric_intensity(&light), 1234.5, 0.001);
            assert_eq!(light.intensity_unit, unit);
        }
    }
}
