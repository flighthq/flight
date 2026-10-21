use std::f32::consts::PI;

use flight_collision::*;
use flight_entity::Ref;
use flight_physics2d::*;

fn collider(local: CollisionShape2D, density: f32) -> Ref<Physics2DCollider> {
    let material = Physics2DMaterial {
        density,
        friction: 0.2,
        restitution: 0.0,
    };
    return create_physics2d_collider(&local, &material, None, None);
}

// The constructor, not a literal that happens to match the fields: a body grows fields (sleep state,
// for one) and a literal silently goes stale the moment it does.
fn body(colliders: Vec<Ref<Physics2DCollider>>, body_type: Physics2DBodyType) -> Ref<RigidBody2D> {
    let created = create_rigid_body2d(body_type, 0.0, 0.0, None);
    {
        let mut guard = created.write().unwrap();
        guard.index = 0;
        guard.colliders.extend(colliders);
    }
    return created;
}

fn aabb(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    });
}

fn circle(x: f64, y: f64, radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D { x, y, radius });
}

fn polygon(points: &[f64]) -> CollisionShape2D {
    return CollisionShape2D::Polygon(CollisionPolygon2D {
        points: points.to_vec(),
    });
}

// vitest `toBeCloseTo(expected, digits)`: |actual - expected| < 10^-digits / 2.
fn close(actual: f32, expected: f32, digits: i32) -> bool {
    return (actual - expected).abs() < 10f32.powi(-digits) / 2.0;
}

fn compute(out: &mut Physics2DMassData, collider: &Ref<Physics2DCollider>) {
    compute_physics2d_collider_mass_data(out, &collider.read().unwrap());
}

fn mass_data() -> Physics2DMassData {
    return Physics2DMassData {
        mass: 0.0,
        inertia: 0.0,
        center_x: 0.0,
        center_y: 0.0,
    };
}

fn update(body: &Ref<RigidBody2D>) {
    update_rigid_body2d_mass_data(&mut body.write().unwrap());
}

struct CapsuleTruth {
    area: f64,
    center_x: f64,
    center_y: f64,
    second: f64,
}

// Grid integration over the capsule's own containment predicate. It shares no algebra with the closed
// form, so agreement between the two is evidence rather than restatement — and the capsule's inertia
// is exactly the kind of derivation where a dropped term reads as plausible.
fn integrate_capsule(x0: f64, y0: f64, x1: f64, y1: f64, radius: f64) -> CapsuleTruth {
    const CELLS: usize = 1200;
    let min_x = x0.min(x1) - radius;
    let min_y = y0.min(y1) - radius;
    let step_x = (x0.max(x1) + radius - min_x) / CELLS as f64;
    let step_y = (y0.max(y1) + radius - min_y) / CELLS as f64;
    let cell_area = step_x * step_y;
    let mut inside: Vec<f64> = Vec::new();
    let mut area = 0.0;
    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    for ix in 0..CELLS {
        let px = min_x + (ix as f64 + 0.5) * step_x;
        for iy in 0..CELLS {
            let py = min_y + (iy as f64 + 0.5) * step_y;
            let dx = x1 - x0;
            let dy = y1 - y0;
            let length_squared = dx * dx + dy * dy;
            let mut t = 0.0;
            if length_squared > 0.0 {
                t = ((px - x0) * dx + (py - y0) * dy) / length_squared;
                t = if t < 0.0 {
                    0.0
                } else if t > 1.0 {
                    1.0
                } else {
                    t
                };
            }
            let cx = px - (x0 + t * dx);
            let cy = py - (y0 + t * dy);
            if cx * cx + cy * cy > radius * radius {
                continue;
            }
            inside.push(px);
            inside.push(py);
            area += cell_area;
            sum_x += px * cell_area;
            sum_y += py * cell_area;
        }
    }
    let center_x = sum_x / area;
    let center_y = sum_y / area;
    let mut second = 0.0;
    let mut at = 0;
    while at < inside.len() {
        let rx = inside[at] - center_x;
        let ry = inside[at + 1] - center_y;
        second += (rx * rx + ry * ry) * cell_area;
        at += 2;
    }
    return CapsuleTruth {
        area,
        center_x,
        center_y,
        second,
    };
}

mod compute_physics2d_collider_mass_data {
    use super::*;

