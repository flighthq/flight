use std::sync::{Arc, LazyLock, Mutex};

use flight_collision::{CollisionAabb2D, CollisionCircle2D, CollisionRegistry2D, CollisionShape2D};
use flight_entity::Ref;
use flight_physics2d::*;

static REGISTRY: LazyLock<CollisionRegistry2D> = LazyLock::new(|| {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    flight_collision::register_built_in_collision_supports2d(&mut registry);
    flight_collision::register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
});

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

const DYNAMIC: Physics2DBodyType = Physics2DBodyType::Dynamic;
const STATIC: Physics2DBodyType = Physics2DBodyType::Static;

fn add_body(world: &mut Physics2DWorld, body: &Ref<RigidBody2D>) -> Ref<RigidBody2D> {
    add_physics2d_body(world, body);
    return body.clone();
}

fn add_joint<T: Physics2DJoint>(world: &mut Physics2DWorld, joint: &Ref<T>) {
    let shared: Physics2DJointRef = joint.clone();
    add_physics2d_joint(world, &shared);
}

fn base(body_a: i32, body_b: i32) -> Physics2DJointOptions {
    return Physics2DJointOptions {
        body_a,
        body_b,
        break_force: None,
        break_torque: None,
        collide_connected: None,
        local_anchor_ax: None,
        local_anchor_ay: None,
        local_anchor_bx: None,
        local_anchor_by: None,
    };
}

fn body_box(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(body_type, x, y, None);
    let shape = CollisionShape2D::Aabb(CollisionAabb2D {
        min_x: -0.5,
        min_y: -0.5,
        max_x: 0.5,
        max_y: 0.5,
    });
    body.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(&shape, &STONE, None, None));
    return add_body(world, &body);
}

fn body_circle(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    local_x: f64,
    radius: f64,
    material: &Physics2DMaterial,
) -> Ref<RigidBody2D> {
    let body = create_rigid_body2d(body_type, x, y, None);
    let shape = CollisionShape2D::Circle(CollisionCircle2D {
        x: local_x,
        y: 0.0,
        radius,
    });
    body.write()
        .unwrap()
        .colliders
        .push(create_physics2d_collider(&shape, material, None, None));
    return add_body(world, &body);
}

// toBeCloseTo(expected, digits): |actual - expected| < 10^-digits / 2.
fn close(actual: f32, expected: f32, digits: i32) -> bool {
    return (actual - expected).abs() < 10f32.powi(-digits) / 2.0;
}

fn distance_joint(
    body_a: i32,
    body_b: i32,
    length: f32,
    frequency_hz: f32,
    damping_ratio: f32,
) -> Ref<Physics2DDistanceJoint> {
    return create_physics2d_distance_joint(&Physics2DDistanceJointOptions {
        base: base(body_a, body_b),
        damping_ratio: Some(damping_ratio),
        frequency_hz: Some(frequency_hz),
        length,
    });
}

fn gear_options(body_a: i32, body_b: i32) -> Physics2DGearJointOptions {
    return Physics2DGearJointOptions {
        axis_ax: Some(1.0),
        axis_ay: Some(0.0),
        axis_bx: Some(1.0),
        axis_by: Some(0.0),
        base: base(body_a, body_b),
        constant: 0.0,
        coordinate_a: Physics2DGearCoordinateKind::Angular,
        coordinate_b: Physics2DGearCoordinateKind::Angular,
        ratio: Some(1.0),
    };
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return body.read().unwrap().index;
}

fn mouse_joint(
    body_a: i32,
    body_b: i32,
    target_x: f32,
    target_y: f32,
    max_force: f32,
    frequency_hz: f32,
) -> Ref<Physics2DMouseJoint> {
    let joint = create_physics2d_mouse_joint(&Physics2DMouseJointOptions {
        body: body_b,
        break_force: None,
        break_torque: None,
        damping_ratio: Some(0.7),
        frequency_hz: Some(frequency_hz),
        local_anchor_x: None,
        local_anchor_y: None,
        max_force,
        target_x,
        target_y,
    });
    joint.write().unwrap().body_a = body_a;
    return joint;
}

fn prismatic_options(body_a: i32, body_b: i32) -> Physics2DPrismaticJointOptions {
    return Physics2DPrismaticJointOptions {
        base: base(body_a, body_b),
        enable_limit: Some(false),
        enable_limit_spring: None,
        enable_motor: Some(false),
        limit_damping_ratio: None,
        limit_frequency_hz: None,
        local_axis_ax: Some(1.0),
        local_axis_ay: Some(0.0),
        lower_translation: Some(0.0),
        max_motor_force: Some(0.0),
        motor_speed: Some(0.0),
        reference_angle: Some(0.0),
        upper_translation: Some(0.0),
    };
}

fn pulley_options(body_a: i32, body_b: i32) -> Physics2DPulleyJointOptions {
    return Physics2DPulleyJointOptions {
        base: base(body_a, body_b),
        constant: 4.0,
        ground_anchor_ax: 0.0,
        ground_anchor_ay: 0.0,
        ground_anchor_bx: 4.0,
        ground_anchor_by: 0.0,
        ratio: Some(1.0),
    };
}

fn register(world: &mut Physics2DWorld, kind: &str, solver: &Physics2DJointSolverRef) {
    register_physics2d_joint_solver(world, kind.to_string(), solver.clone());
}

fn revolute_options(body_a: i32, body_b: i32) -> Physics2DRevoluteJointOptions {
    return Physics2DRevoluteJointOptions {
        base: base(body_a, body_b),
        enable_limit: Some(false),
        enable_limit_spring: None,
        enable_motor: Some(false),
        limit_damping_ratio: None,
        limit_frequency_hz: None,
        lower_angle: Some(0.0),
        max_motor_torque: Some(0.0),
        motor_speed: Some(0.0),
        reference_angle: Some(0.0),
        upper_angle: Some(0.0),
    };
}

fn run(world: &mut Physics2DWorld, steps: usize) {
    for _ in 0..steps {
        step(world, 1.0 / 60.0);
    }
}

fn step(world: &mut Physics2DWorld, dt: f32) {
    step_physics2d(world, dt, &REGISTRY, None);
}

fn weld_joint(body_a: i32, body_b: i32, reference_angle: f32) -> Ref<Physics2DWeldJoint> {
    return create_physics2d_weld_joint(&Physics2DWeldJointOptions {
        base: base(body_a, body_b),
        reference_angle: Some(reference_angle),
    });
}

fn wheel_options(body_a: i32, body_b: i32) -> Physics2DWheelJointOptions {
    return Physics2DWheelJointOptions {
        base: base(body_a, body_b),
        damping_ratio: Some(0.7),
        enable_motor: Some(false),
        frequency_hz: Some(4.0),
        local_axis_ax: Some(0.0),
        local_axis_ay: Some(1.0),
        max_motor_torque: Some(0.0),
        motor_speed: Some(0.0),
        rest_translation: Some(-2.0),
    };
}

fn world(gravity_x: f32, gravity_y: f32) -> Physics2DWorld {
    return create_physics2d_world(Some(gravity_x), Some(gravity_y), None);
}

mod canonical_end_ordering_and_direction_bearing_joint_state {
    use super::*;

    // The generic swap in addPhysics2DJoint moves only what every joint has: two body indices and two
    // anchors. Anything a kind measures FROM bodyA TO bodyB reverses when the ends trade places, so each
    // kind answers for its own via swapEnds.
    #[test]
    fn negates_a_weld_reference_angle_when_the_ends_are_exchanged() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WELD_JOINT_KIND,
            &PHYSICS2D_WELD_JOINT_SOLVER,
        );
        let second = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let first = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        // Supplied high-index-first, so the ends must be exchanged.
        let joint = weld_joint(index_of(&first), index_of(&second), 0.5);
        add_joint(&mut world, &joint);
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&second));
        assert!(close(joint.reference_angle, -0.5, 12));
    }

    #[test]
    fn leaves_a_weld_reference_angle_alone_when_no_exchange_happens() {
        // swapEnds both vetoes and transforms, so it must only be consulted when a swap is pending.
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WELD_JOINT_KIND,
            &PHYSICS2D_WELD_JOINT_SOLVER,
        );
        let first = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let second = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        let joint = weld_joint(index_of(&first), index_of(&second), 0.5);
        add_joint(&mut world, &joint);
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&first));
        assert!(close(joint.reference_angle, 0.5, 12));
    }

    #[test]
    fn holds_the_same_physical_pose_whichever_order_the_weld_ends_were_supplied_in() {
        // The constraint is a fact about the pair, so which end the caller named first must not change
        // where the bodies end up.
        fn pose_for(supply_reversed: bool) -> f32 {
            let mut world = world(0.0, 0.0);
            register(
                &mut world,
                PHYSICS2D_WELD_JOINT_KIND,
                &PHYSICS2D_WELD_JOINT_SOLVER,
            );
            let low = body_box(&mut world, STATIC, 0.0, 0.0);
            let high = body_box(&mut world, DYNAMIC, 1.0, 0.0);
            let (a, b) = if supply_reversed {
                (index_of(&high), index_of(&low))
            } else {
                (index_of(&low), index_of(&high))
            };
            let joint = weld_joint(a, b, if supply_reversed { -0.4 } else { 0.4 });
            add_joint(&mut world, &joint);
            run(&mut world, 60);
            return high.read().unwrap().angle;
        }
        assert!(close(pose_for(true), pose_for(false), 6));
    }

    #[test]
    fn still_swaps_a_direction_free_kind_which_needs_no_transform() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
        );
        let second = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let first = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        let joint = distance_joint(index_of(&first), index_of(&second), 1.0, 0.0, 0.0);
        add_joint(&mut world, &joint);
        assert_eq!(joint.read().unwrap().body_a, index_of(&second));
    }
}

