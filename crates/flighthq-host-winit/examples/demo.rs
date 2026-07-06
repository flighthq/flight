//! `flighthq-host-winit` showcase demo: a real Flight scene driven through the
//! full native host + render pipeline.
//!
//! Run it on a machine with a display and GPU:
//!
//! ```bash
//! cargo run --example demo -p flighthq-host-winit
//! ```
//!
//! What this shows end-to-end, exercising the whole Rust port:
//!   - winit window + event loop bring-up (`run_winit_app`),
//!   - wgpu instance/adapter/device/surface creation and the per-frame render
//!     protocol (background clear -> display-object walk -> submit -> blit to the
//!     surface -> present), with surface resize handled by the host,
//!   - a real scene graph built with the SDK display-object API: a `Stage` with
//!     animated child display objects,
//!   - the genuine render-proxy pre-render update pass `prepare_display_object_render`
//!     run over the stage every frame so transforms/alpha/visibility/blend reach
//!     the render proxies before drawing,
//!   - the genuine scene-graph draw walk `render_wgpu_display_object`, which draws
//!     a solid-red `Shape`'s tessellated fill geometry into the frame — proving
//!     the display-object geometry path renders, not just the background clear,
//!   - animation driven two ways: a `TweenManager` that animates the background
//!     color on an eased loop, and a manual per-frame transform update that spins
//!     a child display object,
//!   - winit -> flighthq-input translation: pointer and key events are logged.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::sync::Arc;

