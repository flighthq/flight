use super::*;
use crate::common::*;

mod explain_physics_3d_collision {
    use super::*;

    #[test]
    fn reports_missing_sphere_support() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        add_physics_3d_collider(&mut world, &body, &collider());
        let mut explanation = Physics3DCollisionExplanation {
            unsupported_kinds: Vec::with_capacity(4),
            status: Physics3DCollisionStatus::Ready,
        };
        let capacity = explanation.unsupported_kinds.capacity();
        explain_physics_3d_collision(&mut explanation, &world, &registry());
        assert_eq!(explanation.status, Physics3DCollisionStatus::MissingSupport);
        assert_eq!(explanation.unsupported_kinds, vec!["sphere".to_string()]);
        assert_eq!(explanation.unsupported_kinds.capacity(), capacity);
    }
}
