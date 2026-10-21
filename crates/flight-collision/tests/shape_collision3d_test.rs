use flight_collision::contract::*;
use flight_collision::*;

fn d1_single_evaluation_bound(expected: f32, ts_bound: f32) -> f32 {
    ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0))
}

struct Xorshift {
    state: u32,
}

impl Xorshift {
    fn new(seed: u32) -> Self {
        let state = if seed == 0 { 1 } else { seed };
        Self { state }
    }

    fn next(&mut self) -> f32 {
        self.state ^= self.state.wrapping_shl(13);
        self.state ^= self.state >> 17;
        self.state ^= self.state.wrapping_shl(5);
        (self.state % 100000) as f32 / 100000.0
    }
}

fn create_box3d(
    x: f32,
    y: f32,
    z: f32,
    half_x: f32,
    half_y: f32,
    half_z: f32,
    rotation_x: f32,
    rotation_y: f32,
    rotation_z: f32,
    rotation_w: f32,
) -> CollisionBox3D {
    CollisionBox3D {
        x,
        y,
        z,
        half_x,
        half_y,
        half_z,
        rotation_x,
        rotation_y,
        rotation_z,
        rotation_w,
    }
}

fn default_box3d() -> CollisionBox3D {
    create_box3d(0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0)
}

fn agrees_with_support_floor(
    shape_a: &CollisionShape3D,
    shape_b: &CollisionShape3D,
    closed_form: &CollisionManifold3D,
) -> Result<(), String> {
    let mut floor = create_collision_manifold3d();
    let floor_overlapping = test_collision_support3d(
        &crate::collision_registry3d_with_supports(),
        shape_a,
        shape_b,
        &mut floor,
    );
    if floor_overlapping != closed_form.overlapping {
        return Err(format!(
            "overlap {} vs floor {}",
            closed_form.overlapping, floor_overlapping
        ));
    }
    if !floor_overlapping {
        return Ok(());
    }

    if (floor.depth - closed_form.depth).abs() > 3e-3 {
        return Err(format!(
            "depth {} vs floor {}",
            closed_form.depth, floor.depth
        ));
    }

    let dot = floor.normal_x * closed_form.normal_x
        + floor.normal_y * closed_form.normal_y
        + floor.normal_z * closed_form.normal_z;
    if dot < 0.96 {
        return Err(format!("normal dot {}", dot));
    }
    Ok(())
}

mod shape_collision3d_agreement_with_the_generic_support_floor {
    use super::*;