use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_display_object, create_stage,
    get_display_object_local_content_revision, get_display_object_rotation,
    prepare_display_object_render as prepare_display_object_bounds, set_display_object_rotation,
    set_display_object_x, set_display_object_y, set_stage_color,
};
use flighthq_displayobject_wgpu::{
    WgpuShapeGeometry, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_easing::ease_in_out_sine;
use flighthq_host_winit::{InputManager, WgpuRenderState, WinitAppConfig, run_winit_app};
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_shape::{
    append_shape_begin_fill, append_shape_end_fill, append_shape_rectangle, create_shape,
    get_shape_fill_regions,
};
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_tween::{create_tween, create_tween_manager, update_tweens};
use flighthq_types::display::{display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;
use flighthq_types::input::{InputKeyboardData, InputPointerData};
use flighthq_types::{KindId, ShapeFillRegion, TweenOptions};

// The id graph the wgpu walk uses: a stage container with a single red shape
// child, plus the shape's tessellated fill regions resolved once up front.
const STAGE_ID: u64 = 1;
const SHAPE_ID: u64 = 2;

struct DemoState {
    arena: DisplayObjectArena,
    stage: flighthq_node::NodeId,
    spinner: flighthq_node::NodeId,
    tweens: flighthq_types::TweenManager,
    // Tween target identity: a stable address used as the tween map key.
    phase: Box<f32>,
    // Solid-fill geometry for the red shape and its content revision.
    shape_regions: Vec<ShapeFillRegion>,
    shape_content_revision: u32,
}

fn main() {
    // Build the scene graph once, up front, with the real SDK API.
    let mut arena = DisplayObjectArena::default();
    let stage = create_stage(&mut arena);
    set_stage_color(&mut arena, stage, Some(0x10_20_30_ff));

    let spinner = create_display_object(&mut arena);
    set_display_object_x(&mut arena, spinner, 480.0);
    set_display_object_y(&mut arena, spinner, 270.0);
    add_display_object_child(&mut arena, stage, spinner);

    // A real shape display object with a centered solid-red rectangle — the
    // geometry the wgpu walk tessellates, uploads, and draws.
    let mut shape_arena = DisplayObjectArena::default();
    let shape_node = create_shape(&mut shape_arena);
    append_shape_begin_fill(&mut shape_arena, shape_node, 0xff_00_00_ff, 1.0);
    append_shape_rectangle(&mut shape_arena, shape_node, 360.0, 195.0, 240.0, 150.0);
    append_shape_end_fill(&mut shape_arena, shape_node);
    let shape_content_revision =
        get_display_object_local_content_revision(&shape_arena, shape_node);
    let shape_regions =
        get_shape_fill_regions(&shape_arena, shape_node).expect("solid fill resolves to regions");

    let mut tweens = create_tween_manager(None);
    let phase = Box::new(0.0_f32);
    let phase_ptr = (&*phase as *const f32) as u64;
    queue_phase_tween(&mut tweens, phase_ptr, 1.0);

    let demo = Rc::new(RefCell::new(DemoState {
        arena,
        stage,
        spinner,
        tweens,
        phase,
        shape_regions,
        shape_content_revision,
    }));

    let mut config = WinitAppConfig {
        title: "Flight winit host — demo".to_string(),
        width: 960,
        height: 540,
        ..Default::default()
    };
    config.render_options.background_color = Some(0x10_20_30_ff);

    let setup_demo = Rc::clone(&demo);
    let mut scene_setup = move |state: &mut WgpuRenderState, input: &mut InputManager| -> u64 {
        register_wgpu_display_object_renderer(state);

        // Wire input so the demo proves the winit -> flighthq-input seam.
        let g1 = connect_signal(
            &input.signals.on_pointer_down,
            Arc::new(|d: &InputPointerData| {
                println!(
                    "pointer down at ({:.0}, {:.0}) buttons={}",
                    d.x, d.y, d.buttons
                );
            }),
            SignalConnectOptions::default(),
        );
        let g2 = connect_signal(
            &input.signals.on_key_down,
            Arc::new(|d: &InputKeyboardData| {
                println!("key down: code={:?} key_code={}", d.code, d.key_code);
            }),
            SignalConnectOptions::default(),
        );
        std::mem::forget(g1);
        std::mem::forget(g2);

        // Refresh cached display-object bounds before the first frame.
        let mut demo = setup_demo.borrow_mut();
        let stage = demo.stage;
        prepare_display_object_bounds(&mut demo.arena, stage);

        STAGE_ID
    };

    let update_demo = Rc::clone(&demo);
    let mut frame_update =
        move |dt: f32, state: &mut WgpuRenderState, _input: &mut InputManager| {
            let mut demo = update_demo.borrow_mut();

            // 1. Advance the tween and map the eased phase to a background color.
            let phase_ptr = (&*demo.phase as *const f32) as u64;
            let start_phase = *demo.phase;
            let applied = update_tweens(&mut demo.tweens, dt, &mut |_target, keys| {
                keys.iter().map(|k| (k.clone(), start_phase)).collect()
            });
            for (target, key, value) in applied {
                if target == phase_ptr && key == "phase" {
                    *demo.phase = value;
                }
            }
            if demo.tweens.tweens.is_empty() {
                let next = if *demo.phase >= 0.5 { 0.0 } else { 1.0 };
                queue_phase_tween(&mut demo.tweens, phase_ptr, next);
            }
            let p = demo.phase.clamp(0.0, 1.0);
            let g = (0x20 as f32 + p * (0xC0 - 0x20) as f32) as u32;
            let b = (0x40 as f32 + p * (0xA0 - 0x40) as f32) as u32;
            state.render_state.background_color = 0x10_00_00_ff | (g << 16) | (b << 8);

            // 2. Animate the scene graph: spin the child, then run the bounds pass.
            let spinner = demo.spinner;
            let rot = get_display_object_rotation(&demo.arena, spinner) + dt * 1.5;
            set_display_object_rotation(&mut demo.arena, spinner, rot);
            let stage = demo.stage;
            prepare_display_object_bounds(&mut demo.arena, stage);

            // 3. Draw the scene through the real render-proxy prepare pass and the
            //    wgpu walk. The stage→shape id graph is fixed; the shape draws its
            //    tessellated red fill.
            draw_demo_scene(state, &demo.shape_regions, demo.shape_content_revision);
        };

    run_winit_app(config, &mut scene_setup, &mut frame_update);
}

// Runs the render-proxy prepare pass over the stage→shape id graph and walks it
// with render_wgpu_display_object, drawing the shape's solid fill.
fn draw_demo_scene(
    state: &mut WgpuRenderState,
    shape_regions: &[ShapeFillRegion],
    shape_content_revision: u32,
) {
    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    kinds.insert(STAGE_ID, display_object_kind());
    kinds.insert(SHAPE_ID, shape_kind());

    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    children.insert(STAGE_ID, vec![SHAPE_ID]);
    children.insert(SHAPE_ID, vec![]);

    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    parents.insert(STAGE_ID, None);
    parents.insert(SHAPE_ID, Some(STAGE_ID));

    let mut store = RenderStateStore::new();
    let render_id = create_render_state(&mut store, None);
    let render_state = get_render_state(&store, render_id).clone();

    {
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
            STAGE_ID,
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
    }

    let mut proxies: HashMap<u64, flighthq_types::RenderProxy2D> = HashMap::new();
    for id in [STAGE_ID, SHAPE_ID] {
        if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
            proxies.insert(id, proxy.clone());
        }
    }

    let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
    let get_kind = |id: u64| kinds.get(&id).copied().unwrap_or_default();
    let get_proxy = |id: u64| proxies.get(&id).cloned();
    let get_shape_geometry = |id: u64| {
        if id == SHAPE_ID {
            Some(WgpuShapeGeometry {
                regions: shape_regions.to_vec(),
                content_revision: shape_content_revision,
            })
        } else {
            None
        }
    };
    let get_bitmap_texture = |_id: u64| None;
    let get_clip_rectangle = |_id: u64| None;
    render_wgpu_display_object(
        state,
        STAGE_ID,
        &get_children,
        &get_kind,
        &get_proxy,
        &get_shape_geometry,
        &get_bitmap_texture,
        &|_| None,
        &get_clip_rectangle,
    );
}

// Registers an eased tween that drives the `phase` property to `target` over one
// second. The host's frame loop reads the result back and re-arms the loop.
fn queue_phase_tween(tweens: &mut flighthq_types::TweenManager, target_ptr: u64, target: f32) {
    let mut options = TweenOptions::default();
    options.ease = Some(Arc::new(ease_in_out_sine));
    create_tween(
        tweens,
        target_ptr,
        1.0,
        vec![("phase".to_string(), target)],
        Some(options),
    );
}
