use std::sync::{Arc, RwLock};

use flight_lighting::{
    Scene3DForwardLightSelectionExplanation, Scene3DForwardLightSelectionReason, Scene3DLightsLike,
    create_point_light, create_scene_3d_lights,
};
use flight_scene3d_gl::contract::*;

fn lights(count: usize) -> Scene3DLightsLike {
    let mut out = create_scene_3d_lights();
    out.point = (0..count)
        .map(|_| Arc::new(RwLock::new(create_point_light())))
        .collect();
    return out;
}

mod explain_gl_scene3d_forward_light_selection {
    use super::*;

    #[test]
    fn reports_a_required_selection_when_input_truncation_would_occur() {
        assert_eq!(
            explain_gl_scene3d_forward_light_selection(&lights(5), None),
            Scene3DForwardLightSelectionExplanation {
                point_light_count: 5,
                reason: Scene3DForwardLightSelectionReason::SelectionRequired,
                selection_prepared: false,
                spot_light_count: 0,
            }
        );
    }

    #[test]
    fn reports_when_a_selection_was_prepared() {
        let prepared = GlScene3DForwardLightList {
            mesh_count: 0,
            mesh_light_blocks: Vec::new(),
        };
        assert_eq!(
            explain_gl_scene3d_forward_light_selection(&lights(5), Some(&prepared)).reason,
            Scene3DForwardLightSelectionReason::SelectionPrepared
        );
    }

    #[test]
    fn reports_when_punctual_inputs_fit_the_fixed_budget() {
        assert_eq!(
            explain_gl_scene3d_forward_light_selection(&lights(4), None).reason,
            Scene3DForwardLightSelectionReason::WithinBudget
        );
    }
}