mod joint_warm_starting {
    use super::*;

    fn hanging_world(
        warm_starting: bool,
    ) -> (
        Ref<RigidBody2D>,
        Ref<Physics2DDistanceJoint>,
        Physics2DWorld,
    ) {
        let mut world = world(0.0, -10.0);
        world.config.warm_starting = warm_starting;
        register(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let hanging = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        let joint = distance_joint(index_of(&anchor), index_of(&hanging), 2.0, 0.0, 0.0);
        add_joint(&mut world, &joint);
        return (hanging, joint, world);
    }

    #[test]
    fn clears_the_accumulated_impulse_each_step_when_warm_starting_is_off() {
        // Cold start every step: the same step from the same state converges to the same impulse, so two
        // consecutive settled steps agree.
        let (_hanging, joint, mut world) = hanging_world(false);
        run(&mut world, 60);
        let first = joint.read().unwrap().impulse0;
        step(&mut world, 1.0 / 60.0);
        assert!(close(joint.read().unwrap().impulse0, first, 6));
    }

    #[test]
    fn invokes_each_kinds_warm_start_once_per_step_when_warm_starting_is_on() {
        // Asserted on the wiring rather than on a numerical difference: warm starting changes the path to
        // convergence, not the fixed point.
        let mut world = world(0.0, -10.0);
        world.config.warm_starting = true;
        let calls: Arc<Mutex<Vec<&'static str>>> = Arc::new(Mutex::new(Vec::new()));
        let (clear_calls, warm_calls) = (calls.clone(), calls.clone());
        let solver: Physics2DJointSolverRef = Arc::new(Physics2DJointSolver {
            clear_accumulated_impulses: Some(Arc::new(move |_| {
                clear_calls.lock().unwrap().push("clear")
            })),
            warm_start: Some(Arc::new(move |_, _| {
                warm_calls.lock().unwrap().push("warm")
            })),
            ..(**PHYSICS2D_DISTANCE_JOINT_SOLVER).clone()
        });
        register(&mut world, PHYSICS2D_DISTANCE_JOINT_KIND, &solver);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let hanging = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        add_joint(
            &mut world,
            &distance_joint(index_of(&anchor), index_of(&hanging), 2.0, 0.0, 0.0),
        );

        step(&mut world, 1.0 / 60.0);
        assert_eq!(*calls.lock().unwrap(), vec!["warm"]);

        world.config.warm_starting = false;
        step(&mut world, 1.0 / 60.0);
        assert_eq!(*calls.lock().unwrap(), vec!["warm", "clear"]);
    }

    #[test]
    fn leaves_a_kind_that_declares_neither_hook_untouched() {
        // Both hooks are optional: a kind that starts cold every step is correct, just slower to converge.
        let mut world = world(0.0, -10.0);
        let distance = &PHYSICS2D_DISTANCE_JOINT_SOLVER;
        let solver: Physics2DJointSolverRef = Arc::new(Physics2DJointSolver {
            clear_accumulated_impulses: None,
            keeps_bodies_awake: None,
            prepare: distance.prepare.clone(),
            scale_accumulated_impulses: None,
            solve: distance.solve.clone(),
            swap_ends: None,
            uses_body_a: None,
            warm_start: None,
            write_reaction: None,
        });
        register(&mut world, PHYSICS2D_DISTANCE_JOINT_KIND, &solver);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let hanging = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        add_joint(
            &mut world,
            &distance_joint(index_of(&anchor), index_of(&hanging), 2.0, 0.0, 0.0),
        );
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&mut world, 30)));
        assert!(result.is_ok());
        assert!(hanging.read().unwrap().y < -1.5);
    }

    #[test]
    fn holds_the_hanging_body_at_the_joint_length_either_way() {
        // Warm starting is a convergence aid, not a behaviour change: both settle to the same pose.
        let (cold_hanging, _cold_joint, mut cold_world) = hanging_world(false);
        let (warm_hanging, _warm_joint, mut warm_world) = hanging_world(true);
        run(&mut cold_world, 240);
        run(&mut warm_world, 240);
        let (warm_y, cold_y) = (
            warm_hanging.read().unwrap().y,
            cold_hanging.read().unwrap().y,
        );
        assert!(close(warm_y, cold_y, 2));
        assert!(warm_y < -1.5);
        assert!(warm_y > -2.5);
    }

    #[test]
    fn clears_a_weld_joint_every_impulse_it_accumulates_not_only_the_linear_pair() {
        let mut world = world(0.0, -10.0);
        world.config.warm_starting = false;
        register(
            &mut world,
            PHYSICS2D_WELD_JOINT_KIND,
            &PHYSICS2D_WELD_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        // Offset so gravity puts real load on both the linear and the angular part.
        let welded = body_box(&mut world, DYNAMIC, 3.0, 0.0);
        let joint = weld_joint(index_of(&anchor), index_of(&welded), 0.0);
        add_joint(&mut world, &joint);
        run(&mut world, 120);
        let (x, y, angular) = {
            let joint = joint.read().unwrap();
            (joint.impulse0, joint.impulse1, joint.impulse2)
        };
        assert!(y.abs() > 0.001);
        step(&mut world, 1.0 / 60.0);
        let joint = joint.read().unwrap();
        assert!(close(joint.impulse0, x, 4));
        assert!(close(joint.impulse1, y, 4));
        assert!(close(joint.impulse2, angular, 4));
    }
}

// The TS suite builds these joints with their impulse accumulators absent (a deserialized joint at
// runtime). A Rust joint always carries its accumulators (D15: an absent number field is not
// representable), so the nearest representable joint is one whose accumulators were never written by a
// step: the factory's zeroes. The asserted outcomes are unchanged.
mod joints_built_without_their_impulse_accumulators {
    use super::*;

