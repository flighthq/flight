// Every assertion in this file is a STATICS check, not a comparison against the formula under test. A
// joint holding a weight still must push up with exactly that weight, and a joint holding an
// off-centre weight still must supply exactly the moment gravity applies about its anchor. Those are
// facts about the world rather than about the code, so a sign error, a missing ratio, or a mistaken
// state slot fails them — and none of them could be satisfied by an implementation that is merely
// self-consistent.
//
// The timestep is deliberately small and the settle deliberately long: the reaction reports what the
// solver CONVERGED on, so a coarse step reports its own residual error rather than the analytic answer.

use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb2D, CollisionCircle2D, CollisionRegistry2D, CollisionShape2D,
    register_built_in_collision_pair_tests2d, register_built_in_collision_supports2d,
};
use flight_entity::{Entity, Ref, allocate_entity};
use flight_physics2d::contract::*;

const GRAVITY: f32 = -10.0;
const DT: f32 = 1.0 / 240.0;
const SETTLE_STEPS: usize = 4000;
const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.0,
    restitution: 0.0,
};

fn ball(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    offset_x: f64,
) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(body_type, x, y, None);
    let local = CollisionShape2D::Circle(CollisionCircle2D {
        x: offset_x,
        y: 0.0,
        radius: 0.4,
    });
    body.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(&local, &MATERIAL, None, None));
    add_physics2d_body(world, &body);
    return body;
}

fn base(body_a: i32, body_b: i32) -> Physics2DJointOptions {
    let make: fn() -> Physics2DJointOptions = Physics2DJointOptions::default;
    let mut out = make();
    out.body_a = body_a;
    out.body_b = body_b;
    return out;
}

// vitest `toBeCloseTo(expected, digits)`: |actual - expected| < 10^-digits / 2.
fn close(actual: f32, expected: f32, digits: i32) -> bool {
    return (actual - expected).abs() < 10f32.powi(-digits) / 2.0;
}

fn distance(body_a: i32, body_b: i32) -> Physics2DJointRef {
    return create_physics2d_distance_joint(&Physics2DDistanceJointOptions {
        base: base(body_a, body_b),
        damping_ratio: Some(0.0),
        frequency_hz: Some(0.0),
        length: 2.0,
    });
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return body.read().unwrap().index;
}

fn mass_of(body: &Ref<RigidBody2D>) -> f32 {
    return body.read().unwrap().mass;
}

fn registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn settle(
    world: &mut Physics2DWorld,
    joint: &Physics2DJointRef,
    steps: usize,
) -> Physics2DJointReaction {
    add_physics2d_joint(world, joint);
    let registry = registry();
    for _ in 0..steps {
        step_physics2d(world, DT, &registry, None);
    }
    let mut out = create_physics2d_joint_reaction();
    assert!(write(&mut out, world, joint, DT));
    return out;
}

fn settled_world() -> Physics2DWorld {
    let mut world = create_physics2d_world(Some(0.0), Some(GRAVITY), None);
    register_built_in_physics2d_joint_solvers(&mut world);
    return world;
}

fn write(
    out: &mut Physics2DJointReaction,
    world: &Physics2DWorld,
    joint: &Physics2DJointRef,
    dt: f32,
) -> bool {
    return write_physics2d_joint_reaction(out, world, &*joint.read().unwrap(), dt);
}

mod create_physics2d_joint_reaction {
    use super::*;

    #[test]
    fn allocates_a_fresh_object_each_call_so_two_readings_do_not_alias() {
        let mut first = create_physics2d_joint_reaction();
        let second = create_physics2d_joint_reaction();
        first.force_y = 5.0;
        assert_eq!(second.force_y, 0.0);
    }

    #[test]
    fn starts_at_rest() {
        fn assert_entity<T: Entity>(_value: &T) {}
        let reaction = create_physics2d_joint_reaction();
        assert_entity(&reaction);
        assert_eq!(
            (reaction.force_x, reaction.force_y, reaction.torque),
            (0.0, 0.0, 0.0)
        );
    }
}

mod initialize_physics2d_joint_reaction {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_joint_reaction() {
        let mut out: Physics2DJointReaction = allocate_entity();
        out.force_x = 1.0;
        out.force_y = 2.0;
        out.torque = 3.0;
        initialize_physics2d_joint_reaction(&mut out);
        assert_eq!((out.force_x, out.force_y, out.torque), (0.0, 0.0, 0.0));
    }
}

mod write_physics2d_joint_reaction {
    use super::*;

