use super::*;
use crate::common::*;

mod register_built_in_physics_3d_joint_solvers {
    use super::*;

    #[test]
    fn registers_all_seven_kinds() {
        let mut world = world();
        register_built_in_physics_3d_joint_solvers(&mut world);
        assert_eq!(world.joint_solvers.len(), 7);
        assert!(
            world
                .joint_solvers
                .contains_key(PHYSICS_3D_HINGE_JOINT_KIND)
        );
    }
}