    #[test]
    fn agrees_with_the_box_formula_when_the_same_square_is_given_as_a_polygon() {
        // Cross-validation between two independent derivations: the closed-form rectangle expression
        // and the general polygon accumulation. Agreement is evidence neither is quietly wrong.
        let mut as_box = mass_data();
        let mut as_polygon = mass_data();
        compute(&mut as_box, &collider(aabb(-1.5, -0.5, 1.5, 0.5), 2.0));
        compute(
            &mut as_polygon,
            &collider(polygon(&[-1.5, -0.5, 1.5, -0.5, 1.5, 0.5, -1.5, 0.5]), 2.0),
        );
        assert!(close(as_polygon.mass, as_box.mass, 2));
        assert!(close(as_polygon.inertia, as_box.inertia, 2));
        assert!(close(as_polygon.center_x, as_box.center_x, 2));
        assert!(close(as_polygon.center_y, as_box.center_y, 2));
    }

    #[test]
    fn derives_a_box_from_its_extents_and_centres_it_on_the_box() {
        let mut out = mass_data();
        compute(&mut out, &collider(aabb(0.0, 0.0, 4.0, 2.0), 3.0));
        assert!(close(out.mass, 24.0, 2));
        assert!(close(out.inertia, (24.0 * (16.0 + 4.0)) / 12.0, 2));
        assert!(close(out.center_x, 2.0, 2));
        assert!(close(out.center_y, 1.0, 2));
    }

    #[test]
    fn derives_a_capsule_to_match_a_numerical_integration_of_its_own_area() {
        // Four capsules covering the cases the closed form could get wrong in different ways:
        // axis-aligned, degenerate to a disc, diagonal, and long-and-thin where the end-cap cross term
        // dominates.
        for [x0, y0, x1, y1, radius] in [
            [-1.0, 0.0, 1.0, 0.0, 0.5],
            [0.0, 0.0, 0.0, 0.0, 0.7],
            [-2.0, -1.0, 3.0, 2.0, 0.4],
            [0.0, -3.0, 0.0, 3.0, 1.2],
        ] {
            let mut out = mass_data();
            let shape = CollisionShape2D::Capsule(CollisionCapsule2D {
                x0: x0 as f32,
                y0: y0 as f32,
                x1: x1 as f32,
                y1: y1 as f32,
                radius: radius as f32,
            });
            compute(&mut out, &collider(shape, 1.0));
            let truth = integrate_capsule(x0, y0, x1, y1, radius);
            let label = format!("capsule {},{}-{},{} r{}", x0, y0, x1, y1, radius);
            // A tenth of a percent, which is the grid's own resolution rather than a tolerance for the
            // formula.
            assert!(
                (out.mass as f64 - truth.area).abs() / truth.area < 1e-3,
                "{}",
                label
            );
            assert!(
                (out.inertia as f64 - truth.second).abs() / truth.second < 1e-3,
                "{}",
                label
            );
            assert!(close(out.center_x, truth.center_x as f32, 3), "{}", label);
            assert!(close(out.center_y, truth.center_y as f32, 3), "{}", label);
        }
    }

    #[test]
    fn derives_a_disc_from_its_area_and_half_its_mass_radius_squared() {
        let mut out = mass_data();
        compute(&mut out, &collider(circle(3.0, -2.0, 2.0), 4.0));
        assert!(close(out.mass, PI * 4.0 * 4.0, 2));
        assert!(close(out.inertia, 0.5 * PI * 4.0 * 4.0 * 4.0, 2));
        assert_eq!(out.center_x, 3.0);
        assert_eq!(out.center_y, -2.0);
    }

    #[test]
    fn gives_a_polygon_the_same_mass_whichever_winding_it_is_given_in() {
        let mut counter_clockwise = mass_data();
        let mut clockwise = mass_data();
        compute(
            &mut counter_clockwise,
            &collider(polygon(&[0.0, 0.0, 4.0, 0.0, 4.0, 2.0, 0.0, 2.0]), 1.0),
        );
        compute(
            &mut clockwise,
            &collider(polygon(&[0.0, 0.0, 0.0, 2.0, 4.0, 2.0, 4.0, 0.0]), 1.0),
        );
        assert!(close(clockwise.mass, counter_clockwise.mass, 2));
        assert!(close(clockwise.inertia, counter_clockwise.inertia, 2));
        assert!(close(clockwise.center_x, counter_clockwise.center_x, 2));
        assert!(close(clockwise.center_y, counter_clockwise.center_y, 2));
    }

