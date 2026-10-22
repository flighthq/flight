use flight_lighting::{
    MAX_FORWARD_LIGHTS, Scene3DForwardLightSelectionExplanation, Scene3DForwardLightSelectionReason,
    Scene3DLightsLike,
};

use crate::types::GlScene3DForwardLightList;

// Explains whether drawing `lights` through the fixed forward budget needs an explicit per-object
// selection list. This pure, separately importable query retains and mutates nothing.
pub fn explain_gl_scene3d_forward_light_selection(
    lights: &Scene3DLightsLike,
    selection: Option<&GlScene3DForwardLightList>,
) -> Scene3DForwardLightSelectionExplanation {
    let point_light_count = lights.point.len();
    let spot_light_count = lights.spot.len();
    let selection_prepared = selection.is_some();
    return Scene3DForwardLightSelectionExplanation {
        point_light_count,
        reason: if selection_prepared {
            Scene3DForwardLightSelectionReason::SelectionPrepared
        } else if point_light_count > MAX_FORWARD_LIGHTS || spot_light_count > MAX_FORWARD_LIGHTS {
            Scene3DForwardLightSelectionReason::SelectionRequired
        } else {
            Scene3DForwardLightSelectionReason::WithinBudget
        },
        selection_prepared,
        spot_light_count,
    };
}
