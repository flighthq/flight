use flight_collision::{
    CollisionAabb2D, CollisionCapsule2D, CollisionCircle2D, CollisionPoint2D, CollisionPolygon2D,
    CollisionSegment2D, CollisionShape2D,
};
use flight_physics2d::*;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn aabb() -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x: -1.0,
        min_y: -1.0,
        max_x: 1.0,
        max_y: 1.0,
    });
}

fn capsule() -> CollisionShape2D {
    return CollisionShape2D::Capsule(CollisionCapsule2D {
        x0: 0.0,
        y0: 0.0,
        x1: 1.0,
        y1: 0.0,
        radius: 0.5,
    });
}

fn circle() -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 1.0,
    });
}

fn point() -> CollisionShape2D {
    return CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
}

fn segment(x0: f32, x1: f32) -> CollisionShape2D {
    return CollisionShape2D::Segment(CollisionSegment2D {
        x0,
        y0: 0.0,
        x1,
        y1: 0.0,
    });
}

fn ready() -> Physics2DCollisionExplanation {
    return Physics2DCollisionExplanation {
        status: Physics2DCollisionStatus::Ready,
        unsupported_kinds: Vec::new(),
    };
}

fn world_with(shapes: &[CollisionShape2D]) -> Physics2DWorld {
    let mut world = create_physics2d_world(Some(0.0), Some(-10.0), None);
    for shape in shapes {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let collider = create_physics2d_collider(shape, &STONE, None, None);
        body.write().unwrap().colliders.push(collider.clone());
        add_physics2d_body(&mut world, &body);
        update_physics2d_collider_world_shape(
            &mut collider.write().unwrap(),
            &body.read().unwrap(),
        );
    }
    return world;
}

mod explain_physics2d_collision {
    use super::*;

    #[test]
    fn names_the_area_less_kinds_too_since_they_are_equally_invisible_to_the_solver() {
        let world = world_with(&[segment(0.0, 1.0), point()]);
        assert_eq!(
            explain_physics2d_collision(&world).unsupported_kinds,
            vec!["point", "segment"]
        );
    }

    #[test]
    fn reports_each_kind_once_however_many_colliders_carry_it_and_in_a_stable_order() {
        let world = world_with(&[point(), segment(0.0, 1.0), segment(2.0, 3.0), circle()]);
        assert_eq!(
            explain_physics2d_collision(&world).unsupported_kinds,
            vec!["point", "segment"]
        );
    }

    #[test]
    fn reports_ready_for_a_capsule_which_the_dispatcher_now_answers_for() {
        let world = world_with(&[capsule()]);
        assert_eq!(explain_physics2d_collision(&world), ready());
    }

    #[test]
    fn reports_ready_for_a_world_of_shapes_the_dispatcher_answers_for() {
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 0.0, 1.0, 1.0],
        });
        let world = world_with(&[circle(), aabb(), capsule(), polygon]);
        assert_eq!(explain_physics2d_collision(&world), ready());
    }

    #[test]
    fn reports_ready_for_an_empty_world_which_has_nothing_that_can_fail() {
        let world = create_physics2d_world(Some(0.0), Some(-10.0), None);
        assert_eq!(
            explain_physics2d_collision(&world).status,
            Physics2DCollisionStatus::Ready
        );
    }
}