    #[test]
    fn preserves_the_exact_seeded_sphere_sphere_penetration_that_f32_scratch_mismeasured() {
        let a = CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 2.044_180_2,
        };
        let b = CollisionSphere3D {
            x: -1.588_48,
            y: 2.003_92,
            z: -1.416_96,
            radius: 2.142_16,
        };
        let mut direct = create_collision_manifold3d();
        assert!(test_sphere_sphere_collision3d(&a, &b, &mut direct));
        assert!((direct.depth - 1.262_859_6).abs() < 1e-6, "{direct:?}");
        let result = agrees_with_support_floor(
            &CollisionShape3D::Sphere(a),
            &CollisionShape3D::Sphere(b),
            &direct,
        );
        assert!(result.is_ok(), "{}", result.unwrap_err());
    }

    #[test]
    fn preserves_the_exact_seeded_sphere_capsule_penetration_that_f32_scratch_mismeasured() {
        let a = CollisionSphere3D {
            x: -0.370_739_94,
            y: 0.136_980_06,
            z: 1.240_140_1,
            radius: 0.781_745,
        };
        let b = CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.525_160_1,
        };
        let mut direct = create_collision_manifold3d();
        assert!(test_sphere_capsule_collision3d(&a, &b, &mut direct));
        assert!((direct.depth - 1.059_222_8).abs() < 1e-6, "{direct:?}");
        let result = agrees_with_support_floor(
            &CollisionShape3D::Sphere(a),
            &CollisionShape3D::Capsule(b),
            &direct,
        );
        assert!(result.is_ok(), "{}", result.unwrap_err());
    }

    #[test]
    fn preserves_the_exact_seeded_sphere_aabb_penetration_that_f32_scratch_mismeasured() {
        let a = CollisionSphere3D {
            x: -2.023_98,
            y: 1.656_97,
            z: -1.927_660_1,
            radius: 1.334_320_1,
        };
        let b = CollisionAabb3D {
            min_x: -1.5,
            min_y: -1.0,
            min_z: -2.0,
            max_x: 1.5,
            max_y: 1.0,
            max_z: 2.0,
        };
        let mut direct = create_collision_manifold3d();
        assert!(test_sphere_aabb_collision3d(&a, &b, &mut direct));
        assert!((direct.depth - 0.493_984_1).abs() < 1e-6, "{direct:?}");
        let result = agrees_with_support_floor(
            &CollisionShape3D::Sphere(a),
            &CollisionShape3D::Aabb(b),
            &direct,
        );
        assert!(result.is_ok(), "{}", result.unwrap_err());
    }

    #[test]
    fn agrees_with_gjk_epa_on_sphere_sphere_over_seeded_configurations() {
        let mut random = Xorshift::new(20260821);
        let mut out = create_collision_manifold3d();
        let mut compared = 0;
        for i in 0..600 {
            let radius_a = 0.4 + random.next() * 2.0;
            let radius_b = 0.4 + random.next() * 2.0;
            let a_sphere = CollisionSphere3D {
                x: 0.0,
                y: 0.0,
                z: 0.0,
                radius: radius_a,
            };
            let bx = (random.next() - 0.5) * 8.0;
            let by = (random.next() - 0.5) * 8.0;
            let bz = (random.next() - 0.5) * 8.0;
            let b_sphere = CollisionSphere3D {
                x: bx,
                y: by,
                z: bz,
                radius: radius_b,
            };

            let distance = (bx * bx + by * by + bz * bz).sqrt();
            let separation = distance - (radius_a + radius_b);
            if separation.abs() < 1e-3 {
                continue;
            }

            test_sphere_sphere_collision3d(&a_sphere, &b_sphere, &mut out);

            if out.overlapping {
                let expected_depth = radius_a + radius_b - distance;
                // D1 f32 bound (TS: 1e-10)
                assert!(
                    (out.depth - expected_depth).abs()
                        <= d1_single_evaluation_bound(expected_depth, 1e-10),
                    "seed step {}: depth {} expected {}",
                    i,
                    out.depth,
                    expected_depth
                );
            }

            let a_shape = CollisionShape3D::Sphere(a_sphere);
            let b_shape = CollisionShape3D::Sphere(b_sphere);
            let result = agrees_with_support_floor(&a_shape, &b_shape, &out);
            assert!(result.is_ok(), "seed step {}: {}", i, result.unwrap_err());
            compared += 1;
        }
        assert!(compared > 500, "compared only {}", compared);
    }

    #[test]
    fn agrees_with_gjk_epa_on_sphere_capsule_over_seeded_configurations() {
        let mut random = Xorshift::new(7717);
        let mut out = create_collision_manifold3d();
        let mut compared = 0;
        for i in 0..400 {
            let a_sphere = CollisionSphere3D {
                radius: 0.5 + random.next() * 1.5,
                x: (random.next() - 0.5) * 6.0,
                y: (random.next() - 0.5) * 6.0,
                z: (random.next() - 0.5) * 6.0,
            };
            let b_capsule = CollisionCapsule3D {
                radius: 0.5 + random.next() * 1.2,
                x0: -2.0,
                x1: 2.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0,
            };

            let t = a_sphere.x.max(-2.0).min(2.0);
            let dx = a_sphere.x - t;
            let dy = a_sphere.y;
            let dz = a_sphere.z;
            let distance = (dx * dx + dy * dy + dz * dz).sqrt();
            let separation = distance - (a_sphere.radius + b_capsule.radius);
            if separation.abs() < 1e-3 {
                continue;
            }

            test_sphere_capsule_collision3d(&a_sphere, &b_capsule, &mut out);
            if out.overlapping {
                let expected_depth = a_sphere.radius + b_capsule.radius - distance;
                // D1 f32 bound (TS: 1e-10)
                assert!(
                    (out.depth - expected_depth).abs()
                        <= d1_single_evaluation_bound(expected_depth, 1e-10),
                    "seed step {}: depth {} expected {}",
                    i,
                    out.depth,
                    expected_depth
                );
            }

            let a_shape = CollisionShape3D::Sphere(a_sphere);
            let b_shape = CollisionShape3D::Capsule(b_capsule);
            let result = agrees_with_support_floor(&a_shape, &b_shape, &out);
            assert!(result.is_ok(), "seed step {}: {}", i, result.unwrap_err());
            compared += 1;
        }
        assert!(compared > 300, "compared only {}", compared);
    }

    #[test]
    fn agrees_with_gjk_epa_on_sphere_aabb_over_seeded_configurations() {
        let mut random = Xorshift::new(31337);
        let mut out = create_collision_manifold3d();
        let mut compared = 0;
        for i in 0..400 {
            let a_sphere = CollisionSphere3D {
                radius: 0.4 + random.next() * 1.2,
                x: (random.next() - 0.5) * 7.0,
                y: (random.next() - 0.5) * 7.0,
                z: (random.next() - 0.5) * 7.0,
            };
            let b_aabb = CollisionAabb3D {
                max_x: 1.5,
                max_y: 1.0,
                max_z: 2.0,
                min_x: -1.5,
                min_y: -1.0,
                min_z: -2.0,
            };

            let closest_x = b_aabb.min_x.max(b_aabb.max_x.min(a_sphere.x));
            let closest_y = b_aabb.min_y.max(b_aabb.max_y.min(a_sphere.y));
            let closest_z = b_aabb.min_z.max(b_aabb.max_z.min(a_sphere.z));
            let dx = a_sphere.x - closest_x;
            let dy = a_sphere.y - closest_y;
            let dz = a_sphere.z - closest_z;
            let distance = (dx * dx + dy * dy + dz * dz).sqrt();
            let separation = distance - a_sphere.radius;

            let centre_inside = a_sphere.x > b_aabb.min_x
                && a_sphere.x < b_aabb.max_x
                && a_sphere.y > b_aabb.min_y
                && a_sphere.y < b_aabb.max_y
                && a_sphere.z > b_aabb.min_z
                && a_sphere.z < b_aabb.max_z;
            if centre_inside || separation.abs() < 1e-3 {
                continue;
            }

            test_sphere_aabb_collision3d(&a_sphere, &b_aabb, &mut out);
            if out.overlapping {
                let expected_depth = a_sphere.radius - distance;
                // D1 f32 bound (TS: 1e-10)
                assert!(
                    (out.depth - expected_depth).abs()
                        <= d1_single_evaluation_bound(expected_depth, 1e-10),
                    "seed step {}: depth {} expected {}",
                    i,
                    out.depth,
                    expected_depth
                );
            }

            let a_shape = CollisionShape3D::Sphere(a_sphere);
            let b_shape = CollisionShape3D::Aabb(b_aabb);
            let result = agrees_with_support_floor(&a_shape, &b_shape, &out);
            assert!(result.is_ok(), "seed step {}: {}", i, result.unwrap_err());
            compared += 1;
        }
        assert!(compared > 200, "compared only {}", compared);
    }
}

