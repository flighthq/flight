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
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 1,
        hemisphere_count: 0,
        point_count: 2,
        spot_count: 1,
        version: 7,
    };
    assert_eq!(block.data.len(), SCENE_LIGHT_BLOCK_FLOATS);
}

#[test]
fn erased_descriptors_retain_their_actual_type_and_original_allocation() {
    let ambient = create_ambient_light();
    let directional = create_directional_light(None);
    let hemisphere = create_hemisphere_light();
    let point = create_point_light();
    let spot = create_spot_light(None);
    let area = create_area_light();
    let sources: [&dyn Light; 6] = [&ambient, &directional, &hemisphere, &point, &spot, &area];
    let any: &dyn std::any::Any = sources[0];
    let actual = any.downcast_ref::<AmbientLight>().unwrap();
    assert!(std::ptr::eq(actual, &ambient));
    assert_eq!(clone_ambient_light(actual).color, ambient.color);
    let any: &dyn std::any::Any = sources[1];
    let actual = any.downcast_ref::<DirectionalLight>().unwrap();
    assert!(std::ptr::eq(actual, &directional));
    assert_eq!(
        clone_directional_light(actual).direction,
        directional.direction
    );
    let any: &dyn std::any::Any = sources[2];
    assert_eq!(
        clone_hemisphere_light(any.downcast_ref::<HemisphereLight>().unwrap()).ground_color,
        hemisphere.ground_color
    );
    let any: &dyn std::any::Any = sources[3];
    assert_eq!(
        clone_point_light(any.downcast_ref::<PointLight>().unwrap()).position,
        point.position
    );
    let any: &dyn std::any::Any = sources[4];
    assert_eq!(
        clone_spot_light(any.downcast_ref::<SpotLight>().unwrap()).outer_cone_cos,
        spot.outer_cone_cos
    );
    let any: &dyn std::any::Any = sources[5];
    assert!(any.downcast_ref::<AreaLight>().is_some());
    assert!(any.downcast_ref::<PointLight>().is_none());
}