    #[test]
    fn declines_before_the_first_step_when_there_is_nothing_yet_to_report() {
        let mut world = settled_world();
        let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
        let joint = distance(index_of(&anchor), index_of(&bob));
        add_physics2d_joint(&mut world, &joint);

        let mut out = create_physics2d_joint_reaction();
        assert!(!write(&mut out, &world, &joint, DT));
        assert_eq!((out.force_x, out.force_y, out.torque), (0.0, 0.0, 0.0));
    }

    #[test]
    fn declines_for_a_kind_whose_solver_was_never_registered() {
        let mut world = create_physics2d_world(Some(0.0), Some(GRAVITY), None);
        let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
        let joint: Physics2DJointRef = {
            let mut out: Physics2DDistanceJoint = allocate_entity();
            initialize_physics2d_distance_joint(
                &mut out,
                &Physics2DDistanceJointOptions {
                    base: base(index_of(&anchor), index_of(&bob)),
                    damping_ratio: None,
                    frequency_hz: None,
                    length: 0.0,
                },
            );
            out.kind = "acme.Unregistered".to_string();
            Arc::new(RwLock::new(out))
        };
        add_physics2d_joint(&mut world, &joint);
        step_physics2d(&mut world, DT, &registry(), None);

        let mut out = create_physics2d_joint_reaction();
        assert!(!write(&mut out, &world, &joint, DT));
    }

    #[test]
    fn declines_for_a_timestep_that_cannot_express_a_force_and_zeroes_the_output_first() {
        // The conversion is a division by dt, so a zero or non-finite step has no answer rather than an
        // infinite one. `out` is cleared before the check so a caller reusing a scratch reaction cannot
        // read the previous joint's numbers back as this one's.
        let mut world = settled_world();
        let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
        let joint = distance(index_of(&anchor), index_of(&bob));
        let mut out = settle(&mut world, &joint, 200);
        assert!(out.force_y > 0.0);

        for bad in [0.0, -1.0, f32::NAN, f32::INFINITY] {
            assert!(!write(&mut out, &world, &joint, bad));
            assert_eq!((out.force_x, out.force_y, out.torque), (0.0, 0.0, 0.0));
        }
    }

    #[test]
    fn reports_a_hanging_weight_for_every_kind_that_carries_one_along_its_axis() {
        // Five kinds, one law. Each holds the same bob against the same gravity by a different
        // mechanism — a rigid rod, a taut rope, a hinge, a weld, and a slider's perpendicular lane — and
        // every one of them must report the identical upward force, because the bob's weight does not
        // care how it is held.
        for kind in [
            PHYSICS2D_DISTANCE_JOINT_KIND,
            PHYSICS2D_ROPE_JOINT_KIND,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            PHYSICS2D_WELD_JOINT_KIND,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
        ] {
            let mut world = settled_world();
            let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
            let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
            let base = base(index_of(&anchor), index_of(&bob));
            let joint: Physics2DJointRef = match kind {
                PHYSICS2D_DISTANCE_JOINT_KIND => distance(base.body_a, base.body_b),
                PHYSICS2D_ROPE_JOINT_KIND => {
                    create_physics2d_rope_joint(&Physics2DRopeJointOptions {
                        base,
                        max_length: 2.0,
                    })
                }
                PHYSICS2D_REVOLUTE_JOINT_KIND => {
                    let make: fn() -> Physics2DRevoluteJointOptions =
                        Physics2DRevoluteJointOptions::default;
                    let mut options = make();
                    options.base = base;
                    create_physics2d_revolute_joint(&options)
                }
                PHYSICS2D_WELD_JOINT_KIND => {
                    create_physics2d_weld_joint(&Physics2DWeldJointOptions {
                        base,
                        reference_angle: Some(0.0),
                    })
                }
                _ => {
                    let make: fn() -> Physics2DPrismaticJointOptions =
                        Physics2DPrismaticJointOptions::default;
                    let mut options = make();
                    options.base = base;
                    options.local_axis_ax = Some(1.0);
                    options.local_axis_ay = Some(0.0);
                    create_physics2d_prismatic_joint(&options)
                }
            };

            let reaction = settle(&mut world, &joint, SETTLE_STEPS);

            let weight = mass_of(&bob) * -GRAVITY;
            assert!(
                close(reaction.force_y, weight, 9),
                "{} force_y {} vs {}",
                kind,
                reaction.force_y,
                weight
            );
            assert!(
                close(reaction.force_x, 0.0, 9),
                "{} force_x {}",
                kind,
                reaction.force_x
            );
            // Anchored through the centre of mass, so gravity has no lever arm and none of these five
            // twists.
            assert!(
                close(reaction.torque, 0.0, 9),
                "{} torque {}",
                kind,
                reaction.torque
            );
        }
    }