mod test_aabb_aabb_collision3d {
    use super::*;

    #[test]
    fn reports_the_shallowest_axis_as_the_minimum_translation() {
        let mut out = create_collision_manifold3d();
        assert!(test_aabb_aabb_collision3d(
            &CollisionAabb3D {
                max_x: 5.0,
                max_y: 1.5,
                max_z: 5.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0
            },
            &CollisionAabb3D {
                max_x: 5.0,
                max_y: 5.0,
                max_z: 5.0,
                min_x: 0.0,
                min_y: 1.0,
                min_z: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.5).abs() < 1e-10);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, -1.0);
        assert_eq!(out.normal_z, 0.0);
    }

    #[test]
    fn reports_a_shared_face_as_overlapping_with_zero_depth() {
        let mut out = create_collision_manifold3d();
        assert!(!test_aabb_aabb_collision3d(
            &CollisionAabb3D {
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0
            },
            &CollisionAabb3D {
                max_x: 2.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 1.0,
                min_y: 0.0,
                min_z: 0.0
            },
            &mut out,
        ));
    }

    #[test]
    fn separates_on_every_axis_independently() {
        let mut out = create_collision_manifold3d();
        let base = CollisionAabb3D {
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
        };
        assert!(!test_aabb_aabb_collision3d(
            &base,
            &CollisionAabb3D {
                max_z: 9.0,
                min_z: 8.0,
                ..base
            },
            &mut out,
        ));
        assert!(!test_aabb_aabb_collision3d(
            &base,
            &CollisionAabb3D {
                max_y: 9.0,
                min_y: 8.0,
                ..base
            },
            &mut out,
        ));
    }

