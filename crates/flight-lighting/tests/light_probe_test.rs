use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_geometry::{create_aabb, create_vector3};
use flight_lighting::contract::*;

const AXIS_DIRECTIONS: [f32; 18] = [
    1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -1.0,
];

fn close(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() < 0.000_1,
        "{actual} != {expected}"
    );
}

fn tagged_probe(value: f32) -> Ref<LightProbe> {
    let mut probe = create_light_probe(&create_vector3(0.0, 0.0, 0.0), None);
    probe.sh_coefficients[0] = value;
    return Arc::new(RwLock::new(probe));
}

fn unit_cube_grid() -> LightProbeGrid {
    let probes: Vec<_> = (0..8).map(|value| tagged_probe(value as f32)).collect();
    return create_light_probe_grid(
        &probes,
        &create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0),
        &create_vector3(2.0, 2.0, 2.0),
    );
}

fn sample_tag(grid: &LightProbeGrid, x: f32, y: f32, z: f32) -> f32 {
    let mut out = [0.0; LIGHT_PROBE_SH_FLOATS];
    assert!(sample_light_probe_grid(
        &mut out,
        &create_vector3(x, y, z),
        grid
    ));
    return out[0];
}

mod create_light_probe {
    use super::*;

    #[test]
    fn copies_position_and_coefficients_with_zero_defaults() {
        let position = create_vector3(1.0, 2.0, 3.0);
        let mut coefficients = [0.0; LIGHT_PROBE_SH_FLOATS];
        coefficients[4] = 9.0;
        let probe = create_light_probe(&position, Some(&coefficients));
        coefficients[4] = 0.0;
        assert_eq!(coefficients[4], 0.0);
        assert_eq!(probe.position, position);
        assert!(probe.enabled);
        assert_eq!(probe.sh_coefficients.len(), LIGHT_PROBE_SH_FLOATS);
        assert_eq!(probe.sh_coefficients[4], 9.0);
        assert!(
            create_light_probe(&position, None)
                .sh_coefficients
                .iter()
                .all(|value| *value == 0.0)
        );
    }

    #[test]
    fn rejects_wrong_coefficient_length() {
        let result = std::panic::catch_unwind(|| {
            create_light_probe(&create_vector3(0.0, 0.0, 0.0), Some(&[0.0; 9]));
        });
        assert!(result.is_err());
    }
}

mod create_light_probe_grid {
    use super::*;

    #[test]
    fn copies_bounds_and_resolution_but_shares_probe_identities() {
        let probe = tagged_probe(1.0);
        let probes = vec![probe.clone()];
        let mut bounds = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let grid = create_light_probe_grid(&probes, &bounds, &create_vector3(1.0, 1.0, 1.0));
        bounds.max.x = 99.0;
        probe.write().unwrap().sh_coefficients[0] = 7.0;
        assert_eq!(grid.bounds.max.x, 2.0);
        assert_eq!(sample_tag(&grid, 0.5, 0.5, 0.5), 7.0);
    }

    #[test]
    fn validates_probe_count_and_accepts_zero_resolution() {
        let bounds = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            create_light_probe_grid(
                &[tagged_probe(0.0)],
                &bounds,
                &create_vector3(2.0, 2.0, 2.0),
            );
        }));
        assert!(result.is_err());
        assert!(
            create_light_probe_grid(&[], &bounds, &create_vector3(0.0, 0.0, 0.0))
                .probes
                .is_empty()
        );
    }
}

mod evaluate_light_probe_sh {
    use super::*;

