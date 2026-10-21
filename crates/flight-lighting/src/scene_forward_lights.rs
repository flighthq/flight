use flight_entity::Ref;
use flight_geometry::BoundingSphere;

use crate::light_analysis::get_light_contribution_at_bounding_sphere;
use crate::types::*;

struct Selected<T> {
    light: Ref<T>,
    index: usize,
    score: f32,
    priority: f32,
}

fn insert_selected<T>(selected: &mut Vec<Selected<T>>, value: Selected<T>) {
    let mut insert_at = selected.len();
    while insert_at > 0 {
        let previous = &selected[insert_at - 1];
        if value.priority < previous.priority {
            break;
        }
        if value.priority == previous.priority {
            if value.score < previous.score {
                break;
            }
            if value.score == previous.score && value.index > previous.index {
                break;
            }
        }
        insert_at -= 1;
    }
    if insert_at >= MAX_FORWARD_LIGHTS {
        return;
    }
    selected.insert(insert_at, value);
    selected.truncate(MAX_FORWARD_LIGHTS);
}

pub fn select_scene_3d_forward_lights(
    out: &mut Scene3DForwardLightSelection,
    lights: &Scene3DLightsLike,
    bounds: &BoundingSphere,
    receiver_layer_mask: Option<i32>,
) {
    let receiver_layer_mask = receiver_layer_mask.unwrap_or(ALL_LIGHT_LAYERS);
    let selected_points = select_strongest_point_lights(&lights.point, bounds, receiver_layer_mask);
    let selected_spots = select_strongest_spot_lights(&lights.spot, bounds, receiver_layer_mask);

    out.indices.clear();
    out.point.clear();
    out.spot.clear();
    for selected in selected_points {
        out.indices.push(selected.index as i32);
        out.point.push(selected.light);
    }
    for selected in selected_spots {
        out.indices.push(!(selected.index as i32));
        out.spot.push(selected.light);
    }
}

fn select_strongest_point_lights(
    lights: &[Ref<PointLight>],
    bounds: &BoundingSphere,
    receiver_layer_mask: i32,
) -> Vec<Selected<PointLight>> {
    let mut selected = Vec::with_capacity(MAX_FORWARD_LIGHTS);
    for (index, light) in lights.iter().enumerate() {
        let light_read = light.read().unwrap();
        if light_read.layer_mask & receiver_layer_mask == 0 {
            continue;
        }
        let score = get_light_contribution_at_bounding_sphere(&*light_read, bounds);
        if !(score > 0.0) {
            continue;
        }
        let priority = light_read.priority;
        drop(light_read);
        insert_selected(
            &mut selected,
            Selected {
                light: light.clone(),
                index,
                score,
                priority,
            },
        );
    }
    return selected;
}

fn select_strongest_spot_lights(
    lights: &[Ref<SpotLight>],
    bounds: &BoundingSphere,
    receiver_layer_mask: i32,
) -> Vec<Selected<SpotLight>> {
    let mut selected = Vec::with_capacity(MAX_FORWARD_LIGHTS);
    for (index, light) in lights.iter().enumerate() {
        let light_read = light.read().unwrap();
        if light_read.layer_mask & receiver_layer_mask == 0 {
            continue;
        }
        let score = get_light_contribution_at_bounding_sphere(&*light_read, bounds);
        if !(score > 0.0) {
            continue;
        }
        let priority = light_read.priority;
        drop(light_read);
        insert_selected(
            &mut selected,
            Selected {
                light: light.clone(),
                index,
                score,
                priority,
            },
        );
    }
    return selected;
}