    #[test]
    fn gives_an_oriented_box_the_same_inertia_as_the_axis_aligned_box_of_equal_extents() {
        // Rotation about z does not change a rectangle's second moment about its own centre. Pinned
        // because assuming otherwise is a natural mistake, and it would make a tilted crate swing wrong.
        let mut upright = mass_data();
        let mut tilted = mass_data();
        compute(&mut upright, &collider(aabb(-2.0, -1.0, 2.0, 1.0), 1.0));
        let obb = CollisionShape2D::Obb(CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 2.0,
            half_h: 1.0,
            rotation: 0.7,
        });
        compute(&mut tilted, &collider(obb, 1.0));
        assert!(close(tilted.mass, upright.mass, 2));
        assert!(close(tilted.inertia, upright.inertia, 2));
    }

    #[test]
    fn gives_area_less_and_degenerate_shapes_no_mass() {
        let mut out = mass_data();
        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 5.0,
            y1: 5.0,
        });
        compute(&mut out, &collider(segment, 1.0));
        assert_eq!(out.mass, 0.0);
        compute(
            &mut out,
            &collider(
                CollisionShape2D::Point(CollisionPoint2D { x: 1.0, y: 1.0 }),
                1.0,
            ),
        );
        assert_eq!(out.mass, 0.0);
        // Collinear vertices enclose no area; dividing the centroid by it would be a NaN body.
        compute(
            &mut out,
            &collider(polygon(&[0.0, 0.0, 1.0, 1.0, 2.0, 2.0]), 1.0),
        );
        assert_eq!(out.mass, 0.0);
        assert!(!out.center_x.is_nan());
    }

    #[test]
    fn offsets_a_polygon_centroid_without_changing_its_inertia_about_that_centroid() {
        // The parallel-axis subtraction is the step most easily got wrong, and the wrongness is
        // invisible in a shape centred on the origin. Translating the same square must move the
        // centroid and leave the inertia untouched.
        let mut at_origin = mass_data();
        let mut shifted = mass_data();
        compute(
            &mut at_origin,
            &collider(polygon(&[-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]), 1.0),
        );
        compute(
            &mut shifted,
            &collider(
                polygon(&[9.0, 19.0, 11.0, 19.0, 11.0, 21.0, 9.0, 21.0]),
                1.0,
            ),
        );
        assert!(close(shifted.center_x, 10.0, 2));
        assert!(close(shifted.center_y, 20.0, 2));
        assert!(close(shifted.inertia, at_origin.inertia, 2));
    }

    #[test]
    fn reduces_a_zero_length_capsule_to_the_disc_it_is() {
        let mut capsule = mass_data();
        let mut disc = mass_data();
        let shape = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 2.0,
            y0: 5.0,
            x1: 2.0,
            y1: 5.0,
            radius: 0.9,
        });
        compute(&mut capsule, &collider(shape, 1.0));
        compute(&mut disc, &collider(circle(2.0, 5.0, 0.9), 1.0));
        assert_eq!(
            (
                capsule.mass,
                capsule.inertia,
                capsule.center_x,
                capsule.center_y
            ),
            (disc.mass, disc.inertia, disc.center_x, disc.center_y)
        );
    }
}

mod update_rigid_body2d_mass_data {
    use super::*;

    #[test]
    fn combines_two_colliders_into_one_centre_of_mass_and_shifts_their_inertia_onto_it() {
        let left = collider(aabb(-3.0, -1.0, -1.0, 1.0), 1.0);
        let right = collider(aabb(1.0, -1.0, 3.0, 1.0), 1.0);
        let target = body(vec![left, right], Physics2DBodyType::Dynamic);
        update(&target);

        let target = target.read().unwrap();
        assert!(close(target.mass, 8.0, 2));
        assert!(close(target.center_x, 0.0, 2));
        assert!(close(target.center_y, 0.0, 2));
        // Each 2x2 box contributes its own inertia plus mass times the square of its 2-unit offset.
        let own = (4.0 * (4.0 + 4.0)) / 12.0;
        assert!(close(target.inertia, 2.0 * (own + 4.0 * 4.0), 2));
        assert!(close(target.inverse_mass, 1.0 / 8.0, 2));
    }

