use std::sync::{Arc, RwLock};

use flight_camera::{
    Projection, create_camera_3d, create_perspective_projection,
    set_camera_3d_view_matrix4_from_look_at,
};
use flight_entity::{Ref, allocate_entity};
use flight_geometry::create_vector3;
use flight_log::{
    LogData, LogStateRef, LogValue, add_log_sink, create_log_state, create_memory_log_sink,
    get_memory_log_sink_entries,
};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::{NodeRef, add_node_child};
use flight_render::*;
use flight_scene3d::{Node3DFields, Skeleton3D, Skin, create_mesh, create_node3d, publish_node3d};

fn logs() -> (LogStateRef, flight_log::MemoryLogSink) {
    let state = Arc::new(RwLock::new(create_log_state()));
    let sink = create_memory_log_sink(8);
    add_log_sink(&state, sink.sink.clone());
    return (state, sink);
}

fn messages(sink: &flight_log::MemoryLogSink) -> String {
    let mut entries = Vec::new();
    get_memory_log_sink_entries(&mut entries, sink);
    return entries
        .iter()
        .filter_map(|entry| match &entry.data {
            LogData::Record(data) => match data.get("message") {
                Some(LogValue::Str(message)) => Some(message.as_str()),
                _ => None,
            },
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n");
}

fn prepare(skinned: bool, state: &mut BaseRenderState) {
    let geometry = Arc::new(RwLock::new(create_box_mesh_geometry(
        Some(2.0),
        Some(2.0),
        Some(2.0),
    )));
    let mesh = create_mesh(geometry, Arc::new(RwLock::new(Vec::new())));
    if skinned {
        let skeleton: Ref<Skeleton3D> = Arc::new(RwLock::new(allocate_entity()));
        mesh.write().unwrap().skin = Some(Arc::new(RwLock::new(Skin {
            skeleton,
            skeleton_root: None,
        })));
    }
    let root: NodeRef = publish_node3d(create_node3d::<Node3DFields>(None));
    let mesh_node: NodeRef = mesh;
    add_node_child(&root, &mesh_node);

    let mut camera = create_camera_3d();
    camera.near = 0.1;
    camera.far = 100.0;
    let projection = create_perspective_projection();
    projection.write().unwrap().aspect = 1.0;
    projection.write().unwrap().fov_y = std::f32::consts::PI / 3.0;
    camera.projection = Projection::Perspective(projection);
    set_camera_3d_view_matrix4_from_look_at(
        &mut camera,
        &create_vector3(0.0, 0.0, 10.0),
        &create_vector3(0.0, 0.0, 0.0),
        &create_vector3(0.0, 1.0, 0.0),
    );
    prepare_scene_3d_render(
        state,
        &root,
        &camera,
        &crate::support::test_default::<flight_lighting::Scene3DLights>(),
        None,
    );
}

mod disable_scene_render_guards {
    use super::*;

    #[test]
    fn disabling_guards_stops_later_reporting() {
        let (logs, sink) = logs();
        let mut state = create_render_state();
        enable_scene_render_guards(&mut state, Some(logs));
        disable_scene_render_guards(&mut state);
        prepare(true, &mut state);
        assert!(messages(&sink).is_empty());
    }
}

mod enable_scene_render_guards {
    use super::*;

    #[test]
    fn rigid_mesh_without_posed_bounds_is_silent() {
        let (logs, sink) = logs();
        let mut state = create_render_state();
        enable_scene_render_guards(&mut state, Some(logs));
        prepare(false, &mut state);
        assert!(messages(&sink).is_empty());
    }
}

mod set_skinned_mesh_bounds_guard {
    use super::*;

    #[test]
    fn skinned_mesh_without_posed_bounds_warns() {
        let (logs, sink) = logs();
        let mut state = create_render_state();
        enable_scene_render_guards(&mut state, Some(logs));
        let guard = state.registries.skinned_mesh_bounds_guard;
        set_skinned_mesh_bounds_guard(&mut state, guard);
        prepare(true, &mut state);
        let messages = messages(&sink);
        assert!(messages.contains("BIND POSE"));
        assert!(messages.contains("prepareScene3DSkinning"));
    }
}
