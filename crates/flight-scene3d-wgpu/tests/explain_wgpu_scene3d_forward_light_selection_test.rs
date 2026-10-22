use std::sync::{Arc, RwLock};

use flight_lighting::{
    Scene3DForwardLightSelectionReason, create_point_light, create_scene_3d_lights,
};
use flight_scene3d_wgpu::contract::*;

mod explain_wgpu_scene3d_forward_light_selection {
    use super::*;

    #[test]
    fn distinguishes_within_budget_required_and_prepared_selection() {
        let mut within = create_scene_3d_lights();
        within.point = vec![Arc::new(RwLock::new(create_point_light()))];
        assert_eq!(
            explain_wgpu_scene3d_forward_light_selection(&within, None).reason,
            Scene3DForwardLightSelectionReason::WithinBudget
        );
        let mut excess = create_scene_3d_lights();
        excess.point = (0..5)
            .map(|_| Arc::new(RwLock::new(create_point_light())))
            .collect();
        assert_eq!(
            explain_wgpu_scene3d_forward_light_selection(&excess, None).reason,
            Scene3DForwardLightSelectionReason::SelectionRequired
        );
        let prepared = WgpuScene3DForwardLightList {
            mesh_count: 0,
            mesh_light_blocks: Vec::new(),
        };
        assert_eq!(
            explain_wgpu_scene3d_forward_light_selection(&excess, Some(&prepared)).reason,
            Scene3DForwardLightSelectionReason::SelectionPrepared
        );
    }
}
