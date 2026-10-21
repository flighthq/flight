//! D9e string tables for the physics2d closed string unions.

use crate::types::*;

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DBodyType string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_body_type_string(value: Physics2DBodyType) -> &'static str {
    return match value {
        Physics2DBodyType::Dynamic => "dynamic",
        Physics2DBodyType::Kinematic => "kinematic",
        Physics2DBodyType::Static => "static",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DCollisionStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_collision_status_string(value: Physics2DCollisionStatus) -> &'static str {
    return match value {
        Physics2DCollisionStatus::MissingContactSupport => "missing-contact-support",
        Physics2DCollisionStatus::Ready => "ready",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DDebugFeature string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_debug_feature_string(value: Physics2DDebugFeature) -> &'static str {
    return match value {
        Physics2DDebugFeature::CenterOfMass => "center-of-mass",
        Physics2DDebugFeature::Collider => "collider",
        Physics2DDebugFeature::ContactNormal => "contact-normal",
        Physics2DDebugFeature::Joint => "joint",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DGearCoordinateKind string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_gear_coordinate_kind_string(value: Physics2DGearCoordinateKind) -> &'static str {
    return match value {
        Physics2DGearCoordinateKind::Angular => "angular",
        Physics2DGearCoordinateKind::Linear => "linear",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DJointResolutionExplanationStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_joint_resolution_explanation_status_string(value: Physics2DJointResolutionExplanationStatus) -> &'static str {
    return match value {
        Physics2DJointResolutionExplanationStatus::Complete => "complete",
        Physics2DJointResolutionExplanationStatus::UnresolvedJoints => "unresolved-joints",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DJointResolutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_joint_resolution_status_string(value: Physics2DJointResolutionStatus) -> &'static str {
    return match value {
        Physics2DJointResolutionStatus::BodiesMissing => "bodies-missing",
        Physics2DJointResolutionStatus::BodyAMissing => "body-a-missing",
        Physics2DJointResolutionStatus::BodyBMissing => "body-b-missing",
        Physics2DJointResolutionStatus::Ready => "ready",
        Physics2DJointResolutionStatus::SolverUnregistered => "solver-unregistered",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_physics2d_step_status_string(value: Physics2DStepStatus) -> &'static str {
    return match value {
        Physics2DStepStatus::InvalidStep => "invalid-step",
        Physics2DStepStatus::Ready => "ready",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DBodyType string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_body_type(value: &str) -> Option<Physics2DBodyType> {
    return match value {
        "dynamic" => Some(Physics2DBodyType::Dynamic),
        "kinematic" => Some(Physics2DBodyType::Kinematic),
        "static" => Some(Physics2DBodyType::Static),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DCollisionStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_collision_status(value: &str) -> Option<Physics2DCollisionStatus> {
    return match value {
        "missing-contact-support" => Some(Physics2DCollisionStatus::MissingContactSupport),
        "ready" => Some(Physics2DCollisionStatus::Ready),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DDebugFeature string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_debug_feature(value: &str) -> Option<Physics2DDebugFeature> {
    return match value {
        "center-of-mass" => Some(Physics2DDebugFeature::CenterOfMass),
        "collider" => Some(Physics2DDebugFeature::Collider),
        "contact-normal" => Some(Physics2DDebugFeature::ContactNormal),
        "joint" => Some(Physics2DDebugFeature::Joint),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DGearCoordinateKind string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_gear_coordinate_kind(value: &str) -> Option<Physics2DGearCoordinateKind> {
    return match value {
        "angular" => Some(Physics2DGearCoordinateKind::Angular),
        "linear" => Some(Physics2DGearCoordinateKind::Linear),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DJointResolutionExplanationStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_joint_resolution_explanation_status(value: &str) -> Option<Physics2DJointResolutionExplanationStatus> {
    return match value {
        "complete" => Some(Physics2DJointResolutionExplanationStatus::Complete),
        "unresolved-joints" => Some(Physics2DJointResolutionExplanationStatus::UnresolvedJoints),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DJointResolutionStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_joint_resolution_status(value: &str) -> Option<Physics2DJointResolutionStatus> {
    return match value {
        "bodies-missing" => Some(Physics2DJointResolutionStatus::BodiesMissing),
        "body-a-missing" => Some(Physics2DJointResolutionStatus::BodyAMissing),
        "body-b-missing" => Some(Physics2DJointResolutionStatus::BodyBMissing),
        "ready" => Some(Physics2DJointResolutionStatus::Ready),
        "solver-unregistered" => Some(Physics2DJointResolutionStatus::SolverUnregistered),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Physics2DStepStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_physics2d_step_status(value: &str) -> Option<Physics2DStepStatus> {
    return match value {
        "invalid-step" => Some(Physics2DStepStatus::InvalidStep),
        "ready" => Some(Physics2DStepStatus::Ready),
        _ => None,
    };
}
