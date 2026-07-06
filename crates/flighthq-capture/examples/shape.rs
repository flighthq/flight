//! Renders a Flight scene (a Stage with solid-color Shape children) to a PNG via
//! the headless wgpu capture path, so the geometry draw pipeline can be eyeballed.
//!
//! Run: `cargo run -p flighthq-capture --example shape`
//! Writes `flight-shape.png` to the temp dir (needs a real or software adapter).

use std::collections::HashMap;

use flighthq_capture::{capture_scene_to_png, request_wgpu_capture_device};
use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_displayobject_wgpu::{
    WgpuShapeGeometry, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_shape::{
    append_shape_begin_fill, append_shape_end_fill, append_shape_rectangle, create_shape,
    get_shape_fill_regions,
};
use flighthq_types::KindId;
use flighthq_types::display::{display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;

const SIZE: u32 = 256;
const BACKGROUND: u32 = 0x20_20_30_ff; // dark slate, 0xRRGGBBAA

// Three overlapping rectangles: red, green, blue.
const SHAPES: &[(u64, u32, f32, f32, f32, f32)] = &[
    (10, 0xE0_30_30_ff, 40.0, 40.0, 120.0, 120.0),
    (11, 0x30_C0_50_ff, 96.0, 96.0, 120.0, 120.0),
    (12, 0x40_70_E0_ff, 150.0, 40.0, 70.0, 160.0),
];

fn main() {
    if request_wgpu_capture_device().is_none() {
        eprintln!("no wgpu adapter (install mesa-vulkan-drivers for llvmpipe) — nothing captured");
        return;
    }

    const STAGE_ID: u64 = 1;

    let mut shape_arena = DisplayObjectArena::default();
    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    let mut geometry: HashMap<u64, WgpuShapeGeometry> = HashMap::new();

    kinds.insert(STAGE_ID, display_object_kind());
    parents.insert(STAGE_ID, None);
    let mut stage_children = Vec::new();

    for &(id, color, x, y, w, h) in SHAPES {
        let node = create_shape(&mut shape_arena);
        append_shape_begin_fill(&mut shape_arena, node, color, 1.0);
        append_shape_rectangle(&mut shape_arena, node, x, y, w, h);
        append_shape_end_fill(&mut shape_arena, node);
        let content_revision = get_display_object_local_content_revision(&shape_arena, node);
        let regions = get_shape_fill_regions(&shape_arena, node).expect("solid fill resolves");
        geometry.insert(
            id,
            WgpuShapeGeometry {
                regions,
                content_revision,
            },
        );
        kinds.insert(id, shape_kind());
        children.insert(id, vec![]);
        parents.insert(id, Some(STAGE_ID));
        stage_children.push(id);
    }
    children.insert(STAGE_ID, stage_children);

    let out = std::env::temp_dir().join("flight-shape.png");
    let ok = capture_scene_to_png(
        SIZE,
        SIZE,
        BACKGROUND,
        STAGE_ID,
        Box::new(move |state, stage_id| {
            register_wgpu_display_object_renderer(state);

            let mut store = RenderStateStore::new();
            let render_id = create_render_state(&mut store, None);
            let render_state = get_render_state(&store, render_id).clone();

            let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
            let is_enabled = |_id: u64| true;
            let get_parent = |id: u64| parents.get(&id).copied().flatten();
            let get_revisions = |_id: u64| (1u32, 1u32, 1u32);
            let get_kind = |id: u64| kinds.get(&id).copied().unwrap_or_default();
            let get_local_transform = |_id: u64| Matrix::default();
            let get_alpha = |_id: u64| 1.0f32;
            let get_visible = |_id: u64| true;
            let get_blend = |_id: u64| None;
            let get_clip = |_id: u64| false;

            prepare_display_object_render(
                &mut store,
                render_id,
                &render_state,
                stage_id,
                &get_children,
                &is_enabled,
                &get_parent,
                &get_revisions,
                &get_kind,
                &get_local_transform,
                &get_alpha,
                &get_visible,
                &get_blend,
                &get_clip,
            );

            let mut proxies: HashMap<u64, flighthq_types::RenderProxy2D> = HashMap::new();
            let mut ids = vec![stage_id];
            ids.extend(SHAPES.iter().map(|s| s.0));
            for id in ids {
                if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
                    proxies.insert(id, proxy.clone());
                }
            }

            Box::new(move |state: &mut flighthq_render_wgpu::WgpuRenderState| {
                let get_children = move |id: u64| children.get(&id).cloned().unwrap_or_default();
                let get_kind = move |id: u64| kinds.get(&id).copied().unwrap_or_default();
                let get_proxy = move |id: u64| proxies.get(&id).cloned();
                let get_shape_geometry = move |id: u64| {
                    geometry.get(&id).map(|g| WgpuShapeGeometry {
                        regions: g.regions.clone(),
                        content_revision: g.content_revision,
                    })
                };
                let get_bitmap_texture = move |_id: u64| None;
                let get_clip_rectangle = move |_id: u64| None;
                render_wgpu_display_object(
                    state,
                    stage_id,
                    &get_children,
                    &get_kind,
                    &get_proxy,
                    &get_shape_geometry,
                    &get_bitmap_texture,
                    &|_| None,
                    &|_| None,
                    &get_clip_rectangle,
                );
            })
        }),
        &out,
    );

    if ok {
        println!("wrote {}", out.display());
    } else {
        eprintln!("capture failed");
    }
}