    #[test]
    fn reports_nothing_for_a_rope_that_is_slack_because_a_slack_rope_carries_no_load() {
        let mut world = settled_world();
        let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -1.0, 0.0);
        // Rope longer than the separation and a floor to land on, so it never goes taut.
        let floor = create_rigid_body2d(Physics2DBodyType::Static, 0.0, -2.0, None);
        let local = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0,
            min_y: -1.0,
            max_x: 5.0,
            max_y: 0.0,
        });
        floor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(&local, &MATERIAL, None, None));
        add_physics2d_body(&mut world, &floor);
        let joint = create_physics2d_rope_joint(&Physics2DRopeJointOptions {
            base: base(index_of(&anchor), index_of(&bob)),
            max_length: 8.0,
        });
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        // Closeness rather than identity only because a zero impulse times a negative axis component is
        // negative zero, which is the same force and a different value.
        assert!(close(reaction.force_x, 0.0, 12));
        assert!(close(reaction.force_y, 0.0, 12));
        assert!(close(reaction.torque, 0.0, 12));
    }

    #[test]
    fn reports_the_couple_a_weld_supplies_against_an_off_centre_weight() {
        // The torque lane, checked by moment balance rather than by the formula. The arm's centre of
        // mass sits 1.5 to the right of the anchor, so gravity applies m*g*1.5 about it and the weld
        // must supply exactly the negative of that — while ALSO reporting the full weight as a force.
        // Getting one lane right and the other wrong fails here, which is the point of testing them
        // together.
        let mut world = settled_world();
        let post = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let arm = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, 1.5);
        let joint = create_physics2d_weld_joint(&Physics2DWeldJointOptions {
            base: base(index_of(&post), index_of(&arm)),
            reference_angle: Some(0.0),
        });
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        let mass = mass_of(&arm);
        // f32: measured torque 7.539824 vs analytic 7.5398226 (3 ulp at 7.5), so 5 digits, not TS's 6
        assert!(
            close(reaction.torque, -(mass * GRAVITY * 1.5), 5),
            "torque {}",
            reaction.torque
        );
        // f32: measured force_y 5.0265493 vs weight 5.0265484 (2 ulp at 5), so 5 digits, not TS's 6
        assert!(
            close(reaction.force_y, mass * -GRAVITY, 5),
            "force_y {}",
            reaction.force_y
        );
    }

    #[test]
    fn reports_the_drag_force_a_mouse_joint_spends_holding_a_body_against_gravity() {
        let mut world = settled_world();
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, 0.0);
        let joint = create_physics2d_mouse_joint(&Physics2DMouseJointOptions {
            body: index_of(&bob),
            break_force: None,
            break_torque: None,
            damping_ratio: Some(1.0),
            frequency_hz: Some(20.0),
            local_anchor_x: None,
            local_anchor_y: None,
            max_force: 1000.0,
            target_x: 0.0,
            target_y: 0.0,
        });
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        assert!(
            close(reaction.force_y, mass_of(&bob) * -GRAVITY, 6),
            "force_y {}",
            reaction.force_y
        );
    }

    #[test]
    fn reports_the_motor_torque_a_revolute_joint_spends_holding_an_off_centre_weight_level() {
        let mut world = settled_world();
        let post = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let arm = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, 1.5);
        let make: fn() -> Physics2DRevoluteJointOptions = Physics2DRevoluteJointOptions::default;
        let mut options = make();
        options.base = base(index_of(&post), index_of(&arm));
        options.reference_angle = Some(0.0);
        options.enable_motor = Some(true);
        options.motor_speed = Some(0.0);
        options.max_motor_torque = Some(1000.0);
        options.enable_limit = Some(false);
        let joint = create_physics2d_revolute_joint(&options);
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        let mass = mass_of(&arm);
        assert!(
            close(reaction.torque, -(mass * GRAVITY * 1.5), 4),
            "torque {}",
            reaction.torque
        );
        assert!(
            close(reaction.force_y, mass * -GRAVITY, 6),
            "force_y {}",
            reaction.force_y
        );
    }

    #[test]
    fn reports_the_suspension_load_a_wheel_spring_carries() {
        let mut world = settled_world();
        let hub = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let wheel = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
        let make: fn() -> Physics2DWheelJointOptions = Physics2DWheelJointOptions::default;
        let mut options = make();
        options.base = base(index_of(&hub), index_of(&wheel));
        options.local_axis_ax = Some(0.0);
        options.local_axis_ay = Some(1.0);
        options.rest_translation = Some(-2.0);
        options.frequency_hz = Some(4.0);
        options.damping_ratio = Some(0.7);
        options.enable_motor = Some(false);
        let joint = create_physics2d_wheel_joint(&options);
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        // A SPRING, so it settles slightly compressed rather than exactly at rest length, and the load
        // it reports is the weight to within that sag. Demanding exactness here would be demanding that
        // a suspension not compress.
        assert!(
            close(reaction.force_y, mass_of(&wheel) * -GRAVITY, 4),
            "force_y {}",
            reaction.force_y
        );
        assert!(
            close(reaction.force_x, 0.0, 9),
            "force_x {}",
            reaction.force_x
        );
    }

    #[test]
    fn reports_the_tension_in_a_pulley_segment_which_pulls_toward_its_own_ground_anchor() {
        // A pulley is the one built-in whose two ends do NOT act on each other: each is pulled toward
        // its own ground point and the difference goes into the ground. Two equal weights balance, so
        // each segment carries exactly one weight.
        let mut world = settled_world();
        let left = ball(&mut world, Physics2DBodyType::Dynamic, -1.0, -2.0, 0.0);
        let right = ball(&mut world, Physics2DBodyType::Dynamic, 1.0, -2.0, 0.0);
        let joint = create_physics2d_pulley_joint(&Physics2DPulleyJointOptions {
            base: base(index_of(&left), index_of(&right)),
            constant: 4.0,
            ground_anchor_ax: -1.0,
            ground_anchor_ay: 0.0,
            ground_anchor_bx: 1.0,
            ground_anchor_by: 0.0,
            ratio: Some(1.0),
        });
        let reaction = settle(&mut world, &(joint as Physics2DJointRef), SETTLE_STEPS);

        assert!(
            close(reaction.force_y, mass_of(&right) * -GRAVITY, 9),
            "force_y {}",
            reaction.force_y
        );
        assert!(
            close(reaction.force_x, 0.0, 9),
            "force_x {}",
            reaction.force_x
        );
    }

    #[test]
    fn reports_the_torque_a_gear_transmits_which_is_a_real_reaction_and_not_an_absent_one() {
        // Two identical bodies geared 1:1 with a steady torque on the driver. The constraint makes them
        // counter-rotate, so the pair shares the torque evenly and the gear passes exactly half of it
        // on — negative, because B turns the other way.
        let mut world = create_physics2d_world(Some(0.0), Some(0.0), None);
        register_built_in_physics2d_joint_solvers(&mut world);
        let driver = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, 0.0);
        let driven = ball(&mut world, Physics2DBodyType::Dynamic, 5.0, 0.0, 0.0);
        let joint: Physics2DJointRef = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            axis_ax: Some(1.0),
            axis_ay: Some(0.0),
            axis_bx: Some(1.0),
            axis_by: Some(0.0),
            base: base(index_of(&driver), index_of(&driven)),
            constant: 0.0,
            coordinate_a: Physics2DGearCoordinateKind::Angular,
            coordinate_b: Physics2DGearCoordinateKind::Angular,
            ratio: Some(1.0),
        });
        add_physics2d_joint(&mut world, &joint);
        let registry = registry();
        for _ in 0..200 {
            driver.write().unwrap().torque = 10.0;
            step_physics2d(&mut world, DT, &registry, None);
        }

        let mut out = create_physics2d_joint_reaction();
        assert!(write(&mut out, &world, &joint, DT));
        // f32: measured -4.9999914 vs -5 after 200 accumulated f32 steps, so 4 digits, not TS's 6
        assert!(close(out.torque, -5.0, 4), "torque {}", out.torque);
        assert!(close(out.force_x, 0.0, 9), "force_x {}", out.force_x);
        assert!(close(out.force_y, 0.0, 9), "force_y {}", out.force_y);
        let (driver_spin, driven_spin) = (
            driver.read().unwrap().angular_velocity,
            driven.read().unwrap().angular_velocity,
        );
        assert!(
            close(driven_spin, -driver_spin, 6),
            "{} vs {}",
            driven_spin,
            driver_spin
        );
    }

    #[test]
    fn scales_with_the_timestep_it_is_told_since_a_force_is_an_impulse_per_unit_time() {
        let mut world = settled_world();
        let anchor = ball(&mut world, Physics2DBodyType::Static, 0.0, 0.0, 0.0);
        let bob = ball(&mut world, Physics2DBodyType::Dynamic, 0.0, -2.0, 0.0);
        let joint = distance(index_of(&anchor), index_of(&bob));
        let at_step_size = settle(&mut world, &joint, SETTLE_STEPS);

        let mut halved = create_physics2d_joint_reaction();
        write(&mut halved, &world, &joint, DT * 2.0);
        assert!(
            close(halved.force_y, at_step_size.force_y / 2.0, 9),
            "{} vs {}",
            halved.force_y,
            at_step_size.force_y
        );
    }
}
