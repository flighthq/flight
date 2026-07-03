use std::collections::HashMap;

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_displayobject_wgpu::{
    WgpuShapeGeometry, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_host_winit::{InputManager, WgpuRenderState, WinitAppConfig, run_winit_app};
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_shape::{
    append_shape_begin_fill, append_shape_circle, append_shape_ellipse, append_shape_end_fill,
    append_shape_line_to, append_shape_move_to, append_shape_rectangle,
    append_shape_round_rectangle, create_shape, get_shape_fill_regions,
};
use flighthq_types::RenderProxy2D;
use flighthq_types::display::{display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;

const STAGE_ID: u64 = 1;
const SHAPE_ID: u64 = 2;

fn main() {
    let requested = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "drawingshapes".to_string());
    let scene = scene_for(&requested).unwrap_or_else(|| {
        let available = EXAMPLE_IDS.join(", ");
        panic!("unknown example '{requested}'. Available examples: {available}");
    });
    let geometry = shape_geometry_for_scene(&scene);

    let mut config = WinitAppConfig {
        title: format!("Flight Examples - {}", scene.title),
        width: scene.width,
        height: scene.height,
        ..Default::default()
    };
    config.render_options.background_color = Some(scene.background);

    let mut setup = |state: &mut WgpuRenderState, _input: &mut InputManager| {
        register_wgpu_display_object_renderer(state);
        STAGE_ID
    };
    let mut update = move |_dt: f32, state: &mut WgpuRenderState, _input: &mut InputManager| {
        draw_scene(state, &geometry);
    };
    run_winit_app(config, &mut setup, &mut update);
}

const EXAMPLE_IDS: &[&str] = &[
    "addinganimation",
    "addingtext",
    "animatedsprite",
    "batchloading",
    "bunnymark",
    "comparebitmapdata",
    "displayingabitmap",
    "drawingshapes",
    "nyancat",
    "piratepig",
    "playingsound",
    "playingvideo",
    "renderview",
    "sparktrail",
    "textmetrics",
    "tweenexample",
    "usingtilemap",
];

fn scene_for(id: &str) -> Option<ExampleScene> {
    match id {
        "addinganimation" => Some(example_addinganimation::create_scene()),
        "addingtext" => Some(example_addingtext::create_scene()),
        "animatedsprite" => Some(example_animatedsprite::create_scene()),
        "batchloading" => Some(example_batchloading::create_scene()),
        "bunnymark" => Some(example_bunnymark::create_scene()),
        "comparebitmapdata" => Some(example_comparebitmapdata::create_scene()),
        "displayingabitmap" => Some(example_displayingabitmap::create_scene()),
        "drawingshapes" => Some(example_drawingshapes::create_scene()),
        "nyancat" => Some(example_nyancat::create_scene()),
        "piratepig" => Some(example_piratepig::create_scene()),
        "playingsound" => Some(example_playingsound::create_scene()),
        "playingvideo" => Some(example_playingvideo::create_scene()),
        "renderview" => Some(example_renderview::create_scene()),
        "sparktrail" => Some(example_sparktrail::create_scene()),
        "textmetrics" => Some(example_textmetrics::create_scene()),
        "tweenexample" => Some(example_tweenexample::create_scene()),
        "usingtilemap" => Some(example_usingtilemap::create_scene()),
        _ => None,
    }
}

fn shape_geometry_for_scene(scene: &ExampleScene) -> WgpuShapeGeometry {
    let mut arena = DisplayObjectArena::default();
    let shape = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, shape, scene.fill, 1.0);

    for primitive in &scene.primitives {
        append_primitive(&mut arena, shape, primitive);
    }

    append_shape_end_fill(&mut arena, shape);
    WgpuShapeGeometry {
        regions: get_shape_fill_regions(&arena, shape).unwrap_or_default(),
        content_revision: get_display_object_local_content_revision(&arena, shape),
    }
}

fn append_primitive(
    arena: &mut DisplayObjectArena,
    shape: flighthq_node::NodeId,
    primitive: &ExamplePrimitive,
) {
    match primitive {
        ExamplePrimitive::Rectangle {
            x,
            y,
            width,
            height,
        } => append_shape_rectangle(arena, shape, *x, *y, *width, *height),
        ExamplePrimitive::Circle { x, y, radius } => {
            append_shape_circle(arena, shape, *x, *y, *radius)
        }
        ExamplePrimitive::Ellipse {
            x,
            y,
            width,
            height,
        } => append_shape_ellipse(arena, shape, *x, *y, *width, *height),
        ExamplePrimitive::RoundRectangle {
            x,
            y,
            width,
            height,
            radius,
        } => append_shape_round_rectangle(
            arena,
            shape,
            *x,
            *y,
            *width,
            *height,
            radius * 2.0,
            radius * 2.0,
        ),
        ExamplePrimitive::Polygon { points } => {
            let Some(&(start_x, start_y)) = points.first() else {
                return;
            };
            append_shape_move_to(arena, shape, start_x, start_y);
            for &(x, y) in &points[1..] {
                append_shape_line_to(arena, shape, x, y);
            }
            append_shape_line_to(arena, shape, start_x, start_y);
        }
        ExamplePrimitive::Text { .. } => {}
    }
}

fn draw_scene(state: &mut WgpuRenderState, geometry: &WgpuShapeGeometry) {
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
                regions: geometry.regions.clone(),
                content_revision: geometry.content_revision,
            })
        },
        &|_| None,
        &|_| None,
    );
}
