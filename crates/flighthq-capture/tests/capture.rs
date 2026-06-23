//! Headless capture integration test.
//!
//! Guarded to skip (pass) when no wgpu adapter — hardware or software — is
//! available, so CI on a display-less, driver-less box does not fail; it only
//! asserts pixels when a real or software adapter exists.

use std::collections::HashMap;

use flighthq_capture::{capture_scene_to_rgba, request_wgpu_capture_device};
use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_displayobject_wgpu::{
    WgpuBitmapTexture, WgpuClipRectangle, WgpuShapeGeometry, register_wgpu_display_object_renderer,
    render_wgpu_display_object,
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
use flighthq_types::display::{bitmap_kind, display_object_kind, shape_kind};
use flighthq_types::geometry::Matrix;

#[test]
fn capture_solid_background_matches_clear_color() {
    if request_wgpu_capture_device().is_none() {
        eprintln!("no wgpu adapter available — skipping capture pixel assertion");
        return;
    }

    const SIZE: u32 = 16;
    const BACKGROUND: u32 = 0x00_80_00_ff; // opaque green, 0xRRGGBBAA

    let pixels =
        capture_scene_to_rgba(SIZE, SIZE, BACKGROUND, 0, Box::new(|_, _| Box::new(|_| {})))
            .expect("adapter present, capture should produce pixels");

    assert_eq!(pixels.len(), (SIZE * SIZE * 4) as usize);

    let center = ((SIZE / 2) * SIZE + (SIZE / 2)) as usize * 4;
    let near = |value: u8, target: i32| (value as i32 - target).abs() <= 2;
    assert!(near(pixels[center], 0x00), "red channel");
    assert!(near(pixels[center + 1], 0x80), "green channel");
    assert!(near(pixels[center + 2], 0x00), "blue channel");
    assert!(near(pixels[center + 3], 0xff), "alpha channel");
}

/// Proof that the display-object geometry draw path renders end-to-end: a Stage
/// container with a solid-red Shape child filling a centered rectangle, captured
/// over a distinct blue background. The center pixel must be red (the shape) and
/// a corner pixel must be the blue background.
///
/// The scene is driven through the real render-proxy prepare pass
/// (`prepare_display_object_render`) and the real wgpu scene walk
/// (`render_wgpu_display_object`). Topology / per-node source values are supplied
/// through id-based closures (a two-node graph: stage → shape); the shape's
/// geometry reaches the renderer through `get_shape_fill_regions` over a real
/// `ShapeArena`, exercising tessellation, GPU upload, and the solid-fill pipeline.
#[test]
fn capture_red_shape_on_background() {
    if request_wgpu_capture_device().is_none() {
        eprintln!("no wgpu adapter available — skipping red-shape capture pixel assertion");
        return;
    }

    const SIZE: u32 = 64;
    const BACKGROUND: u32 = 0x00_00_ff_ff; // opaque blue, 0xRRGGBBAA
    const RED: u32 = 0xff_00_00_ff; // opaque red

    // Build the shape geometry in a real ShapeArena: a centered red rectangle
    // covering the middle half of the frame (16,16 .. 48,48).
    let mut shape_arena = DisplayObjectArena::default();
    let shape_node = create_shape(&mut shape_arena);
    append_shape_begin_fill(&mut shape_arena, shape_node, RED, 1.0);
    append_shape_rectangle(&mut shape_arena, shape_node, 16.0, 16.0, 32.0, 32.0);
    append_shape_end_fill(&mut shape_arena, shape_node);
    let content_revision = get_display_object_local_content_revision(&shape_arena, shape_node);
    let regions =
        get_shape_fill_regions(&shape_arena, shape_node).expect("solid fill resolves to regions");

    // A two-node id graph: stage container (root) with the shape as its only child.
    // Ids are arbitrary stable u64s; the closures key on them.
    const STAGE_ID: u64 = 1;
    const SHAPE_ID: u64 = 2;

    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    kinds.insert(STAGE_ID, display_object_kind());
    kinds.insert(SHAPE_ID, shape_kind());

    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    children.insert(STAGE_ID, vec![SHAPE_ID]);
    children.insert(SHAPE_ID, vec![]);

    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    parents.insert(STAGE_ID, None);
    parents.insert(SHAPE_ID, Some(STAGE_ID));

    let pixels = capture_scene_to_rgba(
        SIZE,
        SIZE,
        BACKGROUND,
        STAGE_ID,
        Box::new(move |state, stage_id| {
            register_wgpu_display_object_renderer(state);

            // Run the real render-proxy prepare pass against a fresh store.
            let mut store = RenderStateStore::new();
            let render_id = create_render_state(&mut store, None);
            // Snapshot the render state (prepare takes the store mutably and the
            // state immutably; clone sidesteps the simultaneous borrow).
            let render_state = get_render_state(&store, render_id).clone();

            let get_children = |id: u64| children.get(&id).cloned().unwrap_or_default();
            let is_enabled = |_id: u64| true;
            let get_parent = |id: u64| parents.get(&id).copied().flatten();
            // Static geometry: revision ids constant; the prepare pass uses the
            // RefreshDerivedState default policy so every node updates regardless.
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

            // Snapshot the prepared proxies so the draw walk can read them by id
            // without holding the store across the capture's draw step.
            let mut proxies: HashMap<u64, flighthq_types::RenderProxy2D> = HashMap::new();
            for id in [stage_id, SHAPE_ID] {
                if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
                    proxies.insert(id, proxy.clone());
                }
            }

            // Geometry closure: only the shape node resolves to fill regions.
            Box::new(move |state: &mut flighthq_render_wgpu::WgpuRenderState| {
                let get_children = move |id: u64| children.get(&id).cloned().unwrap_or_default();
                let get_kind = move |id: u64| kinds.get(&id).copied().unwrap_or_default();
                let get_proxy = move |id: u64| proxies.get(&id).cloned();
                let get_shape_geometry = move |id: u64| {
                    if id == SHAPE_ID {
                        Some(WgpuShapeGeometry {
                            regions: regions.clone(),
                            content_revision,
                        })
                    } else {
                        None
                    }
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
                    &get_clip_rectangle,
                );
            })
        }),
    )
    .expect("adapter present, capture should produce pixels");

    assert_eq!(pixels.len(), (SIZE * SIZE * 4) as usize);

    let near = |value: u8, target: i32| (value as i32 - target).abs() <= 2;
    let pixel = |x: u32, y: u32| {
        let i = (y * SIZE + x) as usize * 4;
        (pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
    };

    // Center pixel: inside the red rectangle.
    let (cr, cg, cb, ca) = pixel(SIZE / 2, SIZE / 2);
    assert!(
        near(cr, 0xff) && near(cg, 0x00) && near(cb, 0x00) && near(ca, 0xff),
        "center pixel expected red, got ({cr}, {cg}, {cb}, {ca})"
    );

    // Corner pixel: outside the rectangle, the blue background clear.
    let (xr, xg, xb, xa) = pixel(1, 1);
    assert!(
        near(xr, 0x00) && near(xg, 0x00) && near(xb, 0xff) && near(xa, 0xff),
        "corner pixel expected blue background, got ({xr}, {xg}, {xb}, {xa})"
    );
}

/// Proof that the bitmap leaf draw path renders a real texture: a Stage with a
/// `Bitmap` child whose 2×2 pixel source carries four distinct opaque colors,
/// drawn to fill the whole frame. Each texel maps to one frame corner; the four
/// captured corner pixels must match the four source texels, proving the upload +
/// quad-draw bitmap path (not a flat fill) ran.
///
/// The pixel bytes are premultiplied RGBA8 (alpha 0xff, so RGB passes through),
/// supplied by the walk's `get_bitmap_texture` closure for the bitmap node. The
/// frame is sampled at its outermost pixels, where clamp-to-edge sampling returns
/// the exact edge texel regardless of linear/nearest filtering.
#[test]
fn capture_bitmap_texture_pattern() {
    if request_wgpu_capture_device().is_none() {
        eprintln!("no wgpu adapter available — skipping bitmap-texture capture pixel assertion");
        return;
    }

    const SIZE: u32 = 32;
    const BACKGROUND: u32 = 0x00_00_00_ff; // opaque black

    // 2x2 premultiplied RGBA8 pattern, top-left origin:
    //   (0,0) red    (1,0) green
    //   (0,1) blue   (1,1) yellow
    #[rustfmt::skip]
    let pixels: Vec<u8> = vec![
        0xff, 0x00, 0x00, 0xff,   0x00, 0xff, 0x00, 0xff,
        0x00, 0x00, 0xff, 0xff,   0xff, 0xff, 0x00, 0xff,
    ];

    const STAGE_ID: u64 = 1;
    const BITMAP_ID: u64 = 2;

    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    kinds.insert(STAGE_ID, display_object_kind());
    kinds.insert(BITMAP_ID, bitmap_kind());

    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    children.insert(STAGE_ID, vec![BITMAP_ID]);
    children.insert(BITMAP_ID, vec![]);

    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    parents.insert(STAGE_ID, None);
    parents.insert(BITMAP_ID, Some(STAGE_ID));

    let pixels_for_closure = pixels.clone();
    let captured = capture_scene_to_rgba(
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
            for id in [stage_id, BITMAP_ID] {
                if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
                    proxies.insert(id, proxy.clone());
                }
            }

            let bitmap_pixels = pixels_for_closure.clone();
            Box::new(move |state: &mut flighthq_render_wgpu::WgpuRenderState| {
                let get_children = move |id: u64| children.get(&id).cloned().unwrap_or_default();
                let get_kind = move |id: u64| kinds.get(&id).copied().unwrap_or_default();
                let get_proxy = move |id: u64| proxies.get(&id).cloned();
                let get_shape_geometry = move |_id: u64| None;
                let get_bitmap_texture = move |id: u64| {
                    if id == BITMAP_ID {
                        Some(WgpuBitmapTexture {
                            image_id: 1,
                            version: 1,
                            pixels: bitmap_pixels.clone(),
                            width: 2,
                            height: 2,
                            draw_width: SIZE as f32,
                            draw_height: SIZE as f32,
                        })
                    } else {
                        None
                    }
                };
                let get_clip_rectangle = move |_id: u64| None;
                render_wgpu_display_object(
                    state,
                    stage_id,
                    &get_children,
                    &get_kind,
                    &get_proxy,
                    &get_shape_geometry,
                    &get_bitmap_texture,
                    &get_clip_rectangle,
                );
            })
        }),
    )
    .expect("adapter present, capture should produce pixels");

    assert_eq!(captured.len(), (SIZE * SIZE * 4) as usize);

    let near = |value: u8, target: i32| (value as i32 - target).abs() <= 2;
    let pixel = |x: u32, y: u32| {
        let i = (y * SIZE + x) as usize * 4;
        (
            captured[i],
            captured[i + 1],
            captured[i + 2],
            captured[i + 3],
        )
    };

    // Each corner samples one source texel under clamp-to-edge.
    let (r, g, b, a) = pixel(0, 0);
    assert!(
        near(r, 0xff) && near(g, 0x00) && near(b, 0x00) && near(a, 0xff),
        "top-left expected red, got ({r}, {g}, {b}, {a})"
    );
    let (r, g, b, a) = pixel(SIZE - 1, 0);
    assert!(
        near(r, 0x00) && near(g, 0xff) && near(b, 0x00) && near(a, 0xff),
        "top-right expected green, got ({r}, {g}, {b}, {a})"
    );
    let (r, g, b, a) = pixel(0, SIZE - 1);
    assert!(
        near(r, 0x00) && near(g, 0x00) && near(b, 0xff) && near(a, 0xff),
        "bottom-left expected blue, got ({r}, {g}, {b}, {a})"
    );
    let (r, g, b, a) = pixel(SIZE - 1, SIZE - 1);
    assert!(
        near(r, 0xff) && near(g, 0xff) && near(b, 0x00) && near(a, 0xff),
        "bottom-right expected yellow, got ({r}, {g}, {b}, {a})"
    );
}