    #[test]
    fn evaluates_constant_directional_normalized_and_zero_normal_cases() {
        let mut coefficients = [0.0; LIGHT_PROBE_SH_FLOATS];
        coefficients[0] = 1.0;
        coefficients[1] = 2.0;
        coefficients[2] = 4.0;
        coefficients[9] = 1.0;
        let mut positive = [0.0; 3];
        let mut long = [0.0; 3];
        evaluate_light_probe_sh(&mut positive, &create_vector3(1.0, 0.0, 0.0), &coefficients);
        evaluate_light_probe_sh(&mut long, &create_vector3(50.0, 0.0, 0.0), &coefficients);
        assert_eq!(positive, long);
        close(positive[0], 0.282_094_8 + 0.488_602_52);
        close(positive[1], 0.564_189_6);
        let mut negative = [0.0; 3];
        evaluate_light_probe_sh(
            &mut negative,
            &create_vector3(-1.0, 0.0, 0.0),
            &coefficients,
        );
        close(negative[0], 0.282_094_8 - 0.488_602_52);
        let mut zero = [7.0; 3];
        evaluate_light_probe_sh(&mut zero, &create_vector3(0.0, 0.0, 0.0), &coefficients);
        assert_eq!(zero, [0.0; 3]);
    }

    #[test]
    fn reads_all_source_coefficients_before_writing_out() {
        let mut coefficients = [0.0; LIGHT_PROBE_SH_FLOATS];
        coefficients[0] = 1.0;
        coefficients[1] = 2.0;
        coefficients[2] = 4.0;
        let source = coefficients;
        evaluate_light_probe_sh(&mut coefficients, &create_vector3(1.0, 0.0, 0.0), &source);
        close(coefficients[0], 0.282_094_8);
        close(coefficients[1], 0.564_189_6);
        close(coefficients[2], 1.128_379_2);
    }
}

mod initialize_light_probe {
    use super::*;

    #[test]
    fn resets_an_existing_probe_and_validates_length() {
        let mut out = create_light_probe(&create_vector3(9.0, 9.0, 9.0), None);
        initialize_light_probe(&mut out, &create_vector3(4.0, 5.0, 6.0), None);
        assert_eq!(out.position, create_vector3(4.0, 5.0, 6.0));
        assert!(out.sh_coefficients.iter().all(|value| *value == 0.0));
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            initialize_light_probe(&mut out, &create_vector3(0.0, 0.0, 0.0), Some(&[0.0; 26]));
        }));
        assert!(result.is_err());
    }
}

mod initialize_light_probe_grid {
    use super::*;

    #[test]
    fn resets_grid_shape_and_rejects_mismatch() {
        let probes = vec![tagged_probe(1.0), tagged_probe(2.0)];
        let bounds = create_aabb(0.0, 0.0, 0.0, 2.0, 2.0, 2.0);
        let mut grid = create_light_probe_grid(
            &[],
            &create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0),
            &create_vector3(0.0, 0.0, 0.0),
        );
        initialize_light_probe_grid(&mut grid, &probes, &bounds, &create_vector3(2.0, 1.0, 1.0));
        assert_eq!(grid.probes.len(), 2);
        assert_eq!(grid.bounds.max.x, 2.0);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            initialize_light_probe_grid(
                &mut grid,
                &probes,
                &bounds,
                &create_vector3(3.0, 1.0, 1.0),
            );
        }));
        assert!(result.is_err());
    }
}

mod sample_light_probe_grid {
    use super::*;

    #[test]
    fn interpolates_corners_edges_center_and_clamped_positions() {
        let grid = unit_cube_grid();
        close(sample_tag(&grid, 0.0, 0.0, 0.0), 0.0);
        close(sample_tag(&grid, 1.0, 1.0, 1.0), 7.0);
        close(sample_tag(&grid, 0.5, 0.0, 0.0), 0.5);
        close(sample_tag(&grid, 0.0, 0.0, 0.5), 2.0);
        close(sample_tag(&grid, 0.5, 0.5, 0.5), 3.5);
        close(sample_tag(&grid, -50.0, -50.0, -50.0), 0.0);
        close(sample_tag(&grid, 50.0, 50.0, 50.0), 7.0);
        close(sample_tag(&grid, f32::NAN, 0.0, 0.0), 0.0);
    }