    fn motor_revolute(body_a: i32, body_b: i32) -> Ref<Physics2DRevoluteJoint> {
        return create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_limit: Some(false),
            enable_motor: Some(true),
            lower_angle: Some(0.0),
            max_motor_torque: Some(100.0),
            motor_speed: Some(2.0),
            reference_angle: Some(0.0),
            upper_angle: Some(0.0),
            ..revolute_options(body_a, body_b)
        });
    }

    #[test]
    fn drives_a_revolute_motor_normally_when_the_ends_are_already_canonical() {
        let mut world = world(0.0, 0.0);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let arm = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        let joint = motor_revolute(index_of(&anchor), index_of(&arm));
        add_joint(&mut world, &joint);
        run(&mut world, 30);

        // The motor has to actually turn the arm toward its target speed.
        assert!(arm.read().unwrap().angular_velocity > 0.5);
        assert!(joint.read().unwrap().motor_impulse.is_finite());
    }

    #[test]
    fn drives_a_revolute_motor_normally_when_the_ends_must_be_exchanged_first() {
        // swapEnds runs when the joint is ADDED, before any prepare, and it negates the motor accumulator.
        let mut world = world(0.0, 0.0);
        let arm = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        // Supplied high-index-first, so the ends must be exchanged.
        let joint = motor_revolute(index_of(&anchor), index_of(&arm));
        add_joint(&mut world, &joint);
        // Magnitude, because negating an established zero yields -0.
        assert_eq!(joint.read().unwrap().motor_impulse.abs(), 0.0);

        run(&mut world, 30);

        assert!(arm.read().unwrap().angular_velocity.abs() > 0.5);
    }

    fn keeps_both_bodies_finite_across(
        kind: &str,
        solver: &Physics2DJointSolverRef,
        joint: impl FnOnce(i32, i32) -> Physics2DJointRef,
    ) {
        let mut world = create_physics2d_world(None, None, None);
        let first = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let second = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        register(&mut world, kind, solver);
        add_physics2d_joint(&mut world, &joint(index_of(&first), index_of(&second)));
        // Two steps, because the second is the one that warm-starts from the first step's accumulator.
        run(&mut world, 2);

        for body in [&first, &second] {
            let body = body.read().unwrap();
            assert!(body.velocity_x.is_finite());
            assert!(body.velocity_y.is_finite());
            assert!(body.angular_velocity.is_finite());
        }
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_distance_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
            |a, b| {
                return distance_joint(a, b, 2.0, 0.0, 0.0);
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_gear_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_GEAR_JOINT_KIND,
            &PHYSICS2D_GEAR_JOINT_SOLVER,
            |a, b| {
                return create_physics2d_gear_joint(&Physics2DGearJointOptions {
                    ratio: Some(2.0),
                    ..gear_options(a, b)
                });
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_prismatic_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
            |a, b| {
                return create_physics2d_prismatic_joint(&prismatic_options(a, b));
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_pulley_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_PULLEY_JOINT_KIND,
            &PHYSICS2D_PULLEY_JOINT_SOLVER,
            |a, b| {
                return create_physics2d_pulley_joint(&Physics2DPulleyJointOptions {
                    constant: 4.0,
                    ground_anchor_ax: 0.0,
                    ground_anchor_ay: 2.0,
                    ground_anchor_bx: 2.0,
                    ground_anchor_by: 2.0,
                    ratio: Some(1.0),
                    ..pulley_options(a, b)
                });
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_rope_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_ROPE_JOINT_KIND,
            &PHYSICS2D_ROPE_JOINT_SOLVER,
            |a, b| {
                return create_physics2d_rope_joint(&Physics2DRopeJointOptions {
                    base: base(a, b),
                    max_length: 1.0,
                });
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_weld_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_WELD_JOINT_KIND,
            &PHYSICS2D_WELD_JOINT_SOLVER,
            |a, b| {
                return weld_joint(a, b, 0.0);
            },
        );
    }

    #[test]
    fn keeps_both_bodies_finite_across_a_wheel_joint() {
        keeps_both_bodies_finite_across(
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
            |a, b| {
                return create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
                    rest_translation: Some(0.0),
                    ..wheel_options(a, b)
                });
            },
        );
    }
}

mod physics2d_distance_joint_solver {
    use super::*;

    // A hanging spring whose only dynamic body's mass is set by `density`; everything else is identical
    // between instances, so any difference in how it moves is a difference the mass caused.
    fn spring_world(density: f32) -> (Physics2DWorld, Ref<RigidBody2D>) {
        let material = Physics2DMaterial {
            density,
            friction: 0.0,
            restitution: 0.0,
        };
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
        );
        let anchor = body_circle(&mut world, STATIC, 0.0, 0.0, 0.0, 0.1, &material);
        let bob = body_circle(&mut world, DYNAMIC, 0.0, -2.0, 0.0, 0.5, &material);
        add_joint(
            &mut world,
            &distance_joint(index_of(&anchor), index_of(&bob), 1.0, 2.0, 0.2),
        );
        return (world, bob);
    }

    #[test]
    fn oscillates_an_authored_spring_at_the_same_rate_whatever_mass_hangs_off_it() {
        let (mut light_world, light) = spring_world(1.0);
        let (mut heavy_world, heavy) = spring_world(4.0);
        assert!(close(
            heavy.read().unwrap().mass,
            light.read().unwrap().mass * 4.0,
            12
        ));

        step(&mut light_world, 1.0 / 60.0);
        step(&mut heavy_world, 1.0 / 60.0);
        // Exactly equal, not close: mass has to cancel out of this completely, not mostly.
        assert_eq!(
            heavy.read().unwrap().velocity_y,
            light.read().unwrap().velocity_y
        );

        // Half a period, measured as the swing back through rest to the far side.
        let half_period = |world: &mut Physics2DWorld, bob: &Ref<RigidBody2D>| -> i32 {
            for step_index in 1..600 {
                step(world, 1.0 / 60.0);
                if step_index > 2 && bob.read().unwrap().velocity_y <= 0.0 {
                    return step_index;
                }
            }
            return -1;
        };
        let light_half_period = half_period(&mut light_world, &light);
        assert_eq!(half_period(&mut heavy_world, &heavy), light_half_period);

        // A 2 Hz spring at damping ratio 0.2 has a damped half-period of 15.3 steps at 60 Hz.
        assert!(light_half_period > 14);
        assert!(light_half_period < 17);
    }

    // TS interleaves a nested world's prepare inside this joint's prepare through an accessor on
    // `impulse0`; a Rust field has no accessor (D15), so the nested prepare runs between this joint's
    // prepare and solve instead — the window in which shared prepare scratch would be clobbered.
    #[test]
    fn keeps_prepared_axis_and_mass_local_when_a_joint_getter_prepares_another_world() {
        let mut world = world(0.0, 0.0);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let bob = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        let joint = distance_joint(index_of(&anchor), index_of(&bob), 1.0, 0.0, 0.0);

        let mut nested_world = super::world(0.0, 0.0);
        let nested_anchor = body_box(&mut nested_world, STATIC, 0.0, 0.0);
        let nested_bob = body_box(&mut nested_world, DYNAMIC, 0.0, 4.0);
        let nested_joint = distance_joint(
            index_of(&nested_anchor),
            index_of(&nested_bob),
            3.0,
            2.0,
            0.5,
        );
        let mut nested_calls = 0;

        let solver = &PHYSICS2D_DISTANCE_JOINT_SOLVER;
        (solver.prepare)(&world, &mut *joint.write().unwrap(), 1.0 / 60.0);
        if nested_calls == 0 {
            nested_calls += 1;
            (solver.prepare)(
                &nested_world,
                &mut *nested_joint.write().unwrap(),
                1.0 / 60.0,
            );
        }
        (solver.solve)(&world, &mut *joint.write().unwrap());

        assert_eq!(nested_calls, 1);
        let bob = bob.read().unwrap();
        assert!(bob.velocity_x < 0.0);
        assert!(close(bob.velocity_y, 0.0, 2));
    }

    #[test]
    fn holds_a_hanging_body_at_the_joint_length_instead_of_letting_it_fall() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 5.0);
        let bob = body_box(&mut world, DYNAMIC, 0.0, 3.0);
        add_joint(
            &mut world,
            &distance_joint(index_of(&anchor), index_of(&bob), 2.0, 0.0, 0.0),
        );
        run(&mut world, 240);

        let (anchor, bob) = (anchor.read().unwrap(), bob.read().unwrap());
        let separation = ((bob.x - anchor.x).powi(2) + (bob.y - anchor.y).powi(2)).sqrt();
        assert!(separation > 1.9);
        assert!(separation < 2.1);
    }

    #[test]
    fn swings_a_displaced_bob_back_under_the_anchor_rather_than_holding_it_out_sideways() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_DISTANCE_JOINT_KIND,
            &PHYSICS2D_DISTANCE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 5.0);
        let bob = body_box(&mut world, DYNAMIC, 2.0, 5.0);
        bob.write().unwrap().linear_damping = 1.5;
        add_joint(
            &mut world,
            &distance_joint(index_of(&anchor), index_of(&bob), 2.0, 0.0, 0.0),
        );
        run(&mut world, 600);
        assert!(bob.read().unwrap().y < 4.0);
    }
}

mod physics2d_gear_joint_solver {
    use super::*;

