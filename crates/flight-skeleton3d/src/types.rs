use flight_entity::Ref;
use flight_scene3d::{Node3DRef, Skeleton3D};
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Skeleton3DValidationDiagnostic {
    pub joint_count: usize,
    pub inverse_bind_matrices_length: usize,
    pub expected_inverse_bind_matrices_length: usize,
    pub message: String,
}
pub type Skeleton3DJointCloner = Arc<dyn Fn(&Node3DRef, usize) -> Node3DRef + Send + Sync>;
pub type Skeleton3DBindPoseGuard = Arc<dyn Fn(&Skeleton3D, usize) + Send + Sync>;
#[derive(Default)]
pub struct Skeleton3DGuardState {
    pub enabled: bool,
    pub bind_pose_guard: Option<Skeleton3DBindPoseGuard>,
}
pub type Skeleton3DGuardStateRef = Ref<Skeleton3DGuardState>;
// flight-lint: allow(f64) D1 injected log timestamps use the canonical millisecond JS-number representation
pub type Skeleton3DGuardClock = Arc<dyn Fn() -> f64 + Send + Sync>;