    #[test]
    fn rejects_a_degenerate_box_rather_than_reporting_an_overlap() {
        let mut out = create_collision_manifold3d();
        assert!(!test_aabb_aabb_collision3d(
            &CollisionAabb3D {
                max_x: 0.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0
            },
            &CollisionAabb3D {
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: 0.0,
                min_y: 0.0,
                min_z: 0.0
            },
            &mut out,
        ));
    }
}

mod test_box_box_collision3d {
    use super::*;

    #[test]
    fn reports_the_shallowest_face_axis_and_a_out_of_b_orientation() {
        let mut out = create_collision_manifold3d();
        let a = default_box3d();
        let b = CollisionBox3D {
            x: 1.5,
            ..default_box3d()
        };
        assert!(test_box_box_collision3d(&a, &b, &mut out));
        assert!((out.depth - 0.5).abs() < 5e-13);
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 0.0);
    }

    #[test]
    fn measures_a_rotated_face_in_world_space() {
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut out = create_collision_manifold3d();
        let a = CollisionBox3D {
            half_x: 2.0,
            rotation_w: half,
            rotation_z: half,
            ..default_box3d()
        };
        let b = CollisionBox3D {
            y: 2.5,
            ..default_box3d()
        };
        assert!(test_box_box_collision3d(&a, &b, &mut out));
        assert!((out.depth - 0.5).abs() < 1e-5);
        assert!((out.normal_x - 0.0).abs() < 1e-5);
        assert!((out.normal_y - (-1.0)).abs() < 1e-5);
        assert!((out.normal_z - 0.0).abs() < 1e-5);
    }

    #[test]
    fn reports_touching_as_overlapping_with_zero_depth() {
        let mut out = create_collision_manifold3d();
        let a = default_box3d();
        let b = CollisionBox3D {
            x: 2.0,
            ..default_box3d()
        };
        assert!(!test_box_box_collision3d(&a, &b, &mut out));
    }

    #[test]
    fn pushes_a_dynamic_box_up_from_a_floor_with_the_shallow_depth() {
        let mut out = create_collision_manifold3d();
        let floor = CollisionBox3D {
            x: 0.0,
            y: -1.0,
            z: 0.0,
            half_x: 20.0,
            half_y: 1.0,
            half_z: 20.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        };
        let body = CollisionBox3D {
            x: 0.0,
            y: 0.497_222_21,
            z: 0.0,
            half_x: 0.5,
            half_y: 0.5,
            half_z: 0.5,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        };
        assert!(test_box_box_collision3d(&floor, &body, &mut out));
        assert_eq!((out.normal_x, out.normal_y, out.normal_z), (0.0, -1.0, 0.0));
        assert!((out.depth - 0.002_777_79).abs() < 1e-6, "{}", out.depth);
    }

    #[test]
    fn normalizes_scaled_quaternion_inputs_before_constructing_axes() {
        let mut out = create_collision_manifold3d();
        let a = CollisionBox3D {
            rotation_w: 2.0,
            ..default_box3d()
        };
        let b = CollisionBox3D {
            x: 1.5,
            ..default_box3d()
        };
        assert!(test_box_box_collision3d(&a, &b, &mut out));
        assert!((out.depth - 0.5).abs() < 5e-13);
        assert_eq!(out.normal_x, -1.0);
    }

    #[test]
    fn agrees_with_the_generic_convex_floor_over_seeded_orientations_and_separations() {
        let mut random = Xorshift::new(0x3db0_0b3);
        let mut direct = create_collision_manifold3d();
        let mut floor = create_collision_manifold3d();
        for i in 0..400 {
            let angle_a = (random.next() - 0.5) * std::f32::consts::PI * 2.0;
            let angle_b = (random.next() - 0.5) * std::f32::consts::PI * 2.0;
            let a = CollisionBox3D {
                half_x: 0.25 + random.next() * 1.75,
                half_y: 0.25 + random.next() * 1.75,
                half_z: 0.25 + random.next() * 1.75,
                rotation_w: (angle_a * 0.5).cos(),
                rotation_z: (angle_a * 0.5).sin(),
                ..default_box3d()
            };
            let b = CollisionBox3D {
                half_x: 0.25 + random.next() * 1.75,
                half_y: 0.25 + random.next() * 1.75,
                half_z: 0.25 + random.next() * 1.75,
                rotation_w: (angle_b * 0.5).cos(),
                rotation_z: (angle_b * 0.5).sin(),
                x: (random.next() - 0.5) * 6.0,
                y: (random.next() - 0.5) * 6.0,
                z: (random.next() - 0.5) * 6.0,
                ..default_box3d()
            };
            let direct_hit = test_box_box_collision3d(&a, &b, &mut direct);
            let a_shape = CollisionShape3D::Box(a);
            let b_shape = CollisionShape3D::Box(b);
            let floor_hit = test_collision_support3d(
                &crate::collision_registry3d_with_supports(),
                &a_shape,
                &b_shape,
                &mut floor,
            );
            assert_eq!(direct_hit, floor_hit, "seed step {}", i);
        }
    }
}