    #[test]
    fn keeps_two_angular_coordinates_at_their_configured_ratio() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_GEAR_JOINT_KIND,
            &PHYSICS2D_GEAR_JOINT_SOLVER,
        );
        let first = body_box(&mut world, DYNAMIC, -2.0, 0.0);
        let second = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        first.write().unwrap().angular_velocity = 2.0;
        let joint = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            ratio: Some(2.0),
            ..gear_options(index_of(&first), index_of(&second))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 120);

        let (first, second) = (first.read().unwrap(), second.read().unwrap());
        assert!(close(first.angle + 2.0 * second.angle, 0.0, 5));
        assert!(first.angular_velocity > 0.0);
        assert!(second.angular_velocity < 0.0);
    }

    #[test]
    fn couples_linear_and_angular_coordinates_for_a_rack_and_pinion() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_GEAR_JOINT_KIND,
            &PHYSICS2D_GEAR_JOINT_SOLVER,
        );
        let rack = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let pinion = body_box(&mut world, DYNAMIC, 4.0, 0.0);
        rack.write().unwrap().velocity_x = 2.0;
        let joint = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            axis_ax: Some(5.0),
            coordinate_a: Physics2DGearCoordinateKind::Linear,
            coordinate_b: Physics2DGearCoordinateKind::Angular,
            ratio: Some(2.0),
            ..gear_options(index_of(&rack), index_of(&pinion))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 120);

        let (rack, pinion) = (rack.read().unwrap(), pinion.read().unwrap());
        assert!(close(rack.x + 2.0 * pinion.angle, 0.0, 5));
        assert!(rack.x > 0.0);
        assert!(pinion.angle < 0.0);
    }

    #[test]
    fn corrects_a_coordinate_pair_that_starts_away_from_its_constant() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_GEAR_JOINT_KIND,
            &PHYSICS2D_GEAR_JOINT_SOLVER,
        );
        let first = body_box(&mut world, DYNAMIC, -2.0, 0.0);
        let second = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        first.write().unwrap().angle = 1.0;
        let joint = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            ratio: Some(-1.0),
            ..gear_options(index_of(&first), index_of(&second))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 60);

        assert!(close(
            first.read().unwrap().angle - second.read().unwrap().angle,
            0.0,
            5
        ));
    }

    #[test]
    fn preserves_the_same_constraint_when_canonical_ordering_exchanges_the_ends() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_GEAR_JOINT_KIND,
            &PHYSICS2D_GEAR_JOINT_SOLVER,
        );
        let first = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        let second = body_box(&mut world, DYNAMIC, -2.0, 0.0);
        let joint = create_physics2d_gear_joint(&Physics2DGearJointOptions {
            axis_ax: Some(1.0),
            axis_ay: Some(2.0),
            axis_bx: Some(3.0),
            axis_by: Some(4.0),
            constant: 6.0,
            coordinate_a: Physics2DGearCoordinateKind::Linear,
            coordinate_b: Physics2DGearCoordinateKind::Angular,
            ratio: Some(2.0),
            ..gear_options(index_of(&second), index_of(&first))
        });
        joint.write().unwrap().impulse0 = 3.0;

        add_joint(&mut world, &joint);

        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&first));
        assert_eq!(joint.coordinate_a, Physics2DGearCoordinateKind::Angular);
        assert_eq!(joint.coordinate_b, Physics2DGearCoordinateKind::Linear);
        assert_eq!(joint.axis_ax, 3.0);
        assert_eq!(joint.axis_ay, 4.0);
        assert_eq!(joint.axis_bx, 1.0);
        assert_eq!(joint.axis_by, 2.0);
        assert!(close(joint.ratio, 0.5, 12));
        assert!(close(joint.constant, 3.0, 12));
        assert!(close(joint.impulse0, 6.0, 12));
    }
}

mod physics2d_mouse_joint_solver {
    use super::*;

    fn keeps_a_low_frequency_response_directed_toward_the_target_at(frequency_hz: f32) {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let index = index_of(&dragged);
        add_joint(
            &mut world,
            &mouse_joint(index, index, 5.0, 0.0, 1_000_000.0, frequency_hz),
        );

        step(&mut world, 1.0 / 60.0);

        let dragged = dragged.read().unwrap();
        assert!(dragged.x > 0.0);
        assert!(dragged.velocity_x > 0.0);
        assert!(dragged.x.is_finite());
        assert!(dragged.velocity_x.is_finite());
    }

    #[test]
    fn drags_a_body_toward_its_target() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let index = index_of(&dragged);
        add_joint(
            &mut world,
            &mouse_joint(index, index, 5.0, 0.0, 1000.0, 5.0),
        );
        run(&mut world, 120);
        assert!(dragged.read().unwrap().x > 3.0);
    }

    #[test]
    fn drags_its_body_when_the_unused_body_a_placeholder_does_not_resolve() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        add_joint(
            &mut world,
            &mouse_joint(999, index_of(&dragged), 5.0, 0.0, 1000.0, 5.0),
        );

        run(&mut world, 60);

        assert!(dragged.read().unwrap().x > 3.0);
    }

    #[test]
    fn keeps_accepting_moved_targets_after_being_held_still_past_the_sleep_timeout() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let index = index_of(&dragged);
        let joint = mouse_joint(index, index, 0.0, 0.0, 1000.0, 5.0);
        add_joint(&mut world, &joint);
        run(&mut world, 60);
        assert!(!dragged.read().unwrap().sleeping);

        joint.write().unwrap().target_x = 5.0;
        step(&mut world, 1.0 / 30.0);

        let dragged = dragged.read().unwrap();
        assert!(dragged.velocity_x > 0.0);
        assert!(dragged.x > 0.0);
    }

    #[test]
    fn pulls_a_resting_body_off_a_surface_without_an_unstable_response() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let floor = create_rigid_body2d(STATIC, 0.0, 0.0, None);
        let floor_shape = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -10.0,
            min_y: -1.0,
            max_x: 10.0,
            max_y: 0.0,
        });
        floor
            .write()
            .unwrap()
            .colliders
            .push(create_physics2d_collider(&floor_shape, &STONE, None, None));
        add_body(&mut world, &floor);
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.5);
        for _ in 0..120 {
            step(&mut world, 1.0 / 30.0);
        }

        let (x, y, mass) = {
            let dragged = dragged.read().unwrap();
            (dragged.x, dragged.y, dragged.mass)
        };
        let joint = create_physics2d_mouse_joint(&Physics2DMouseJointOptions {
            body: index_of(&dragged),
            break_force: None,
            break_torque: None,
            damping_ratio: Some(0.7),
            frequency_hz: Some(5.0),
            local_anchor_x: Some(0.3),
            local_anchor_y: Some(0.2),
            max_force: 1000.0 * mass,
            target_x: x + 0.3,
            target_y: y + 0.2,
        });
        add_joint(&mut world, &joint);
        {
            let mut joint = joint.write().unwrap();
            joint.target_x = 3.0;
            joint.target_y = 2.5;
        }
        for _ in 0..180 {
            step(&mut world, 1.0 / 30.0);
        }

        let dragged = dragged.read().unwrap();
        assert!(dragged.x > 2.0);
        assert!(dragged.y > 1.5);
        assert!(dragged.velocity_x.is_finite());
        assert!(dragged.velocity_y.is_finite());
        assert!(dragged.velocity_x.abs() < 10.0);
        assert!(dragged.velocity_y.abs() < 10.0);
    }

    #[test]
    fn keeps_a_low_frequency_response_directed_toward_the_target_at_0_5_hz() {
        keeps_a_low_frequency_response_directed_toward_the_target_at(0.5);
    }

    #[test]
    fn keeps_a_low_frequency_response_directed_toward_the_target_at_5_hz() {
        keeps_a_low_frequency_response_directed_toward_the_target_at(5.0);
    }

    // The mouse joint declares no warmStart, because a target that moves between steps invalidates the
    // previous impulse; the step must start it cold even while the world warm-starts.
    #[test]
    fn starts_cold_each_step_even_while_the_world_is_warm_starting() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let index = index_of(&dragged);
        let joint = mouse_joint(index, index, 5.0, 0.0, 1000.0, 5.0);
        add_joint(&mut world, &joint);
        run(&mut world, 30);

        // Park the body: stop it dead and put the target exactly where the body already is.
        {
            let mut dragged = dragged.write().unwrap();
            dragged.velocity_x = 0.0;
            dragged.velocity_y = 0.0;
            let mut joint = joint.write().unwrap();
            joint.target_x = dragged.x;
            joint.target_y = dragged.y;
        }

        step(&mut world, 1.0 / 60.0);

        let dragged = dragged.read().unwrap();
        assert!(dragged.velocity_x.abs() < 1e-6);
        assert!(dragged.velocity_y.abs() < 1e-6);
    }

    #[test]
    fn respects_its_force_bound_rather_than_injecting_unbounded_energy() {
        // The bound a force implies is dv <= F*dt/m per step.
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let max_force = 1.0;
        let dt = 0.01;
        let index = index_of(&dragged);
        add_joint(
            &mut world,
            &mouse_joint(index, index, 1000.0, 0.0, max_force, 5.0),
        );

        let per_step = (max_force * dt) / (1.0 / dragged.read().unwrap().inverse_mass);
        let mut previous = dragged.read().unwrap().velocity_x;
        for _ in 0..20 {
            step(&mut world, dt);
            let velocity_x = dragged.read().unwrap().velocity_x;
            // f32: the delta of two accumulated f32 velocities measured 0.010000005 against a bound of 0.01
            // (5e-7 relative); TS's 1e-7 slack is an f64 margin, so the slack is 1e-6 here.
            assert!((velocity_x - previous).abs() <= per_step * 1.000001);
            previous = velocity_x;
        }
        assert!(dragged.read().unwrap().x.is_finite());
    }

    #[test]
    fn scales_the_impulse_bound_with_the_timestep_so_the_force_means_the_same_at_any_dt() {
        // A force bound that ignored dt would let a smaller step inject the same impulse more often.
        let mut speeds = Vec::new();
        for dt in [0.02, 0.01] {
            let mut world = world(0.0, 0.0);
            register(
                &mut world,
                PHYSICS2D_MOUSE_JOINT_KIND,
                &PHYSICS2D_MOUSE_JOINT_SOLVER,
            );
            let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
            let index = index_of(&dragged);
            add_joint(
                &mut world,
                &mouse_joint(index, index, 1000.0, 0.0, 1.0, 5.0),
            );
            step(&mut world, dt);
            speeds.push(dragged.read().unwrap().velocity_x.abs());
        }
        // Halving dt halves the impulse a single step may deliver.
        assert!(close(speeds[1], speeds[0] / 2.0, 10));
    }

    #[test]
    fn drags_the_dynamic_body_even_when_it_was_added_before_its_anchor() {
        // A mouse joint has only one real body, so canonical ordering must not move the dragged body into
        // bodyA while this solver acts on bodyB.
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        assert!(index_of(&dragged) < index_of(&anchor));

        let joint = mouse_joint(index_of(&anchor), index_of(&dragged), 5.0, 0.0, 1000.0, 5.0);
        add_joint(&mut world, &joint);
        assert_eq!(joint.read().unwrap().body_b, index_of(&dragged));

        run(&mut world, 60);
        assert!(dragged.read().unwrap().x > 3.0);
        assert_eq!(anchor.read().unwrap().x, 0.0);
    }

    #[test]
    fn drags_the_dynamic_body_when_it_was_added_after_its_anchor() {
        // The orientation that already worked, kept so the veto cannot be "fixed" by breaking this one.
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_MOUSE_JOINT_KIND,
            &PHYSICS2D_MOUSE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 0.0);
        let dragged = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = mouse_joint(index_of(&anchor), index_of(&dragged), 5.0, 0.0, 1000.0, 5.0);
        add_joint(&mut world, &joint);
        assert_eq!(joint.read().unwrap().body_b, index_of(&dragged));
        run(&mut world, 60);
        assert!(dragged.read().unwrap().x > 3.0);
    }
}

