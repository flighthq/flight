use flight_lighting::{
    Scene3DForwardLightSelectionExplanation, Scene3DForwardLightSelectionReason,
    Scene3DLightsLike, MAX_FORWARD_LIGHTS,
};

use crate::types::GlScene3DForwardLightList;

pub fn explain_gl_scene3d_forward_light_selection(
    lights: &Scene3DLightsLike,
    selection: Option<&GlScene3DForwardLightList>,
) -> Scene3DForwardLightSelectionExplanation {
    let point_light_count = lights.point.len();
    let spot_light_count = lights.spot.len();
    let selection_prepared = selection.is_some();
    let reason = if selection_prepared {
        Scene3DForwardLightSelectionReason::SelectionPrepared
    } else if point_light_count > MAX_FORWARD_LIGHTS || spot_light_count > MAX_FORWARD_LIGHTS {
        Scene3DForwardLightSelectionReason::SelectionRequired
    } else {
        Scene3DForwardLightSelectionReason::WithinBudget
    };
    return Scene3DForwardLightSelectionExplanation {
        point_light_count,
        reason,
        selection_prepared,
        spot_light_count,
    };
}
