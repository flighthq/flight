use flight_physics2d::*;

mod get_physics2d_body_type_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_body_type_string(Physics2DBodyType::Dynamic),
            "dynamic"
        );
        assert_eq!(
            get_physics2d_body_type_string(Physics2DBodyType::Kinematic),
            "kinematic"
        );
        assert_eq!(
            get_physics2d_body_type_string(Physics2DBodyType::Static),
            "static"
        );
    }
}

mod get_physics2d_collision_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_collision_status_string(Physics2DCollisionStatus::MissingContactSupport),
            "missing-contact-support"
        );
        assert_eq!(
            get_physics2d_collision_status_string(Physics2DCollisionStatus::Ready),
            "ready"
        );
    }
}

mod get_physics2d_debug_feature_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_debug_feature_string(Physics2DDebugFeature::CenterOfMass),
            "center-of-mass"
        );
        assert_eq!(
            get_physics2d_debug_feature_string(Physics2DDebugFeature::Collider),
            "collider"
        );
        assert_eq!(
            get_physics2d_debug_feature_string(Physics2DDebugFeature::ContactNormal),
            "contact-normal"
        );
        assert_eq!(
            get_physics2d_debug_feature_string(Physics2DDebugFeature::Joint),
            "joint"
        );
    }
}

mod get_physics2d_gear_coordinate_kind_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_gear_coordinate_kind_string(Physics2DGearCoordinateKind::Angular),
            "angular"
        );
        assert_eq!(
            get_physics2d_gear_coordinate_kind_string(Physics2DGearCoordinateKind::Linear),
            "linear"
        );
    }
}

mod get_physics2d_joint_resolution_explanation_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_joint_resolution_explanation_status_string(
                Physics2DJointResolutionExplanationStatus::Complete
            ),
            "complete"
        );
        assert_eq!(
            get_physics2d_joint_resolution_explanation_status_string(
                Physics2DJointResolutionExplanationStatus::UnresolvedJoints
            ),
            "unresolved-joints"
        );
    }
}

mod get_physics2d_joint_resolution_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_joint_resolution_status_string(
                Physics2DJointResolutionStatus::BodiesMissing
            ),
            "bodies-missing"
        );
        assert_eq!(
            get_physics2d_joint_resolution_status_string(
                Physics2DJointResolutionStatus::BodyAMissing
            ),
            "body-a-missing"
        );
        assert_eq!(
            get_physics2d_joint_resolution_status_string(
                Physics2DJointResolutionStatus::BodyBMissing
            ),
            "body-b-missing"
        );
        assert_eq!(
            get_physics2d_joint_resolution_status_string(Physics2DJointResolutionStatus::Ready),
            "ready"
        );
        assert_eq!(
            get_physics2d_joint_resolution_status_string(
                Physics2DJointResolutionStatus::SolverUnregistered
            ),
            "solver-unregistered"
        );
    }
}

mod get_physics2d_step_status_string {
    use super::*;

    #[test]
    fn names_every_variant_with_its_source_string() {
        assert_eq!(
            get_physics2d_step_status_string(Physics2DStepStatus::InvalidStep),
            "invalid-step"
        );
        assert_eq!(
            get_physics2d_step_status_string(Physics2DStepStatus::Ready),
            "ready"
        );
    }
}

mod parse_physics2d_body_type {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_body_type("dynamic"),
            Some(Physics2DBodyType::Dynamic)
        );
        assert_eq!(
            parse_physics2d_body_type("kinematic"),
            Some(Physics2DBodyType::Kinematic)
        );
        assert_eq!(
            parse_physics2d_body_type("static"),
            Some(Physics2DBodyType::Static)
        );
        assert_eq!(parse_physics2d_body_type("unknown"), None);
    }
}

mod parse_physics2d_collision_status {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_collision_status("missing-contact-support"),
            Some(Physics2DCollisionStatus::MissingContactSupport)
        );
        assert_eq!(
            parse_physics2d_collision_status("ready"),
            Some(Physics2DCollisionStatus::Ready)
        );
        assert_eq!(parse_physics2d_collision_status("unknown"), None);
    }
}

mod parse_physics2d_debug_feature {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_debug_feature("center-of-mass"),
            Some(Physics2DDebugFeature::CenterOfMass)
        );
        assert_eq!(
            parse_physics2d_debug_feature("collider"),
            Some(Physics2DDebugFeature::Collider)
        );
        assert_eq!(
            parse_physics2d_debug_feature("contact-normal"),
            Some(Physics2DDebugFeature::ContactNormal)
        );
        assert_eq!(
            parse_physics2d_debug_feature("joint"),
            Some(Physics2DDebugFeature::Joint)
        );
        assert_eq!(parse_physics2d_debug_feature("unknown"), None);
    }
}

mod parse_physics2d_gear_coordinate_kind {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_gear_coordinate_kind("angular"),
            Some(Physics2DGearCoordinateKind::Angular)
        );
        assert_eq!(
            parse_physics2d_gear_coordinate_kind("linear"),
            Some(Physics2DGearCoordinateKind::Linear)
        );
        assert_eq!(parse_physics2d_gear_coordinate_kind("unknown"), None);
    }
}

mod parse_physics2d_joint_resolution_explanation_status {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_joint_resolution_explanation_status("complete"),
            Some(Physics2DJointResolutionExplanationStatus::Complete)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_explanation_status("unresolved-joints"),
            Some(Physics2DJointResolutionExplanationStatus::UnresolvedJoints)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_explanation_status("unknown"),
            None
        );
    }
}

mod parse_physics2d_joint_resolution_status {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_joint_resolution_status("bodies-missing"),
            Some(Physics2DJointResolutionStatus::BodiesMissing)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_status("body-a-missing"),
            Some(Physics2DJointResolutionStatus::BodyAMissing)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_status("body-b-missing"),
            Some(Physics2DJointResolutionStatus::BodyBMissing)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_status("ready"),
            Some(Physics2DJointResolutionStatus::Ready)
        );
        assert_eq!(
            parse_physics2d_joint_resolution_status("solver-unregistered"),
            Some(Physics2DJointResolutionStatus::SolverUnregistered)
        );
        assert_eq!(parse_physics2d_joint_resolution_status("unknown"), None);
    }
}

mod parse_physics2d_step_status {
    use super::*;

    #[test]
    fn reads_every_source_string_back_and_rejects_others() {
        assert_eq!(
            parse_physics2d_step_status("invalid-step"),
            Some(Physics2DStepStatus::InvalidStep)
        );
        assert_eq!(
            parse_physics2d_step_status("ready"),
            Some(Physics2DStepStatus::Ready)
        );
        assert_eq!(parse_physics2d_step_status("unknown"), None);
    }
}