mod physics2d_prismatic_joint_solver {
    use super::*;

    // A vertical rail with a stop below it, so a slider falls onto the stop and how far it sinks past is
    // the compliance.
    const RAIL_LOWER: f32 = -1.0;
    const RAIL_DT: f32 = 1.0 / 480.0;

    fn rail_world(density: f32) -> (Physics2DWorld, Ref<RigidBody2D>, Ref<RigidBody2D>) {
        let material = Physics2DMaterial {
            density,
            friction: 0.0,
            restitution: 0.0,
        };
        let mut world = world(0.0, -10.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_circle(&mut world, STATIC, 0.0, 0.0, 0.0, 0.1, &material);
        let slider = body_circle(&mut world, DYNAMIC, 0.0, -0.5, 0.0, 0.3, &material);
        return (world, rail, slider);
    }

    fn rail_joint(
        rail: &Ref<RigidBody2D>,
        slider: &Ref<RigidBody2D>,
        lower: f32,
        upper: f32,
        enable_limit_spring: bool,
        frequency_hz: f32,
    ) -> Ref<Physics2DPrismaticJoint> {
        return create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_limit: Some(true),
            enable_limit_spring: Some(enable_limit_spring),
            limit_damping_ratio: Some(1.0),
            limit_frequency_hz: Some(frequency_hz),
            local_axis_ax: Some(0.0),
            local_axis_ay: Some(1.0),
            lower_translation: Some(lower),
            upper_translation: Some(upper),
            ..prismatic_options(index_of(rail), index_of(slider))
        });
    }

    // Returns (sink, predicted sink, slider).
    fn limited_slider(
        density: f32,
        frequency_hz: f32,
        enable_limit_spring: bool,
    ) -> (f32, f32, Ref<RigidBody2D>) {
        let (mut world, rail, slider) = rail_world(density);
        add_joint(
            &mut world,
            &rail_joint(
                &rail,
                &slider,
                RAIL_LOWER,
                1.0,
                enable_limit_spring,
                frequency_hz,
            ),
        );
        for _ in 0..2400 {
            step(&mut world, RAIL_DT);
        }
        // Weight over a spring rate of `m * (2*pi*f)^2`, so mass cancels and the sink is `g / omega^2`.
        let predicted_sink = 10.0 / (2.0 * std::f32::consts::PI * frequency_hz).powi(2);
        let sink = RAIL_LOWER - slider.read().unwrap().y;
        return (sink, predicted_sink, slider);
    }

    #[test]
    fn arrests_the_slider_at_a_hard_travel_stop() {
        assert!(limited_slider(1.0, 0.0, false).0 < 0.02);
    }

    #[test]
    fn sinks_past_a_compliant_travel_stop_by_the_depth_its_authored_frequency_predicts() {
        for frequency in [20.0, 40.0] {
            let (sink, predicted_sink, _slider) = limited_slider(1.0, frequency, true);
            assert!(close(sink, predicted_sink, 3), "{frequency} Hz");
        }
    }

    #[test]
    fn sinks_the_same_depth_whatever_the_slider_weighs() {
        let (light_sink, _, light) = limited_slider(1.0, 20.0, true);
        let (heavy_sink, _, heavy) = limited_slider(4.0, 20.0, true);
        assert!(close(
            heavy.read().unwrap().mass,
            light.read().unwrap().mass * 4.0,
            9
        ));
        assert_eq!(heavy_sink, light_sink);
    }

    #[test]
    fn leaves_a_pinned_rail_hard_because_a_zero_width_range_has_no_side_to_yield_toward() {
        // Coincident bounds make the axis row a two-sided equality rather than a stop.
        let (mut world, rail, slider) = rail_world(1.0);
        add_joint(
            &mut world,
            &rail_joint(&rail, &slider, -0.5, -0.5, true, 20.0),
        );

        for _ in 0..1200 {
            step(&mut world, RAIL_DT);
        }

        assert!(close(slider.read().unwrap().y, -0.5, 3));
    }

    #[test]
    fn allows_motion_along_its_axis_while_removing_perpendicular_motion_and_relative_rotation() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 0.0, 1.0);
        {
            let mut slider = slider.write().unwrap();
            slider.angle = 0.4;
            slider.velocity_x = 2.0;
        }
        add_joint(
            &mut world,
            &create_physics2d_prismatic_joint(&prismatic_options(
                index_of(&rail),
                index_of(&slider),
            )),
        );

        run(&mut world, 120);

        let slider = slider.read().unwrap();
        assert!(slider.x > 3.0);
        assert!(slider.y.abs() < 0.05);
        assert!(slider.angle.abs() < 0.05);
    }

    #[test]
    fn keeps_the_slider_on_an_axis_carried_by_a_rotating_rail_body() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 2.0, 0.0);
        rail.write().unwrap().angular_velocity = 1.0;
        slider.write().unwrap().angular_velocity = 1.0;
        add_joint(
            &mut world,
            &create_physics2d_prismatic_joint(&prismatic_options(
                index_of(&rail),
                index_of(&slider),
            )),
        );

        run(&mut world, 60);

        let (rail, slider) = (rail.read().unwrap(), slider.read().unwrap());
        let axis_x = rail.angle.cos();
        let axis_y = rail.angle.sin();
        let distance_x = slider.x - rail.x;
        let distance_y = slider.y - rail.y;
        let perpendicular_error = -axis_y * distance_x + axis_x * distance_y;
        assert!(perpendicular_error.abs() < 0.1);
        assert!(close(slider.angle, rail.angle, 3));
    }

    #[test]
    fn drives_translation_toward_its_motor_speed() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_motor: Some(true),
            max_motor_force: Some(1000.0),
            motor_speed: Some(2.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 30);

        let slider = slider.read().unwrap();
        assert!(close(slider.velocity_x, 2.0, 6));
        assert!(close(slider.x, 1.0, 3));
    }

    #[test]
    fn bounds_its_motor_impulse_by_force_times_timestep() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let max_motor_force = 1.0;
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_motor: Some(true),
            max_motor_force: Some(max_motor_force),
            motor_speed: Some(100.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });
        add_joint(&mut world, &joint);

        let dt = 0.01;
        step(&mut world, dt);

        let slider = slider.read().unwrap();
        let maximum_delta = max_motor_force * dt * slider.inverse_mass;
        assert!(slider.velocity_x > 0.0);
        assert!(slider.velocity_x <= maximum_delta * 1.0000001);
    }

    #[test]
    fn exerts_no_force_after_its_motor_is_disabled() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_motor: Some(true),
            max_motor_force: Some(1.0),
            motor_speed: Some(10.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });
        add_joint(&mut world, &joint);
        step(&mut world, 1.0 / 60.0);

        joint.write().unwrap().enable_motor = false;
        slider.write().unwrap().velocity_x = 0.0;
        step(&mut world, 1.0 / 60.0);

        assert_eq!(joint.read().unwrap().motor_impulse, 0.0);
        assert_eq!(slider.read().unwrap().velocity_x, 0.0);
    }

    #[test]
    fn stops_a_motor_at_the_upper_translation_limit() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_limit: Some(true),
            enable_motor: Some(true),
            lower_translation: Some(-0.5),
            max_motor_force: Some(1000.0),
            motor_speed: Some(5.0),
            upper_translation: Some(1.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 120);

        let slider = slider.read().unwrap();
        assert!(close(slider.x, 1.0, 5));
        assert!(close(slider.velocity_x, 0.0, 5));
    }

    #[test]
    fn corrects_a_translation_already_below_the_lower_limit() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let slider = body_box(&mut world, DYNAMIC, -2.0, 0.0);
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_limit: Some(true),
            lower_translation: Some(-1.0),
            upper_translation: Some(1.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 60);

        assert!(slider.read().unwrap().x > -1.05);
    }

    #[test]
    fn preserves_axis_direction_and_translation_limits_when_canonical_ordering_swaps_the_ends() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PRISMATIC_JOINT_KIND,
            &PHYSICS2D_PRISMATIC_JOINT_SOLVER,
        );
        let slider = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        let rail = body_box(&mut world, STATIC, 0.0, 0.0);
        let joint = create_physics2d_prismatic_joint(&Physics2DPrismaticJointOptions {
            enable_limit: Some(true),
            local_axis_ax: Some(-1.0),
            lower_translation: Some(-2.0),
            motor_speed: Some(3.0),
            reference_angle: Some(0.0),
            upper_translation: Some(4.0),
            ..prismatic_options(index_of(&rail), index_of(&slider))
        });

        add_joint(&mut world, &joint);

        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&slider));
        assert_eq!(joint.local_axis_ax, 1.0);
        assert_eq!(joint.lower_translation, -2.0);
        assert_eq!(joint.upper_translation, 4.0);
        assert_eq!(joint.motor_speed, 3.0);
    }
}

