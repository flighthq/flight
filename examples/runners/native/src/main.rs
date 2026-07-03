use std::collections::HashMap;

use example_drawingshapes::{
    BACKGROUND, DrawingShapes, HEIGHT, TITLE, WIDTH, create_drawing_shapes,
};
use flighthq_displayobject_wgpu::{
    WgpuShapeGeometry, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_host_winit::{InputManager, WgpuRenderState, WinitAppConfig, run_winit_app};
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_types::RenderProxy2D;
use flighthq_types::display::{display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;

const STAGE_ID: u64 = 1;
const SHAPE_ID: u64 = 2;

fn main() {
    let scene = create_drawing_shapes();
    let mut config = WinitAppConfig {
        title: format!("Flight Examples — {TITLE}"),
        width: WIDTH,
        height: HEIGHT,
        ..Default::default()
    };
    config.render_options.background_color = Some(BACKGROUND);

    let mut setup = |state: &mut WgpuRenderState, _input: &mut InputManager| {
        register_wgpu_display_object_renderer(state);
        STAGE_ID
    };
    let mut update = move |_dt: f32, state: &mut WgpuRenderState, _input: &mut InputManager| {
        draw_scene(state, &scene);
    };
    run_winit_app(config, &mut setup, &mut update);
}

fn draw_scene(state: &mut WgpuRenderState, scene: &DrawingShapes) {
    let kinds = HashMap::from([(STAGE_ID, display_object_kind()), (SHAPE_ID, shape_kind())]);
    let children = HashMap::from([(STAGE_ID, vec![SHAPE_ID]), (SHAPE_ID, vec![])]);
    let parents = HashMap::from([(STAGE_ID, None), (SHAPE_ID, Some(STAGE_ID))]);

    let mut store = RenderStateStore::new();
    let render_id = create_render_state(&mut store, None);
    let render_state = get_render_state(&store, render_id).clone();
    prepare_display_object_render(
        &mut store,
        render_id,
        &render_state,
        STAGE_ID,
        &|id| children.get(&id).cloned().unwrap_or_default(),
        &|_| true,
        &|id| parents.get(&id).copied().flatten(),
        &|_| (1, 1, 1),
        &|id| kinds.get(&id).copied().unwrap_or_default(),
        &|_| Matrix::default(),
        &|_| 1.0,
        &|_| true,
        &|_| None,
        &|_| false,
    );

    let proxies: HashMap<u64, RenderProxy2D> = [STAGE_ID, SHAPE_ID]
        .into_iter()
        .filter_map(|id| {
            get_render_proxy_2d(&store, render_id, id)
                .cloned()
                .map(|proxy| (id, proxy))
        })
        .collect();
    render_wgpu_display_object(
        state,
        STAGE_ID,
        &|id| children.get(&id).cloned().unwrap_or_default(),
        &|id| kinds.get(&id).copied().unwrap_or_default(),
        &|id| proxies.get(&id).cloned(),
        &|id| {
            (id == SHAPE_ID).then(|| WgpuShapeGeometry {
                regions: scene.regions.clone(),
                content_revision: scene.content_revision,
            })
        },
        &|_| None,
        &|_| None,
    );
}
