use flight_lighting::contract::*;

#[test]
fn crate_contract_is_available() {
    assert_eq!(MAX_FORWARD_LIGHTS, 4);
    assert_eq!(SCENE_LIGHT_POINT_OFFSET, 12);
    assert_eq!(SCENE_LIGHT_SPOT_OFFSET, 44);
    assert_eq!(SCENE_LIGHT_HEMISPHERE_OFFSET, 108);
    assert_eq!(SCENE_LIGHT_BLOCK_FLOATS, 156);

    let explanation = Scene3DForwardLightSelectionExplanation {
        point_light_count: 2,
        reason: Scene3DForwardLightSelectionReason::SelectionPrepared,
        selection_prepared: true,
        spot_light_count: 1,
    };
    assert_eq!(
        explanation.reason,
        Scene3DForwardLightSelectionReason::SelectionPrepared
    );

    let block = Scene3DLightBlock {
        ambient_count: 1,
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS],
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 2,
        spot_count: 1,
        version: 7,
    };
    assert_eq!(block.data.len(), SCENE_LIGHT_BLOCK_FLOATS);
}