mod physics2d_pulley_joint_solver {
    use super::*;

    #[test]
    fn preserves_the_coupled_cable_length_while_transferring_motion_between_its_ends() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PULLEY_JOINT_KIND,
            &PHYSICS2D_PULLEY_JOINT_SOLVER,
        );
        let left = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        let right = body_box(&mut world, DYNAMIC, 4.0, -2.0);
        left.write().unwrap().velocity_y = -2.0;
        add_joint(
            &mut world,
            &create_physics2d_pulley_joint(&pulley_options(index_of(&left), index_of(&right))),
        );

        run(&mut world, 120);

        let (left, right) = (left.read().unwrap(), right.read().unwrap());
        let length_a = left.x.hypot(left.y);
        let length_b = (right.x - 4.0).hypot(right.y);
        assert!(close(length_a + length_b, 4.0, 3));
        assert!(left.y < -2.5);
        assert!(right.y > -1.5);
    }

    #[test]
    fn weights_the_second_cable_length_by_its_configured_ratio() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PULLEY_JOINT_KIND,
            &PHYSICS2D_PULLEY_JOINT_SOLVER,
        );
        let left = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        let right = body_box(&mut world, DYNAMIC, 4.0, -2.0);
        left.write().unwrap().velocity_y = -2.0;
        let joint = create_physics2d_pulley_joint(&Physics2DPulleyJointOptions {
            constant: 6.0,
            ratio: Some(2.0),
            ..pulley_options(index_of(&left), index_of(&right))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 120);

        let (left, right) = (left.read().unwrap(), right.read().unwrap());
        let length_a = left.x.hypot(left.y);
        let length_b = (right.x - 4.0).hypot(right.y);
        assert!(close(length_a + 2.0 * length_b, 6.0, 3));
        assert!((left.y + 2.0).abs() > (right.y + 2.0).abs());
    }

    #[test]
    fn preserves_the_same_constraint_when_canonical_ordering_exchanges_the_ends() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_PULLEY_JOINT_KIND,
            &PHYSICS2D_PULLEY_JOINT_SOLVER,
        );
        let first = body_box(&mut world, DYNAMIC, 4.0, -2.0);
        let second = body_box(&mut world, DYNAMIC, 0.0, -2.0);
        let joint = create_physics2d_pulley_joint(&Physics2DPulleyJointOptions {
            constant: 6.0,
            ground_anchor_ax: 0.0,
            ground_anchor_ay: 1.0,
            ground_anchor_bx: 4.0,
            ground_anchor_by: 2.0,
            ratio: Some(2.0),
            ..pulley_options(index_of(&second), index_of(&first))
        });
        joint.write().unwrap().impulse0 = 3.0;

        add_joint(&mut world, &joint);

        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&first));
        assert_eq!(joint.ground_anchor_ax, 4.0);
        assert_eq!(joint.ground_anchor_ay, 2.0);
        assert_eq!(joint.ground_anchor_bx, 0.0);
        assert_eq!(joint.ground_anchor_by, 1.0);
        assert!(close(joint.ratio, 0.5, 12));
        assert!(close(joint.constant, 3.0, 12));
        assert!(close(joint.impulse0, 6.0, 12));
    }
}

mod physics2d_revolute_joint_solver {
    use super::*;

    // A hinged arm whose mass hangs 1.5 to the side, limited below at LIMIT_ANGLE, so gravity drives it
    // into the lower stop and how far past it settles is the compliance under test.
    const LIMIT_ANGLE: f32 = -0.05;
    const LIMIT_DT: f32 = 1.0 / 480.0;

    // Returns (sag, predicted sag, arm).
    fn limited_arm(
        density: f32,
        frequency_hz: f32,
        enable_limit_spring: bool,
    ) -> (f32, f32, Ref<RigidBody2D>) {
        let material = Physics2DMaterial {
            density,
            friction: 0.0,
            restitution: 0.0,
        };
        let mut world = world(0.0, -10.0);
        register(
            &mut world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        let post = body_circle(&mut world, STATIC, 0.0, 0.0, 0.0, 0.1, &material);
        let arm = body_circle(&mut world, DYNAMIC, 0.0, 0.0, 1.5, 0.3, &material);
        let joint = create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_limit: Some(true),
            enable_limit_spring: Some(enable_limit_spring),
            limit_damping_ratio: Some(1.0),
            limit_frequency_hz: Some(frequency_hz),
            lower_angle: Some(LIMIT_ANGLE),
            upper_angle: Some(1.0),
            ..revolute_options(index_of(&post), index_of(&arm))
        });
        add_joint(&mut world, &joint);
        for _ in 0..2400 {
            step(&mut world, LIMIT_DT);
        }
        // The arm's weight applies this moment about the hinge, resisted by stiffness `I * (2*pi*f)^2`.
        let (mass, inertia, angle) = {
            let arm = arm.read().unwrap();
            (arm.mass, arm.inertia, arm.angle)
        };
        let predicted_sag =
            (mass * 10.0 * 1.5) / (inertia * (2.0 * std::f32::consts::PI * frequency_hz).powi(2));
        return (LIMIT_ANGLE - angle, predicted_sag, arm);
    }

    #[test]
    fn arrests_the_arm_at_a_hard_limit_which_is_what_a_joint_that_sets_no_spring_still_gets() {
        let (sag, _, _) = limited_arm(1.0, 0.0, false);
        assert!(sag < 0.001);
    }

    #[test]
    fn lets_a_compliant_limit_sag_by_the_deflection_its_authored_frequency_predicts() {
        for frequency in [20.0, 40.0] {
            let (sag, predicted_sag, _) = limited_arm(1.0, frequency, true);
            assert!(close(sag, predicted_sag, 3), "{frequency} Hz");
        }
    }

    #[test]
    fn sags_four_times_as_far_when_the_limit_spring_is_half_the_frequency() {
        // Deflection goes as 1 / omega^2, so halving the frequency quadruples it.
        let (stiff, _, _) = limited_arm(1.0, 40.0, true);
        let (soft, _, _) = limited_arm(1.0, 20.0, true);
        assert!(close(soft / stiff, 4.0, 1));
    }

    #[test]
    fn sags_the_same_distance_whatever_the_arm_weighs() {
        // Both the driving moment and the stiffness scale with mass, so it cancels exactly.
        let (light_sag, _, light) = limited_arm(1.0, 20.0, true);
        let (heavy_sag, _, heavy) = limited_arm(4.0, 20.0, true);
        assert!(close(
            heavy.read().unwrap().mass,
            light.read().unwrap().mass * 4.0,
            9
        ));
        assert_eq!(heavy_sag, light_sag);
    }

    #[test]
    fn stays_one_sided_when_softened_and_never_pulls_the_arm_back_inside_the_range() {
        let (sag, _, arm) = limited_arm(1.0, 20.0, true);
        assert!(sag > 0.0);
        assert!(arm.read().unwrap().angle < LIMIT_ANGLE);
    }

    #[test]
    fn behaves_exactly_as_a_hard_stop_when_the_spring_is_enabled_with_no_frequency() {
        let (_, _, hard) = limited_arm(1.0, 0.0, false);
        let (_, _, frequencyless) = limited_arm(1.0, 0.0, true);
        assert_eq!(
            frequencyless.read().unwrap().angle,
            hard.read().unwrap().angle
        );
    }

    #[test]
    fn keeps_the_pinned_anchors_together_while_leaving_rotation_free() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 5.0);
        let arm = body_box(&mut world, DYNAMIC, 1.0, 5.0);
        let joint = create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            base: Physics2DJointOptions {
                local_anchor_ax: Some(0.0),
                local_anchor_ay: Some(0.0),
                local_anchor_bx: Some(-1.0),
                local_anchor_by: Some(0.0),
                ..base(index_of(&anchor), index_of(&arm))
            },
            ..revolute_options(index_of(&anchor), index_of(&arm))
        });
        add_joint(&mut world, &joint);
        run(&mut world, 180);

        // The arm's anchor point must stay on the static body's anchor.
        let (anchor, arm) = (anchor.read().unwrap(), arm.read().unwrap());
        let cos = arm.angle.cos();
        let sin = arm.angle.sin();
        let anchor_x = arm.x + -1.0 * cos - 0.0 * sin;
        let anchor_y = arm.y + -1.0 * sin + 0.0 * cos;
        assert!((anchor_x - anchor.x).abs() < 0.15);
        assert!((anchor_y - anchor.y).abs() < 0.15);
        // Rotation is free, so gravity must have swung it.
        assert!(arm.angle.abs() > 0.05);
    }
}