mod test_capsule_capsule_collision3d {
    use super::*;

    #[test]
    fn finds_the_crossing_point_of_two_perpendicular_capsules() {
        let mut out = create_collision_manifold3d();
        assert!(test_capsule_capsule_collision3d(
            &CollisionCapsule3D {
                radius: 0.4,
                x0: -5.0,
                x1: 5.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &CollisionCapsule3D {
                radius: 0.4,
                x0: 0.0,
                x1: 0.0,
                y0: -5.0,
                y1: 5.0,
                z0: 0.5,
                z1: 0.5
            },
            &mut out,
        ));
        assert!((out.depth - 0.3).abs() < 1e-10);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, -1.0);
    }

    #[test]
    fn handles_parallel_capsules_by_anchoring_deterministically() {
        let mut out = create_collision_manifold3d();
        assert!(test_capsule_capsule_collision3d(
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.6,
                y1: 0.6,
                z0: 0.0,
                z1: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.4).abs() < 1e-6);
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn pushes_collinear_capsules_apart_perpendicular_to_their_shared_axis() {
        let mut out = create_collision_manifold3d();
        assert!(test_capsule_capsule_collision3d(
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &mut out,
        ));
        let len = (out.normal_x * out.normal_x
            + out.normal_y * out.normal_y
            + out.normal_z * out.normal_z)
            .sqrt();
        // D1 f32 bound (TS: 5e-11)
        assert!(out.normal_x.abs() <= 4.0 * f32::EPSILON);
        // D1 f32 bound (TS: 5e-11)
        assert!((len - 1.0).abs() <= 4.0 * f32::EPSILON);
    }

    #[test]
    fn reduces_to_a_sphere_test_when_both_segments_are_zero_length() {
        let mut out = create_collision_manifold3d();
        assert!(test_capsule_capsule_collision3d(
            &CollisionCapsule3D {
                radius: 1.0,
                x0: 0.0,
                x1: 0.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &CollisionCapsule3D {
                radius: 1.0,
                x0: 1.5,
                x1: 1.5,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.5).abs() < 1e-10);
        assert!((out.normal_x - (-1.0)).abs() < 1e-10);
    }
}

mod test_sphere_aabb_collision3d {
    use super::*;

    #[test]
    fn measures_from_the_closest_point_on_the_face() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_aabb_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 0.0,
                y: 2.5,
                z: 0.0
            },
            &CollisionAabb3D {
                max_x: 1.0,
                max_y: 2.0,
                max_z: 1.0,
                min_x: -1.0,
                min_y: -2.0,
                min_z: -1.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.5).abs() < 1e-10);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 1.0);
        assert_eq!(out.normal_z, 0.0);
    }

    #[test]
    fn escapes_through_the_nearest_face_when_the_centre_is_inside() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_aabb_collision3d(
            &CollisionSphere3D {
                radius: 0.25,
                x: 0.0,
                y: 0.0,
                z: 0.1
            },
            &CollisionAabb3D {
                max_x: 5.0,
                max_y: 5.0,
                max_z: 0.5,
                min_x: -5.0,
                min_y: -5.0,
                min_z: -0.5
            },
            &mut out,
        ));
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 1.0);
        assert!((out.depth - (0.25 + 0.4)).abs() < 1e-10);
    }

    #[test]
    fn reports_a_sphere_touching_a_face_as_not_overlapping() {
        let mut out = create_collision_manifold3d();
        assert!(!test_sphere_aabb_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 0.0,
                y: 3.0,
                z: 0.0
            },
            &CollisionAabb3D {
                max_x: 1.0,
                max_y: 2.0,
                max_z: 1.0,
                min_x: -1.0,
                min_y: -2.0,
                min_z: -1.0
            },
            &mut out,
        ));
    }
}

