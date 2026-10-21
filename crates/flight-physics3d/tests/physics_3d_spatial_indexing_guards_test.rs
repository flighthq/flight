use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use super::*;
use crate::common::*;

mod report_physics_3d_spatial_indexing {
    use super::*;

    #[test]
    fn invokes_the_installed_guard() {
        let called = Arc::new(AtomicBool::new(false));
        let witness = called.clone();
        let guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: Some(Arc::new(move |_| witness.store(true, Ordering::SeqCst))),
            step_guard: None,
        };
        report_physics_3d_spatial_indexing(&world(), Some(&guards));
        assert!(called.load(Ordering::SeqCst));
    }
}

mod set_physics_3d_spatial_indexing_guard {
    use super::*;

    #[test]
    fn stores_the_guard() {
        let mut guards = Physics3DGuardState {
            contact_intake_guard: None,
            enabled: false,
            joint_resolution_guard: None,
            spatial_indexing_guard: None,
            step_guard: None,
        };
        set_physics_3d_spatial_indexing_guard(&mut guards, Some(Arc::new(|_| {})));
        assert!(guards.spatial_indexing_guard.is_some());
    }
}