mod physics2d_revolute_joint_solver_motor_and_limits {
    use super::*;

    fn hinged(world: &mut Physics2DWorld) -> (Ref<RigidBody2D>, Ref<RigidBody2D>) {
        register(
            world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        let anchor = body_box(world, STATIC, 0.0, 0.0);
        let arm = body_box(world, DYNAMIC, 0.0, 0.0);
        return (anchor, arm);
    }

    fn motor(
        anchor: &Ref<RigidBody2D>,
        arm: &Ref<RigidBody2D>,
        enable_motor: bool,
        max_motor_torque: f32,
        motor_speed: f32,
    ) -> Ref<Physics2DRevoluteJoint> {
        return create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_motor: Some(enable_motor),
            max_motor_torque: Some(max_motor_torque),
            motor_speed: Some(motor_speed),
            ..revolute_options(index_of(anchor), index_of(arm))
        });
    }

    fn limited(
        anchor: &Ref<RigidBody2D>,
        arm: &Ref<RigidBody2D>,
        lower_angle: f32,
        upper_angle: f32,
        max_motor_torque: f32,
        motor_speed: f32,
    ) -> Ref<Physics2DRevoluteJoint> {
        return create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_limit: Some(true),
            enable_motor: Some(true),
            lower_angle: Some(lower_angle),
            max_motor_torque: Some(max_motor_torque),
            motor_speed: Some(motor_speed),
            upper_angle: Some(upper_angle),
            ..revolute_options(index_of(anchor), index_of(arm))
        });
    }

    #[test]
    fn drives_the_relative_angular_velocity_to_the_motor_speed() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &motor(&anchor, &arm, true, 100.0, 2.0));
        run(&mut world, 30);
        let arm = arm.read().unwrap();
        assert!(close(arm.angular_velocity, 2.0, 6));
        // Half a second at 2 rad/s.
        assert!(close(arm.angle, 1.0, 3));
    }

    #[test]
    fn drives_the_relative_angle_the_other_way_for_a_negative_motor_speed() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &motor(&anchor, &arm, true, 100.0, -2.0));
        run(&mut world, 30);
        assert!(close(arm.read().unwrap().angular_velocity, -2.0, 6));
    }

    #[test]
    fn does_not_drive_the_arm_at_all_when_the_motor_is_disabled() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &motor(&anchor, &arm, false, 100.0, 2.0));
        run(&mut world, 30);
        assert!(close(arm.read().unwrap().angular_velocity, 0.0, 9));
    }

    #[test]
    fn bounds_the_motor_by_its_torque_so_a_small_budget_cannot_reach_the_target_speed() {
        // The accumulated impulse may not exceed maxMotorTorque * dt.
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        let max_motor_torque = 0.01;
        add_joint(
            &mut world,
            &motor(&anchor, &arm, true, max_motor_torque, 100.0),
        );
        let dt = 1.0 / 60.0;
        let mut previous = arm.read().unwrap().angular_velocity;
        for _ in 0..10 {
            step(&mut world, dt);
            let arm = arm.read().unwrap();
            let per_step = max_motor_torque * dt * arm.inverse_inertia;
            // f32: the delta of two accumulated f32 velocities measured 0.0010000002 against a bound of
            // 0.0009999999 (3e-7 relative); TS's 1e-7 slack is an f64 margin, so the slack is 1e-6 here.
            assert!((arm.angular_velocity - previous).abs() <= per_step * 1.000001);
            previous = arm.angular_velocity;
        }
        assert!(arm.read().unwrap().angular_velocity < 100.0);
    }

    // The motor impulse persists across steps, so it must be reapplied in warm start; without that the
    // running total pins at maxMotorTorque * dt on step one and every later step adds nothing.
    #[test]
    fn keeps_accelerating_on_later_steps_rather_than_pinning_after_the_first() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &motor(&anchor, &arm, true, 0.01, 100.0));

        step(&mut world, 1.0 / 60.0);
        let after_first = arm.read().unwrap().angular_velocity;
        step(&mut world, 1.0 / 60.0);
        let after_second = arm.read().unwrap().angular_velocity;

        assert!(after_first > 0.0);
        assert!(after_second > after_first);
    }

    #[test]
    fn keeps_accelerating_across_many_steps_toward_the_target_speed() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &motor(&anchor, &arm, true, 0.01, 100.0));

        step(&mut world, 1.0 / 60.0);
        let after_first = arm.read().unwrap().angular_velocity;
        for _ in 0..29 {
            step(&mut world, 1.0 / 60.0);
        }

        // Thirty steps of a bounded motor must be meaningfully faster than one.
        assert!(arm.read().unwrap().angular_velocity > after_first * 5.0);
    }

    // `solve` skips a disabled motor, so warm start must skip it too.
    #[test]
    fn exerts_no_torque_once_the_motor_is_disabled() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        let joint = motor(&anchor, &arm, true, 1.0, 10.0);
        add_joint(&mut world, &joint);
        step(&mut world, 1.0 / 60.0);

        joint.write().unwrap().enable_motor = false;
        arm.write().unwrap().angular_velocity = 0.0;
        step(&mut world, 1.0 / 60.0);

        assert_eq!(arm.read().unwrap().angular_velocity, 0.0);
    }

    #[test]
    fn stays_still_across_many_steps_with_the_motor_disabled() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        let joint = motor(&anchor, &arm, true, 1.0, 10.0);
        add_joint(&mut world, &joint);
        for _ in 0..5 {
            step(&mut world, 1.0 / 60.0);
        }

        joint.write().unwrap().enable_motor = false;
        arm.write().unwrap().angular_velocity = 0.0;
        for _ in 0..20 {
            step(&mut world, 1.0 / 60.0);
        }

        assert_eq!(arm.read().unwrap().angular_velocity, 0.0);
    }

    // A motor switched back on starts from rest, not from whatever the accumulator held.
    #[test]
    fn starts_from_rest_when_the_motor_is_re_enabled_rather_than_resuming_a_stale_accumulator() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        let joint = motor(&anchor, &arm, true, 1.0, 10.0);
        add_joint(&mut world, &joint);
        for _ in 0..5 {
            step(&mut world, 1.0 / 60.0);
        }

        joint.write().unwrap().enable_motor = false;
        step(&mut world, 1.0 / 60.0);
        assert_eq!(joint.read().unwrap().motor_impulse, 0.0);

        joint.write().unwrap().enable_motor = true;
        arm.write().unwrap().angular_velocity = 0.0;
        step(&mut world, 1.0 / 60.0);

        // Acts again, and from a cold accumulator: one step of a 1 N·m budget, not a resumed total.
        assert!(arm.read().unwrap().angular_velocity > 0.0);
        assert!(joint.read().unwrap().motor_impulse.abs() <= (1.0 / 60.0) * 1.0 * 1.0000001);
    }

    // A joint authored OUTSIDE its interval must be pushed back.
    #[test]
    fn corrects_an_angle_that_is_already_outside_the_limit_interval() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        arm.write().unwrap().angle = 1.0;
        let joint = create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_limit: Some(true),
            lower_angle: Some(-0.5),
            upper_angle: Some(0.5),
            ..revolute_options(index_of(&anchor), index_of(&arm))
        });
        add_joint(&mut world, &joint);

        for _ in 0..30 {
            step(&mut world, 1.0 / 60.0);
        }

        let angle = arm.read().unwrap().angle;
        assert!(angle < 1.0);
        assert!(angle < 0.6);
    }

    #[test]
    fn corrects_a_violation_of_the_lower_bound_too_not_just_the_upper() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        arm.write().unwrap().angle = -1.0;
        let joint = create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            enable_limit: Some(true),
            lower_angle: Some(-0.5),
            upper_angle: Some(0.5),
            ..revolute_options(index_of(&anchor), index_of(&arm))
        });
        add_joint(&mut world, &joint);

        for _ in 0..30 {
            step(&mut world, 1.0 / 60.0);
        }

        assert!(arm.read().unwrap().angle > -0.6);
    }

    // While the angle is INSIDE the interval the limit has to stay silent.
    #[test]
    fn stays_silent_while_the_angle_is_inside_the_interval() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &limited(&anchor, &arm, -3.0, 3.0, 100.0, 5.0));

        for _ in 0..20 {
            step(&mut world, 1.0 / 60.0);
        }

        assert!(arm.read().unwrap().angular_velocity > 1.0);
    }

    #[test]
    fn stops_the_arm_at_the_upper_limit_instead_of_letting_the_motor_carry_it_past() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &limited(&anchor, &arm, -0.2, 0.5, 1000.0, 5.0));
        run(&mut world, 120);
        let arm = arm.read().unwrap();
        assert!(close(arm.angle, 0.5, 6));
        assert!(close(arm.angular_velocity, 0.0, 6));
    }

    #[test]
    fn stops_the_arm_at_the_lower_limit_when_driven_the_other_way() {
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(&mut world, &limited(&anchor, &arm, -0.3, 0.5, 1000.0, -5.0));
        run(&mut world, 120);
        assert!(close(arm.read().unwrap().angle, -0.3, 6));
    }

    #[test]
    fn leaves_the_arm_free_to_turn_while_it_is_inside_the_limit_interval() {
        // A limit whose bias is the violation depth rather than the remaining room brakes ALL rotation.
        let mut world = world(0.0, 0.0);
        let (anchor, arm) = hinged(&mut world);
        add_joint(
            &mut world,
            &limited(&anchor, &arm, -100.0, 100.0, 1000.0, 5.0),
        );
        run(&mut world, 30);
        assert!(close(arm.read().unwrap().angular_velocity, 5.0, 6));
    }

    #[test]
    fn exchanges_and_negates_the_limit_interval_when_the_ends_are_swapped() {
        // Reversing the ends negates the measurement, so the bounds negate AND trade places.
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_REVOLUTE_JOINT_KIND,
            &PHYSICS2D_REVOLUTE_JOINT_SOLVER,
        );
        let second = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let first = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        let joint = create_physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            lower_angle: Some(-0.2),
            motor_speed: Some(3.0),
            reference_angle: Some(0.1),
            upper_angle: Some(0.5),
            ..revolute_options(index_of(&first), index_of(&second))
        });
        add_joint(&mut world, &joint);
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&second));
        assert!(close(joint.lower_angle, -0.5, 12));
        assert!(close(joint.upper_angle, 0.2, 12));
        assert!(close(joint.reference_angle, -0.1, 12));
        assert!(close(joint.motor_speed, -3.0, 12));
    }
}