    #[test]
    fn handles_resolution_one_and_degenerate_inner_axes() {
        let bounds = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let line = create_light_probe_grid(
            &[tagged_probe(10.0), tagged_probe(20.0)],
            &bounds,
            &create_vector3(2.0, 1.0, 1.0),
        );
        close(sample_tag(&line, 0.5, 0.5, 0.5), 15.0);
        let planes = create_light_probe_grid(
            &[
                tagged_probe(10.0),
                tagged_probe(20.0),
                tagged_probe(30.0),
                tagged_probe(40.0),
            ],
            &bounds,
            &create_vector3(2.0, 1.0, 2.0),
        );
        close(sample_tag(&planes, 0.5, 0.5, 0.0), 15.0);
        close(sample_tag(&planes, 0.5, 0.5, 1.0), 35.0);
    }

    #[test]
    fn renormalizes_disabled_corners_and_leaves_output_on_failure() {
        let bounds = create_aabb(0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        let first = tagged_probe(10.0);
        let second = tagged_probe(20.0);
        let mut grid = create_light_probe_grid(
            &[first.clone(), second.clone()],
            &bounds,
            &create_vector3(2.0, 1.0, 1.0),
        );
        second.write().unwrap().enabled = false;
        close(sample_tag(&grid, 0.5, 0.0, 0.0), 10.0);
        first.write().unwrap().enabled = false;
        let mut out = [-1.0; LIGHT_PROBE_SH_FLOATS];
        assert!(!sample_light_probe_grid(
            &mut out,
            &create_vector3(0.5, 0.0, 0.0),
            &grid
        ));
        assert_eq!(out[0], -1.0);
        grid.enabled = false;
        assert!(!sample_light_probe_grid(
            &mut out,
            &create_vector3(0.0, 0.0, 0.0),
            &grid
        ));
    }
}

mod set_light_probe_sh_from_colors {
    use super::*;

    #[test]
    fn projects_constant_color_and_linear_gradient() {
        let mut colors = [0.0; 18];
        for sample in 0..6 {
            colors[sample * 3] = 2.0;
            colors[sample * 3 + 1] = 3.0;
            colors[sample * 3 + 2] = 4.0;
        }
        let mut probe = create_light_probe(&create_vector3(0.0, 0.0, 0.0), None);
        set_light_probe_sh_from_colors(&mut probe, &colors, &AXIS_DIRECTIONS);
        let mut out = [0.0; 3];
        evaluate_light_probe_sh(
            &mut out,
            &create_vector3(1.0, 0.0, 0.0),
            &probe.sh_coefficients,
        );
        close(out[0], 2.0);
        close(out[1], 3.0);
        close(out[2], 4.0);

        let gradient = [
            1.5, 1.5, 1.5, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
            1.0,
        ];
        set_light_probe_sh_from_colors(&mut probe, &gradient, &AXIS_DIRECTIONS);
        evaluate_light_probe_sh(
            &mut out,
            &create_vector3(1.0, 0.0, 0.0),
            &probe.sh_coefficients,
        );
        close(out[0], 1.5);
        evaluate_light_probe_sh(
            &mut out,
            &create_vector3(-1.0, 0.0, 0.0),
            &probe.sh_coefficients,
        );
        close(out[0], 0.5);
    }

    #[test]
    fn replaces_previous_data_zeroes_empty_and_skips_zero_direction() {
        let mut probe = create_light_probe(&create_vector3(0.0, 0.0, 0.0), None);
        set_light_probe_sh_from_colors(&mut probe, &[1.0, 1.0, 1.0], &[1.0, 0.0, 0.0]);
        let first = probe.sh_coefficients.clone();
        set_light_probe_sh_from_colors(&mut probe, &[1.0, 1.0, 1.0], &[1.0, 0.0, 0.0]);
        assert_eq!(probe.sh_coefficients, first);
        set_light_probe_sh_from_colors(&mut probe, &[], &[]);
        assert!(probe.sh_coefficients.iter().all(|value| *value == 0.0));
        set_light_probe_sh_from_colors(
            &mut probe,
            &[1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
        );
        assert!(probe.sh_coefficients.iter().all(|value| value.is_finite()));
        assert_ne!(probe.sh_coefficients[0], 0.0);
    }
}