/// Proof that the clip-rectangle path scissors the scene walk: a Stage carrying a
/// clip rectangle over its centered quadrant, with a full-frame red Shape child.
/// Pixels inside the clip rectangle must be the shape's red; pixels outside it
/// must be the background, proving the walk pushed the scissor for the clipping
/// node's subtree and popped it afterward.
#[test]
fn capture_clip_rectangle_bounds_shape() {
    if request_wgpu_capture_device().is_none() {
        eprintln!("no wgpu adapter available — skipping clip-rectangle capture pixel assertion");
        return;
    }

    const SIZE: u32 = 64;
    const BACKGROUND: u32 = 0x00_00_ff_ff; // opaque blue
    const RED: u32 = 0xff_00_00_ff; // opaque red

    // A full-frame red rectangle; the clip restricts it to the centered quadrant.
    let mut shape_arena = DisplayObjectArena::default();
    let shape_node = create_shape(&mut shape_arena);
    append_shape_begin_fill(&mut shape_arena, shape_node, RED, 1.0);
    append_shape_rectangle(
        &mut shape_arena,
        shape_node,
        0.0,
        0.0,
        SIZE as f32,
        SIZE as f32,
    );
    append_shape_end_fill(&mut shape_arena, shape_node);
    let content_revision = get_display_object_local_content_revision(&shape_arena, shape_node);
    let regions =
        get_shape_fill_regions(&shape_arena, shape_node).expect("solid fill resolves to regions");

    // The clip rectangle covers the centered half-frame quadrant (16,16 .. 48,48).
    let clip = WgpuClipRectangle {
        x: 16.0,
        y: 16.0,
        width: 32.0,
        height: 32.0,
    };

    const STAGE_ID: u64 = 1;
    const SHAPE_ID: u64 = 2;

    let mut kinds: HashMap<u64, KindId> = HashMap::new();
    kinds.insert(STAGE_ID, display_object_kind());
    kinds.insert(SHAPE_ID, shape_kind());

    let mut children: HashMap<u64, Vec<u64>> = HashMap::new();
    children.insert(STAGE_ID, vec![SHAPE_ID]);
    children.insert(SHAPE_ID, vec![]);

    let mut parents: HashMap<u64, Option<u64>> = HashMap::new();
    parents.insert(STAGE_ID, None);
    parents.insert(SHAPE_ID, Some(STAGE_ID));

    let pixels = capture_scene_to_rgba(
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
            for id in [stage_id, SHAPE_ID] {
                if let Some(proxy) = get_render_proxy_2d(&store, render_id, id) {
                    proxies.insert(id, proxy.clone());
                }
            }

            Box::new(move |state: &mut flighthq_render_wgpu::WgpuRenderState| {
                let get_children = move |id: u64| children.get(&id).cloned().unwrap_or_default();
                let get_kind = move |id: u64| kinds.get(&id).copied().unwrap_or_default();
                let get_proxy = move |id: u64| proxies.get(&id).cloned();
                let get_shape_geometry = move |id: u64| {
                    if id == SHAPE_ID {
                        Some(WgpuShapeGeometry {
                            regions: regions.clone(),
                            content_revision,
                        })
                    } else {
                        None
                    }
                };
                let get_bitmap_texture = move |_id: u64| None;
                // The stage node carries the clip; it applies to its subtree (the shape).
                let get_clip_rectangle = move |id: u64| {
                    if id == STAGE_ID { Some(clip) } else { None }
                };
                render_wgpu_display_object(
                    state,
                    stage_id,
                    &get_children,
                    &get_kind,
                    &get_proxy,
                    &get_shape_geometry,
                    &get_bitmap_texture,
                    &get_clip_rectangle,
                );
            })
        }),
    )
    .expect("adapter present, capture should produce pixels");

    assert_eq!(pixels.len(), (SIZE * SIZE * 4) as usize);

    let near = |value: u8, target: i32| (value as i32 - target).abs() <= 2;
    let pixel = |x: u32, y: u32| {
        let i = (y * SIZE + x) as usize * 4;
        (pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3])
    };

    // Center pixel: inside the clip rectangle, shows the red shape.
    let (cr, cg, cb, ca) = pixel(SIZE / 2, SIZE / 2);
    assert!(
        near(cr, 0xff) && near(cg, 0x00) && near(cb, 0x00) && near(ca, 0xff),
        "center pixel expected red shape inside clip, got ({cr}, {cg}, {cb}, {ca})"
    );

    // Corner pixel: outside the clip rectangle, the shape is scissored away so the
    // blue background shows through.
    let (xr, xg, xb, xa) = pixel(2, 2);
    assert!(
        near(xr, 0x00) && near(xg, 0x00) && near(xb, 0xff) && near(xa, 0xff),
        "corner pixel expected blue background outside clip, got ({xr}, {xg}, {xb}, {xa})"
    );

    // A pixel just outside the clip edge (clip ends at x=48) must also be background.
    let (er, eg, eb, ea) = pixel(54, SIZE / 2);
    assert!(
        near(er, 0x00) && near(eg, 0x00) && near(eb, 0xff) && near(ea, 0xff),
        "pixel past clip edge expected background, got ({er}, {eg}, {eb}, {ea})"
    );
}