mod physics2d_rope_joint_solver {
    use super::*;

    #[test]
    fn goes_slack_inside_its_length_and_catches_the_body_at_full_extension() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_ROPE_JOINT_KIND,
            &PHYSICS2D_ROPE_JOINT_SOLVER,
        );
        let anchor = body_box(&mut world, STATIC, 0.0, 10.0);
        let bob = body_box(&mut world, DYNAMIC, 0.0, 9.5);
        let joint = create_physics2d_rope_joint(&Physics2DRopeJointOptions {
            base: base(index_of(&anchor), index_of(&bob)),
            max_length: 3.0,
        });
        add_joint(&mut world, &joint);

        run(&mut world, 30);
        // Still inside the rope's length: it must not have pulled the body back up.
        let gap = || anchor.read().unwrap().y - bob.read().unwrap().y;
        assert!(gap() < 3.05);
        run(&mut world, 300);
        assert!(gap() < 3.2);
        assert!(gap() > 2.8);
    }
}

mod physics2d_weld_joint_solver {
    use super::*;

    #[test]
    fn locks_the_relative_angle_as_well_as_the_anchor_point() {
        let mut world = create_physics2d_world(None, None, None);
        register(
            &mut world,
            PHYSICS2D_WELD_JOINT_KIND,
            &PHYSICS2D_WELD_JOINT_SOLVER,
        );
        let post = body_box(&mut world, STATIC, 0.0, 5.0);
        let welded = body_box(&mut world, DYNAMIC, 1.0, 5.0);
        let joint = create_physics2d_weld_joint(&Physics2DWeldJointOptions {
            base: Physics2DJointOptions {
                local_anchor_bx: Some(-1.0),
                local_anchor_by: Some(0.0),
                ..base(index_of(&post), index_of(&welded))
            },
            reference_angle: Some(0.0),
        });
        add_joint(&mut world, &joint);
        run(&mut world, 180);

        // A revolute would have swung; a weld holds the angle.
        let welded = welded.read().unwrap();
        assert!(welded.angle.abs() < 0.2);
        assert!((welded.y - 5.0).abs() < 0.3);
    }
}

mod physics2d_wheel_joint_solver {
    use super::*;

    #[test]
    fn locks_lateral_motion_while_preserving_suspension_travel_and_free_rotation() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let wheel = body_box(&mut world, DYNAMIC, 1.0, 0.0);
        wheel.write().unwrap().angular_velocity = 2.0;
        let joint = create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
            frequency_hz: Some(0.0),
            ..wheel_options(index_of(&chassis), index_of(&wheel))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 120);

        let wheel = wheel.read().unwrap();
        assert!(wheel.x.abs() < 0.05);
        assert!(close(wheel.y, 0.0, 5));
        assert!(wheel.angle.abs() > 1.0);
    }

    #[test]
    fn supports_a_wheel_against_gravity_with_a_damped_suspension_spring() {
        let mut world = world(0.0, -10.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let wheel = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        add_joint(
            &mut world,
            &create_physics2d_wheel_joint(&wheel_options(index_of(&chassis), index_of(&wheel))),
        );

        run(&mut world, 240);

        let wheel = wheel.read().unwrap();
        assert!(wheel.y > -0.5);
        assert!(wheel.y < 0.1);
        assert!(wheel.velocity_y.abs() < 0.1);
    }

    #[test]
    fn drives_relative_rotation_toward_its_motor_speed() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let wheel = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
            enable_motor: Some(true),
            max_motor_torque: Some(100.0),
            motor_speed: Some(3.0),
            ..wheel_options(index_of(&chassis), index_of(&wheel))
        });
        add_joint(&mut world, &joint);

        run(&mut world, 30);

        assert!(close(wheel.read().unwrap().angular_velocity, 3.0, 5));
    }

    #[test]
    fn bounds_motor_acceleration_by_torque_times_timestep() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let wheel = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let max_motor_torque = 0.5;
        let joint = create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
            enable_motor: Some(true),
            max_motor_torque: Some(max_motor_torque),
            motor_speed: Some(100.0),
            ..wheel_options(index_of(&chassis), index_of(&wheel))
        });
        add_joint(&mut world, &joint);

        let dt = 0.01;
        step(&mut world, dt);

        let wheel = wheel.read().unwrap();
        let maximum_delta = max_motor_torque * dt * wheel.inverse_inertia;
        assert!(wheel.angular_velocity > 0.0);
        assert!(wheel.angular_velocity <= maximum_delta * 1.0000001);
    }

    #[test]
    fn clears_its_motor_impulse_when_the_motor_is_disabled() {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let wheel = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let joint = create_physics2d_wheel_joint(&Physics2DWheelJointOptions {
            enable_motor: Some(true),
            max_motor_torque: Some(1.0),
            motor_speed: Some(10.0),
            ..wheel_options(index_of(&chassis), index_of(&wheel))
        });
        add_joint(&mut world, &joint);
        step(&mut world, 1.0 / 60.0);

        joint.write().unwrap().enable_motor = false;
        wheel.write().unwrap().angular_velocity = 0.0;
        step(&mut world, 1.0 / 60.0);

        assert_eq!(joint.read().unwrap().motor_impulse, 0.0);
        assert_eq!(wheel.read().unwrap().angular_velocity, 0.0);
    }

    #[test]
    fn preserves_authored_ends_because_free_relative_rotation_prevents_descriptor_only_axis_swapping()
     {
        let mut world = world(0.0, 0.0);
        register(
            &mut world,
            PHYSICS2D_WHEEL_JOINT_KIND,
            &PHYSICS2D_WHEEL_JOINT_SOLVER,
        );
        let wheel = body_box(&mut world, DYNAMIC, 0.0, 0.0);
        let chassis = body_box(&mut world, STATIC, 0.0, 2.0);
        let joint =
            create_physics2d_wheel_joint(&wheel_options(index_of(&chassis), index_of(&wheel)));

        add_joint(&mut world, &joint);

        assert!(index_of(&chassis) > index_of(&wheel));
        let joint = joint.read().unwrap();
        assert_eq!(joint.body_a, index_of(&chassis));
        assert_eq!(joint.body_b, index_of(&wheel));
    }
}
