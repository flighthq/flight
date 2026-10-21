use flight_physics2d::*;

mod visit_physics2d_joint_base_number_fields {
    use super::*;

    #[test]
    fn visits_every_base_number_except_the_break_thresholds() {
        let make: fn() -> Physics2DDistanceJointOptions = Physics2DDistanceJointOptions::default;
        let mut options = make();
        options.base.body_a = 3;
        options.base.body_b = 4;
        options.base.local_anchor_ax = Some(5.0);
        options.base.local_anchor_ay = Some(6.0);
        options.base.local_anchor_bx = Some(7.0);
        options.base.local_anchor_by = Some(8.0);
        let joint = create_physics2d_distance_joint(&options);
        let guard = joint.read().unwrap();
        let mut visited = Vec::new();
        visit_physics2d_joint_base_number_fields(guard.joint_fields(), &mut |value| {
            visited.push(value)
        });
        assert_eq!(
            visited,
            vec![
                3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
            ]
        );
        assert!(visited.iter().all(|value| value.is_finite()));
    }
}