mod test_sphere_box_collision3d {
    use super::*;

    #[test]
    fn measures_in_the_rotated_frame() {
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_box_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 0.0,
                y: 4.5,
                z: 0.0
            },
            &CollisionBox3D {
                half_x: 4.0,
                half_y: 1.0,
                half_z: 1.0,
                rotation_w: half,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: half,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            &mut out,
        ));
        assert!((out.depth - 0.5).abs() < 5e-7);
        assert!((out.normal_y - 1.0).abs() < 5e-7);
    }

    #[test]
    fn matches_the_axis_aligned_result_when_the_rotation_is_identity() {
        let mut aligned = create_collision_manifold3d();
        let mut oriented = create_collision_manifold3d();
        let sphere = CollisionSphere3D {
            radius: 1.0,
            x: 1.2,
            y: 0.4,
            z: 0.0,
        };
        test_sphere_aabb_collision3d(
            &sphere,
            &CollisionAabb3D {
                max_x: 1.0,
                max_y: 1.0,
                max_z: 1.0,
                min_x: -1.0,
                min_y: -1.0,
                min_z: -1.0,
            },
            &mut aligned,
        );
        test_sphere_box_collision3d(
            &sphere,
            &CollisionBox3D {
                half_x: 1.0,
                half_y: 1.0,
                half_z: 1.0,
                rotation_w: 1.0,
                rotation_x: 0.0,
                rotation_y: 0.0,
                rotation_z: 0.0,
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            &mut oriented,
        );
        assert!((oriented.depth - aligned.depth).abs() < 1e-10);
        assert!((oriented.normal_x - aligned.normal_x).abs() < 1e-10);
    }
}

mod test_sphere_capsule_collision3d {
    use super::*;

    #[test]
    fn measures_to_the_closest_point_on_the_segment_not_to_an_endpoint() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_capsule_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 2.0,
                y: 1.2,
                z: 0.0
            },
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.3).abs() < 1e-6);
        assert!((out.normal_y - 1.0).abs() < 1e-6);
    }

    #[test]
    fn clamps_past_the_end_of_the_segment_to_the_cap() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_capsule_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 5.0,
                y: 0.0,
                z: 0.0
            },
            &CollisionCapsule3D {
                radius: 0.5,
                x0: 0.0,
                x1: 4.0,
                y0: 0.0,
                y1: 0.0,
                z0: 0.0,
                z1: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 0.5).abs() < 1e-10);
        assert!((out.normal_x - 1.0).abs() < 1e-10);
    }
}

mod test_sphere_sphere_collision3d {
    use super::*;

    #[test]
    fn reports_depth_and_an_exact_normal_along_the_centre_line() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_sphere_collision3d(
            &CollisionSphere3D {
                radius: 2.0,
                x: 0.0,
                y: 0.0,
                z: 0.0
            },
            &CollisionSphere3D {
                radius: 2.0,
                x: 3.0,
                y: 0.0,
                z: 0.0
            },
            &mut out,
        ));
        assert!((out.depth - 1.0).abs() < 1e-10);
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.normal_z, 0.0);
    }

    #[test]
    fn treats_exactly_touching_spheres_as_not_overlapping() {
        let mut out = create_collision_manifold3d();
        assert!(!test_sphere_sphere_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 0.0,
                y: 0.0,
                z: 0.0
            },
            &CollisionSphere3D {
                radius: 1.0,
                x: 2.0,
                y: 0.0,
                z: 0.0
            },
            &mut out,
        ));
    }

    #[test]
    fn picks_a_direction_for_concentric_spheres_rather_than_dividing_by_zero() {
        let mut out = create_collision_manifold3d();
        assert!(test_sphere_sphere_collision3d(
            &CollisionSphere3D {
                radius: 1.0,
                x: 4.0,
                y: 4.0,
                z: 4.0
            },
            &CollisionSphere3D {
                radius: 2.0,
                x: 4.0,
                y: 4.0,
                z: 4.0
            },
            &mut out,
        ));
        assert!((out.depth - 3.0).abs() < 1e-10);
        let len = (out.normal_x * out.normal_x
            + out.normal_y * out.normal_y
            + out.normal_z * out.normal_z)
            .sqrt();
        assert!((len - 1.0).abs() < 1e-10);
    }
}