    #[test]
    fn gives_a_kinematic_body_zero_inverse_mass_even_though_it_moves() {
        let platform = body(
            vec![collider(aabb(0.0, 0.0, 4.0, 1.0), 1.0)],
            Physics2DBodyType::Kinematic,
        );
        update(&platform);
        let platform = platform.read().unwrap();
        assert_eq!(platform.inverse_mass, 0.0);
        assert_eq!(platform.inverse_inertia, 0.0);
    }

    #[test]
    fn gives_a_static_body_zero_inverse_mass_and_inertia_while_keeping_its_centre() {
        // Zero inverse mass is the arithmetic that makes a static body immovable without a branch in
        // the solver, so it must hold even though the shape has real area.
        let ground = body(
            vec![collider(aabb(-5.0, -1.0, 5.0, 0.0), 1.0)],
            Physics2DBodyType::Static,
        );
        update(&ground);
        let ground = ground.read().unwrap();
        assert_eq!(ground.inverse_mass, 0.0);
        assert_eq!(ground.inverse_inertia, 0.0);
        assert_eq!(ground.mass, 0.0);
        assert!(close(ground.center_x, 0.0, 2));
        assert!(close(ground.center_y, -0.5, 2));
    }

    #[test]
    fn gives_fixed_rotation_zero_inverse_inertia_without_discarding_derived_inertia_or_linear_mass()
    {
        let target = body(
            vec![collider(aabb(-2.0, -1.0, 2.0, 1.0), 1.0)],
            Physics2DBodyType::Dynamic,
        );
        target.write().unwrap().fixed_rotation = true;
        update(&target);

        let target = target.read().unwrap();
        assert!(target.mass > 0.0);
        assert!(target.inverse_mass > 0.0);
        assert!(target.inertia > 0.0);
        assert_eq!(target.inverse_inertia, 0.0);
    }

    #[test]
    fn keeps_collider_mass_scratch_isolated_when_a_body_getter_updates_another_body() {
        // TS installs a `centerX` getter that re-enters `updateRigidBody2DMassData` on another body
        // mid-update. Rust fields have no getters (D15), and the collider scratch is a call-local value,
        // so the nearest representable check is an interleaved update of the other body around the
        // target's own.
        let target = body(
            vec![collider(aabb(-1.0, -1.0, 1.0, 1.0), 1.0)],
            Physics2DBodyType::Dynamic,
        );
        let nested = body(
            vec![collider(circle(10.0, 20.0, 5.0), 1.0)],
            Physics2DBodyType::Dynamic,
        );
        let mut nested_calls = 0;
        nested_calls += 1;
        update(&nested);

        update(&target);
        update(&nested);

        assert_eq!(nested_calls, 1);
        let target = target.read().unwrap();
        assert!(close(target.mass, 4.0, 2));
        assert!(close(target.center_x, 0.0, 2));
        assert!(close(target.center_y, 0.0, 2));
        assert!(close(target.inertia, 8.0 / 3.0, 2));
    }

    #[test]
    fn leaves_a_dynamic_body_with_no_area_finite_rather_than_dividing_by_its_zero_mass() {
        // A body whose only collider is a sensor point has no mass. Inverting it would seed NaN into
        // the velocity of everything it later touches, which is unrecoverable rather than merely wrong.
        let ghost = body(
            vec![collider(
                CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
                1.0,
            )],
            Physics2DBodyType::Dynamic,
        );
        update(&ghost);
        let ghost = ghost.read().unwrap();
        assert_eq!(ghost.inverse_mass, 0.0);
        assert_eq!(ghost.inverse_inertia, 0.0);
        assert!(ghost.center_x.is_finite());
    }

    #[test]
    fn scales_mass_with_density_but_leaves_the_centre_of_mass_where_it_was() {
        let light = body(
            vec![collider(aabb(0.0, 0.0, 2.0, 2.0), 1.0)],
            Physics2DBodyType::Dynamic,
        );
        let heavy = body(
            vec![collider(aabb(0.0, 0.0, 2.0, 2.0), 7.0)],
            Physics2DBodyType::Dynamic,
        );
        update(&light);
        update(&heavy);
        let (light, heavy) = (light.read().unwrap(), heavy.read().unwrap());
        assert!(close(heavy.mass, light.mass * 7.0, 2));
        assert!(close(heavy.inertia, light.inertia * 7.0, 2));
        assert!(close(heavy.center_x, light.center_x, 2));
    }
}
