use super::*;
use crate::common::*;

mod explain_physics_3d_joints {
    use super::*;

    #[test]
    fn reports_an_unregistered_joint_kind() {
        let mut world = world();
        let joint = physics_3d_ball_and_socket_joint(&joint_options(0, 1));
        add_physics_3d_joint(&mut world, &joint);
        let mut explanation = Vec::with_capacity(4);
        explanation.push(Physics3DJointExplanation {
            kind: "stale".to_string(),
            index: usize::MAX,
            has_solver: true,
            bodies_resolvable: true,
            status: Physics3DJointStatus::Solvable,
        });
        let capacity = explanation.capacity();
        explain_physics_3d_joints(&mut explanation, &world);
        assert_eq!(
            explanation[0].status,
            Physics3DJointStatus::UnregisteredKind
        );
        assert_eq!(explanation.len(), 1);
        assert_eq!(explanation.capacity(), capacity);
    }
}
