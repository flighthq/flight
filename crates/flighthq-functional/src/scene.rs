//! Declarative scenes and the shared capture path that renders one to RGBA.
//!
//! A scene is a list of solid-color rectangles over a background, optionally
//! followed by a full-frame render-effect chain. The scene geometry is plain
//! data (`RectFill`); the effect chain is plain data (`RenderEffect`).
//! `render_scene_to_rgba` turns the scene into the `flighthq-capture` draw step,
//! mirroring the `crates/flighthq-capture/examples/shape.rs` pattern, and — when
//! the scene carries effects — runs the rendered shape frame through the
//! `flighthq-effects-wgpu` render-effect pipeline (begin → apply → end) before
//! readback.

use std::collections::HashMap;

use flighthq_capture::{capture_scene_with_teardown_to_rgba, request_wgpu_capture_device};
use flighthq_displayobject_wgpu::{
    WgpuShapeGeometry, register_wgpu_display_object_renderer, render_wgpu_display_object,
};
use flighthq_effects::RenderEffect;
use flighthq_effects_wgpu::{
    WgpuRenderEffectPipelineOptions, begin_wgpu_render_effect_pipeline,
    clear_wgpu_effect_pipeline_cache, clear_wgpu_render_effect_registry,
    create_wgpu_render_effect_pipeline, destroy_wgpu_render_effect_pipeline,
    end_wgpu_render_effect_pipeline, register_wgpu_render_effect, wgpu_render_effect_type,
};
use flighthq_types::geometry::Matrix;

use crate::scene_graph::{SceneGraph, build_scene_graph};

/// One solid-color rectangle in a scene. `color` is a packed `0xRRGGBBAA` value,
/// the codebase-wide color convention.
///
/// `x/y/w/h` are the fill rectangle in the shape's **local** coordinate space.
/// The shape's local transform is `rotate(rotation_deg) ∘ translate(origin)`,
/// matching the OpenFL `displayObject.rotation` + `displayObject.x/y` model:
/// the local geometry is rotated about the shape origin, then placed at
/// `(origin_x, origin_y)` in stage pixels. An axis-aligned rect leaves
/// `rotation_deg`, `origin_x`, and `origin_y` at `0.0`, which yields the identity
/// local transform — so `x/y/w/h` then read directly as stage-pixel coordinates,
/// exactly as before. A rotated shape places its fill rect relative to the origin
/// (e.g. `(-70, -70, 140, 140)`) and carries the rotation/position in the
/// transform fields, fed into `prepare_display_object_render` as the node's local
/// transform.
#[derive(Copy, Clone, Debug)]
pub struct RectFill {
    pub color: u32,
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// Local rotation in degrees, applied about the shape origin before
    /// translation. `0.0` for an axis-aligned rect.
    pub rotation_deg: f32,
    /// Shape origin x in stage pixels (the local transform's translation).
    pub origin_x: f32,
    /// Shape origin y in stage pixels (the local transform's translation).
    pub origin_y: f32,
}

/// A declarative functional scene: a sized stage, a background color, the
/// rectangles to draw, an optional full-frame render-effect chain, and an
/// optional mapping to a TS functional baseline stem (the
/// `tests/functional/baselines/<stem>.json` file) when the Rust scene reproduces
/// a TS scene.
///
/// `effects` is a builder (not a slice) because `RenderEffect` carries owned
/// data and is not trivially `const`-constructible; it returns the per-frame
/// effect list, empty for a pure-shape scene. `ts_baseline` is `None` until a
/// Rust scene matches a TS scene 1:1.
#[derive(Clone, Debug)]
pub struct Scene {
    pub name: &'static str,
    pub width: u32,
    pub height: u32,
    pub background: u32,
    pub ts_baseline: Option<&'static str>,
    pub rects: &'static [RectFill],
    /// Builds the per-frame full-frame effect chain. Returns an empty list for a
    /// pure-shape scene (the default via [`no_scene_effects`]).
    pub effects: fn() -> Vec<RenderEffect>,
    /// When `true`, the effect pipeline's scene target is an HDR `Rgba16Float`
    /// texture, matching the TS scenes that pass `format: 'rgba16f'` (exposure,
    /// tone-map). The shape pass and present blit operate in HDR linear space so
    /// values above 1.0 survive into the effect, instead of clamping in `Rgba8`.
    pub hdr: bool,
}

/// Builds an axis-aligned [`RectFill`] in stage-pixel coordinates (identity local
/// transform). `const`, so it composes into the `const` scene rect arrays.
pub const fn axis_rect(color: u32, x: f32, y: f32, w: f32, h: f32) -> RectFill {
    RectFill {
        color,
        x,
        y,
        w,
        h,
        rotation_deg: 0.0,
        origin_x: 0.0,
        origin_y: 0.0,
    }
}

/// Builds a rotated [`RectFill`]: a fill rect in local space, rotated by
/// `rotation_deg` about the shape origin and placed at `(origin_x, origin_y)` in
/// stage pixels. `const`, so it composes into the `const` scene rect arrays.
pub const fn rotated_rect(
    color: u32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    rotation_deg: f32,
    origin_x: f32,
    origin_y: f32,
) -> RectFill {
    RectFill {
        color,
        x,
        y,
        w,
        h,
        rotation_deg,
        origin_x,
        origin_y,
    }
}

/// Builds the shape's local transform matrix from its rotation and origin,
/// matching the OpenFL `displayObject.rotation` (degrees) + `x`/`y` model with
/// unit scale: rotate the local geometry about the origin, then translate to
/// `(origin_x, origin_y)`. An axis-aligned rect (`rotation_deg == 0`,
/// `origin == 0`) yields the identity, so its fill rect reads directly in stage
/// pixels. The 2×3 affine is `a=cos, b=sin, c=-sin, d=cos, tx=origin_x,
/// ty=origin_y` — the standard 2D rotation about the origin with translation.
pub fn local_transform_for_rect(rect: &RectFill) -> Matrix {
    if rect.rotation_deg == 0.0 && rect.origin_x == 0.0 && rect.origin_y == 0.0 {
        return Matrix::default();
    }
    let radians = rect.rotation_deg.to_radians();
    let cos = radians.cos();
    let sin = radians.sin();
    Matrix {
        a: cos,
        b: sin,
        c: -sin,
        d: cos,
        tx: rect.origin_x,
        ty: rect.origin_y,
    }
}

/// The empty effect chain — a scene that renders shapes only, with no
/// post-process pass.
pub fn no_scene_effects() -> Vec<RenderEffect> {
    Vec::new()
}

/// The committed-baseline-renderable scenes. Solid shapes, plus full-frame
/// color-grade effect chains; this list grows as filters/sprite/text/clip
/// rendering lands in the Rust port.
pub fn scenes() -> Vec<Scene> {
    let mut scenes = vec![
        Scene {
            name: "solid-red",
            width: 64,
            height: 64,
            background: 0x20_20_30_ff,
            ts_baseline: None,
            hdr: false,
            rects: SOLID_RED_RECTS,
            effects: no_scene_effects,
        },
        Scene {
            name: "overlap-rects",
            width: 128,
            height: 128,
            background: 0x20_20_30_ff,
            ts_baseline: None,
            hdr: false,
            rects: OVERLAP_RECTS,
            effects: no_scene_effects,
        },
        Scene {
            name: "quadrants",
            width: 64,
            height: 64,
            background: 0x10_10_10_ff,
            ts_baseline: None,
            hdr: false,
            rects: QUADRANTS_RECTS,
            effects: no_scene_effects,
        },
    ];
    scenes.extend(effect_scenes());
    scenes
}

/// Renders a scene to tightly packed RGBA bytes (`width * height * 4`, top-left
/// origin) through the headless wgpu capture path. When the scene carries an
/// effect chain, the shape frame is rendered into the render-effect pipeline's
/// scene target and the chain runs before readback. Returns `None` when no wgpu
/// adapter is available, so a GPU-less CI box degrades gracefully rather than
/// failing.
pub fn render_scene_to_rgba(scene: &Scene) -> Option<Vec<u8>> {
    if request_wgpu_capture_device().is_none() {
        return None;
    }

    let graph = build_scene_graph(scene);
    let background = scene.background;
    let effects: Vec<RenderEffect> = (scene.effects)();
    let hdr = scene.hdr;

    capture_scene_with_teardown_to_rgba(
        scene.width,
        scene.height,
        background,
        graph.stage_id,
        Box::new(move |state, stage_id| {
            register_wgpu_display_object_renderer(state);

            // Wrap the backend-agnostic fill regions in the wgpu geometry type
            // the walk expects; the geometry cache keys on `content_revision`.
            let SceneGraph {
                children,
                kinds,
                proxies,
                regions,
                ..
            } = graph;
            let geometry: HashMap<u64, WgpuShapeGeometry> = regions
                .into_iter()
                .map(|(id, (regions, content_revision))| {
                    (
                        id,
                        WgpuShapeGeometry {
                            regions,
                            content_revision,
                        },
                    )
                })
                .collect();

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

                // Shape scenes carry no bitmaps or clips, so these resolvers
                // always return None.
                let get_bitmap_texture =
                    |_id: u64| -> Option<flighthq_displayobject_wgpu::WgpuBitmapTexture> { None };
                let get_clip_rectangle =
                    |_id: u64| -> Option<flighthq_displayobject_wgpu::WgpuClipRectangle> { None };

                if effects.is_empty() {
                    // Pure-shape frame: walk straight into the open capture pass.
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
                    // Nothing retained past the frame.
                    let teardown: flighthq_capture::WgpuCaptureTeardown =
                        Box::new(|_: &mut flighthq_render_wgpu::WgpuRenderState| {});
                    return teardown;
                }

                // Effect frame: render the shapes into the pipeline's scene
                // target, then run the chain (begin → draw → apply → end). The
                // capture pass is already open (the background clear); begin
                // ends it and pushes the scene target, end pops back and
                // presents the graded result into the capture texture.
                register_scene_effects(state, &effects);
                let pipeline_format = if hdr {
                    Some(wgpu::TextureFormat::Rgba16Float)
                } else {
                    None
                };
                let mut pipeline = create_wgpu_render_effect_pipeline(
                    state,
                    WgpuRenderEffectPipelineOptions {
                        format: pipeline_format,
                        ..WgpuRenderEffectPipelineOptions::default()
                    },
                );
                begin_wgpu_render_effect_pipeline(state, &mut pipeline);
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
                end_wgpu_render_effect_pipeline(state, &mut pipeline, &effects);

                // The pipeline's scene/scratch targets are referenced by the
                // submitted command buffer (the encoded effect passes + present),
                // so defer destroying them until after the capture submits. The
                // per-state effect caches are keyed by the state's pointer
                // identity, so clear them before this state is dropped — a later
                // capture's state can reuse the same address and would otherwise
                // dispatch against this state's freed pipelines/buffers.
                let teardown: flighthq_capture::WgpuCaptureTeardown =
                    Box::new(move |state: &mut flighthq_render_wgpu::WgpuRenderState| {
                        destroy_wgpu_render_effect_pipeline(state, pipeline);
                        clear_wgpu_effect_pipeline_cache(state);
                        clear_wgpu_render_effect_registry(state);
                    });
                teardown
            })
        }),
    )
}

/// The TS color-grade effect scenes reproduced 1:1: a shape base matching the
/// TS `app.ts` grid/spread plus the exact `render.webgpu.ts` effect and params,
/// each mapped to its TS baseline stem. Rotated- or HDR-base scenes
/// (`effect-exposure`) are not reproduced because the shape base needs rotation
/// / HDR float targets the `RectFill`/non-HDR capture path does not model yet.
fn effect_scenes() -> Vec<Scene> {
    vec![
        Scene {
            name: "effect-grayscale",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-grayscale"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::Grayscale(
                    flighthq_effects::types::GrayscaleEffect {
                        intensity: Some(1.0),
                    },
                )]
            },
        },
        Scene {
            name: "effect-invert",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-invert"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::Invert(
                    flighthq_effects::types::InvertEffect {
                        intensity: Some(1.0),
                    },
                )]
            },
        },
        Scene {
            name: "effect-sepia",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-sepia"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::Sepia(flighthq_effects::types::SepiaEffect {
                    intensity: Some(1.0),
                })]
            },
        },
        Scene {
            name: "effect-brightness-contrast",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-brightness-contrast"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::BrightnessContrast(
                    flighthq_effects::types::BrightnessContrastEffect {
                        brightness: Some(0.15),
                        contrast: Some(0.35),
                    },
                )]
            },
        },
        Scene {
            name: "effect-hue-saturation",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-hue-saturation"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::HueSaturation(
                    flighthq_effects::types::HueSaturationEffect {
                        hue: Some(90.0),
                        saturation: Some(0.4),
                        lightness: Some(0.0),
                    },
                )]
            },
        },
        Scene {
            name: "effect-posterize",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-posterize"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::Posterize(
                    flighthq_effects::types::PosterizeEffect { levels: Some(4) },
                )]
            },
        },
        Scene {
            name: "effect-color-grade",
            width: 800,
            height: 600,
            background: 0x10_10_14_ff,
            ts_baseline: Some("effect-color-grade"),
            hdr: false,
            rects: COLOR_GRADE_SPREAD_RECTS,
            effects: || {
                vec![RenderEffect::ColorGrade(
                    flighthq_effects::types::ColorGradeEffect {
                        exposure: None,
                        contrast: Some(1.2),
                        saturation: Some(1.5),
                        temperature: Some(0.2),
                        tint: None,
                        brightness: None,
                    },
                )]
            },
        },
        Scene {
            name: "effect-channel-mixer",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-channel-mixer"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::ChannelMixer(
                    flighthq_effects::types::ChannelMixerEffect {
                        matrix: [0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0],
                    },
                )]
            },
        },
        Scene {
            name: "effect-white-balance",
            width: 800,
            height: 600,
            background: 0x20_28_30_ff,
            ts_baseline: Some("effect-white-balance"),
            hdr: false,
            rects: GRADE_GRID_RECTS,
            effects: || {
                vec![RenderEffect::WhiteBalance(
                    flighthq_effects::types::WhiteBalanceEffect {
                        temperature: Some(0.4),
                        tint: Some(-0.2),
                    },
                )]
            },
        },
        // Identity check: the effect pipeline runs with an empty chain, so the
        // present blit must reproduce the plain shape frame. Base from
        // `effect-empty-passthrough/app.ts` — four 140x140 axis-aligned rects.
        Scene {
            name: "effect-empty-passthrough",
            width: 800,
            height: 600,
            background: 0x10_10_14_ff,
            ts_baseline: Some("effect-empty-passthrough"),
            hdr: false,
            rects: EMPTY_PASSTHROUGH_RECTS,
            // A single no-op pass keeps the frame on the pipeline path (begin →
            // draw → present) instead of the pure-shape shortcut, exercising the
            // identity present blit the TS scene checks.
            effects: || {
                vec![RenderEffect::Posterize(
                    flighthq_effects::types::PosterizeEffect { levels: Some(256) },
                )]
            },
        },
        // Flat mid-gray fill with per-pixel film grain. Base from
        // `effect-film-grain/app.ts`; params from `render.webgpu.ts`
        // (`intensity: 0.3, size: 1.5, seed: 7`).
        Scene {
            name: "effect-film-grain",
            width: 800,
            height: 600,
            background: 0x80_80_80_ff,
            ts_baseline: Some("effect-film-grain"),
            hdr: false,
            rects: FILM_GRAIN_RECTS,
            effects: || {
                vec![RenderEffect::FilmGrain(
                    flighthq_effects::types::FilmGrainEffect {
                        intensity: Some(0.3),
                        size: Some(1.5),
                        seed: Some(7.0),
                    },
                )]
            },
        },
        // Bright saturated primaries on a near-black field, rendered into an HDR
        // `rgba16f` scene target and tone-mapped with the ACES operator at
        // exposure 1.5. Base from `effect-tone-map/app.ts` (four 160x160 rects
        // centered at (-80,-80)); params from `render.webgpu.ts`
        // (`operator: 'aces', exposure: 1.5`).
        Scene {
            name: "effect-tone-map",
            width: 800,
            height: 600,
            background: 0x05_06_0a_ff,
            ts_baseline: Some("effect-tone-map"),
            hdr: true,
            rects: TONE_MAP_RECTS,
            effects: || {
                vec![RenderEffect::ToneMap(
                    flighthq_effects::types::ToneMapEffect {
                        operator: Some(flighthq_effects::types::ToneMapOperator::Aces),
                        exposure: Some(1.5),
                        white: None,
                    },
                )]
            },
        },
        // Bright saturated rotated shapes on a near-black field, rendered into an
        // HDR `rgba16f` scene target and scaled by `2^exposure`. Base from
        // `effect-exposure/app.ts` (four 140x140 rects centered at (-70,-70), each
        // rotated `12 + 20*i` degrees about its origin); params from
        // `render.webgpu.ts` (`exposure: 1`).
        Scene {
            name: "effect-exposure",
            width: 800,
            height: 600,
            background: 0x05_06_0a_ff,
            ts_baseline: Some("effect-exposure"),
            hdr: true,
            rects: EXPOSURE_RECTS,
            effects: || {
                vec![RenderEffect::Exposure(
                    flighthq_effects::types::ExposureEffect {
                        exposure: Some(1.0),
                    },
                )]
            },
        },
    ]
}

// The `solid-red` scene: one 32x32 rect on a dark field.
const SOLID_RED_RECTS: &[RectFill] = &[axis_rect(0xE0_30_30_ff, 16.0, 16.0, 32.0, 32.0)];

// The `overlap-rects` scene: three overlapping rects exercising draw order.
const OVERLAP_RECTS: &[RectFill] = &[
    axis_rect(0xE0_30_30_ff, 20.0, 20.0, 60.0, 60.0),
    axis_rect(0x30_C0_50_ff, 48.0, 48.0, 60.0, 60.0),
    axis_rect(0x40_70_E0_ff, 75.0, 20.0, 35.0, 80.0),
];

// The `quadrants` scene: four 32x32 rects filling the 64x64 frame's quadrants.
const QUADRANTS_RECTS: &[RectFill] = &[
    axis_rect(0xE0_30_30_ff, 0.0, 0.0, 32.0, 32.0),
    axis_rect(0x30_C0_50_ff, 32.0, 0.0, 32.0, 32.0),
    axis_rect(0x40_70_E0_ff, 0.0, 32.0, 32.0, 32.0),
    axis_rect(0xE0_C0_30_ff, 32.0, 32.0, 32.0, 32.0),
];

// `effect-tone-map/app.ts`: four 160x160 axis-aligned rects centered at
// (-80,-80), positioned at x = 800*(0.3 + 0.4*(i%2)),
// y = 600*(0.32 + 0.36*floor(i/2)); world rect (x - 80, y - 80, 160, 160).
// Colors `[white, red, green, blue]` bridged through `ts_shape_color`.
const TONE_MAP_RECTS: &[RectFill] = &[
    axis_rect(
        ts_shape_color(0xff_ff_ff_ff),
        800.0 * 0.30 - 80.0,
        600.0 * 0.32 - 80.0,
        160.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0xff_00_00_ff),
        800.0 * 0.70 - 80.0,
        600.0 * 0.32 - 80.0,
        160.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0x00_ff_00_ff),
        800.0 * 0.30 - 80.0,
        600.0 * 0.68 - 80.0,
        160.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0x00_00_ff_ff),
        800.0 * 0.70 - 80.0,
        600.0 * 0.68 - 80.0,
        160.0,
        160.0,
    ),
];

// `effect-exposure/app.ts`: four 140x140 rects, each created with a local fill
// rect (-70,-70,140,140), rotated `12 + 20*i` degrees about its origin, and
// placed at origin x = 800*(0.28 + 0.44*(i%2)), y = 600*(0.3 + 0.4*floor(i/2)).
// The local fill rect + rotation/origin feed `prepare_display_object_render` as
// the node's local transform. Colors bridged through `ts_shape_color`.
const EXPOSURE_RECTS: &[RectFill] = &[
    rotated_rect(
        ts_shape_color(0xff_ff_ff_ff),
        -70.0,
        -70.0,
        140.0,
        140.0,
        12.0,
        800.0 * 0.28,
        600.0 * 0.30,
    ),
    rotated_rect(
        ts_shape_color(0xff_f0_5c_ff),
        -70.0,
        -70.0,
        140.0,
        140.0,
        32.0,
        800.0 * 0.72,
        600.0 * 0.30,
    ),
    rotated_rect(
        ts_shape_color(0x5c_ff_e0_ff),
        -70.0,
        -70.0,
        140.0,
        140.0,
        52.0,
        800.0 * 0.28,
        600.0 * 0.70,
    ),
    rotated_rect(
        ts_shape_color(0xff_5c_e0_ff),
        -70.0,
        -70.0,
        140.0,
        140.0,
        72.0,
        800.0 * 0.72,
        600.0 * 0.70,
    ),
];

// `effect-empty-passthrough/app.ts`: four 140x140 axis-aligned rects centered at
// (-70,-70), positioned at x = 800*(0.28 + 0.44*(i%2)),
// y = 600*(0.3 + 0.4*floor(i/2)); world rect (x - 70, y - 70, 140, 140). Colors
// bridged through `ts_shape_color`.
const EMPTY_PASSTHROUGH_RECTS: &[RectFill] = &[
    axis_rect(
        ts_shape_color(0xff_5c_5c_ff),
        800.0 * 0.28 - 70.0,
        600.0 * 0.30 - 70.0,
        140.0,
        140.0,
    ),
    axis_rect(
        ts_shape_color(0x5c_ff_5c_ff),
        800.0 * 0.72 - 70.0,
        600.0 * 0.30 - 70.0,
        140.0,
        140.0,
    ),
    axis_rect(
        ts_shape_color(0x5c_5c_ff_ff),
        800.0 * 0.28 - 70.0,
        600.0 * 0.70 - 70.0,
        140.0,
        140.0,
    ),
    axis_rect(
        ts_shape_color(0xff_ff_5c_ff),
        800.0 * 0.72 - 70.0,
        600.0 * 0.70 - 70.0,
        140.0,
        140.0,
    ),
];

// `effect-film-grain/app.ts`: a single flat mid-gray fill covering the whole
// 800x600 frame. Color bridged through `ts_shape_color`.
const FILM_GRAIN_RECTS: &[RectFill] = &[axis_rect(
    ts_shape_color(0x80_80_80_ff),
    0.0,
    0.0,
    800.0,
    600.0,
)];

// Registers each scene effect's default WGPU runner on the state so the
// pipeline's registry can dispatch the chain. Keyed by the agnostic effect
// type string, mirroring the TS `registerWebGPURenderEffect` calls.
fn register_scene_effects(
    state: &mut flighthq_render_wgpu::WgpuRenderState,
    effects: &[RenderEffect],
) {
    use flighthq_effects_wgpu::{
        DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER, DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER,
        DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER, DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER,
        DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER, DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER,
        DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER, DEFAULT_WGPU_INVERT_EFFECT_RUNNER,
        DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER, DEFAULT_WGPU_SEPIA_EFFECT_RUNNER,
        DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER, DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER,
    };
    for effect in effects {
        let type_key = wgpu_render_effect_type(effect);
        let runner = match effect {
            RenderEffect::BrightnessContrast(_) => DEFAULT_WGPU_BRIGHTNESS_CONTRAST_EFFECT_RUNNER,
            RenderEffect::ChannelMixer(_) => DEFAULT_WGPU_CHANNEL_MIXER_EFFECT_RUNNER,
            RenderEffect::ColorGrade(_) => DEFAULT_WGPU_COLOR_GRADE_EFFECT_RUNNER,
            RenderEffect::Exposure(_) => DEFAULT_WGPU_EXPOSURE_EFFECT_RUNNER,
            RenderEffect::FilmGrain(_) => DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER,
            RenderEffect::Grayscale(_) => DEFAULT_WGPU_GRAYSCALE_EFFECT_RUNNER,
            RenderEffect::HueSaturation(_) => DEFAULT_WGPU_HUE_SATURATION_EFFECT_RUNNER,
            RenderEffect::Invert(_) => DEFAULT_WGPU_INVERT_EFFECT_RUNNER,
            RenderEffect::Posterize(_) => DEFAULT_WGPU_POSTERIZE_EFFECT_RUNNER,
            RenderEffect::Sepia(_) => DEFAULT_WGPU_SEPIA_EFFECT_RUNNER,
            RenderEffect::ToneMap(_) => DEFAULT_WGPU_TONE_MAP_EFFECT_RUNNER,
            RenderEffect::WhiteBalance(_) => DEFAULT_WGPU_WHITE_BALANCE_EFFECT_RUNNER,
            _ => continue,
        };
        register_wgpu_render_effect(state, type_key, runner);
    }
}

// Bridges a TS-authored fill color to the value Flight's RGBA renderer must be
// fed to reproduce the TS-rendered pixels.
//
// The TS functional baselines were captured with a shape renderer that unpacks
// the packed fill color as **ARGB** (`0xAARRGGBB`): the rendered RGB is the
// source's `(G, B, A)` bytes (so blue always reads as 255 from the source's
// `0xff` alpha byte). All three TS backends (canvas, webgl, webgpu) agree on
// this, so it is the rendered behavior the baselines encode — not a per-backend
// quirk. Flight's documented convention and the Rust renderer use **RGBA**
// (`0xRRGGBBAA`), which is correct and left unchanged. To make the correct RGBA
// renderer emit the same pixels the TS ARGB renderer produced, the source color
// is rotated left one byte and re-alpha'd: `(src << 8) | 0xff` maps source
// `0xRRGGBBAA` → `0xGGBBAAff`, whose RGBA unpack is exactly the TS `(G, B, A)`.
//
// This is a convention bridge at the scene-data layer, not a renderer change:
// the diff between Flight's RGBA convention and the TS baselines' ARGB encoding
// is fully isolated here. Every grade with a TS *webgpu* fingerprint matches at
// diff 0 once bridged. The two grades whose TS baseline node committed only a
// sha256 (no webgpu fingerprint) — `effect-hue-saturation` and
// `effect-brightness-contrast` — have no wgpu reference to compare against and
// are reported deferred; comparing them to the canvas/webgl baselines would grade
// the wgpu HSL shader against canvas's CSS-filter algorithm, a different math, not
// a port regression. The Rust wgpu hue/saturation shader is byte-identical to the
// TS wgpu shader, so it will match once a webgpu fingerprint is captured TS-side.
const fn ts_shape_color(src: u32) -> u32 {
    (src << 8) | 0xff
}

// The 3x2 saturated-color grid filling the 800x600 frame, matching the TS grade
// scenes' `app.ts` (cellWidth = 800/3, cellHeight = 600/2; shape i at
// (col*cellWidth, row*cellHeight) with rect (0,0,cellWidth,cellHeight)). Scale
// is 1 here (the TS container scale only converts logical→device pixels), so
// these world-space rects are identical to the TS geometry. Colors are bridged
// from the TS-authored values through `ts_shape_color` (see its doc).
const GRADE_GRID_RECTS: &[RectFill] = &[
    axis_rect(ts_shape_color(0xff_30_30_ff), 0.0, 0.0, 800.0 / 3.0, 300.0),
    axis_rect(
        ts_shape_color(0x30_c0_40_ff),
        800.0 / 3.0,
        0.0,
        800.0 / 3.0,
        300.0,
    ),
    axis_rect(
        ts_shape_color(0x30_60_ff_ff),
        1600.0 / 3.0,
        0.0,
        800.0 / 3.0,
        300.0,
    ),
    axis_rect(
        ts_shape_color(0xff_d0_30_ff),
        0.0,
        300.0,
        800.0 / 3.0,
        300.0,
    ),
    axis_rect(
        ts_shape_color(0xff_30_c0_ff),
        800.0 / 3.0,
        300.0,
        800.0 / 3.0,
        300.0,
    ),
    axis_rect(
        ts_shape_color(0x30_d0_d0_ff),
        1600.0 / 3.0,
        300.0,
        800.0 / 3.0,
        300.0,
    ),
];

// The effect-color-grade spread: six 120x160 rects centered at (-60,-80) and
// positioned by shape.x/shape.y over the 800x600 frame. World rect for shape i
// is (x - 60, y - 80, 120, 160) where x = 800*(0.18 + 0.32*(i%3)),
// y = 600*(0.32 + 0.4*floor(i/3)). No rotation, so the rects are axis-aligned
// and reproducible with RectFill. Colors are bridged through `ts_shape_color`.
const COLOR_GRADE_SPREAD_RECTS: &[RectFill] = &[
    axis_rect(
        ts_shape_color(0xff_3b_30_ff),
        800.0 * 0.18 - 60.0,
        600.0 * 0.32 - 80.0,
        120.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0x34_c7_59_ff),
        800.0 * 0.50 - 60.0,
        600.0 * 0.32 - 80.0,
        120.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0x00_7a_ff_ff),
        800.0 * 0.82 - 60.0,
        600.0 * 0.32 - 80.0,
        120.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0xff_cc_00_ff),
        800.0 * 0.18 - 60.0,
        600.0 * 0.72 - 80.0,
        120.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0xaf_52_de_ff),
        800.0 * 0.50 - 60.0,
        600.0 * 0.72 - 80.0,
        120.0,
        160.0,
    ),
    axis_rect(
        ts_shape_color(0xff_95_00_ff),
        800.0 * 0.82 - 60.0,
        600.0 * 0.72 - 80.0,
        120.0,
        160.0,
    ),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn axis_rect_has_identity_local_transform() {
        let rect = axis_rect(0x11_22_33_ff, 4.0, 5.0, 6.0, 7.0);
        assert_eq!(rect.rotation_deg, 0.0);
        assert_eq!(rect.origin_x, 0.0);
        assert_eq!(rect.origin_y, 0.0);
        assert_eq!(local_transform_for_rect(&rect), Matrix::default());
    }

    #[test]
    fn local_transform_for_rect_builds_rotation_about_origin() {
        // 90° rotation places (1,0)→(0,1): a=cos≈0, b=sin≈1, c=-sin≈-1, d=cos≈0,
        // with the origin as the translation.
        let rect = rotated_rect(0x00_00_00_ff, -1.0, -1.0, 2.0, 2.0, 90.0, 100.0, 50.0);
        let m = local_transform_for_rect(&rect);
        assert!(m.a.abs() < 1e-6);
        assert!((m.b - 1.0).abs() < 1e-6);
        assert!((m.c + 1.0).abs() < 1e-6);
        assert!(m.d.abs() < 1e-6);
        assert_eq!(m.tx, 100.0);
        assert_eq!(m.ty, 50.0);
    }

    #[test]
    fn rotated_rect_carries_transform_fields() {
        let rect = rotated_rect(
            0xaa_bb_cc_ff,
            -70.0,
            -70.0,
            140.0,
            140.0,
            12.0,
            224.0,
            180.0,
        );
        assert_eq!(rect.rotation_deg, 12.0);
        assert_eq!(rect.origin_x, 224.0);
        assert_eq!(rect.origin_y, 180.0);
        // A non-identity transform results from a non-zero rotation/origin.
        assert_ne!(local_transform_for_rect(&rect), Matrix::default());
    }

    #[test]
    fn scenes_are_uniquely_named_and_nonempty() {
        let scenes = scenes();
        assert!(!scenes.is_empty());
        let mut names: Vec<&str> = scenes.iter().map(|s| s.name).collect();
        names.sort_unstable();
        let unique = names.len();
        names.dedup();
        assert_eq!(unique, names.len(), "scene names must be unique");
        for scene in &scenes {
            assert!(
                scene.width > 0 && scene.height > 0,
                "{} has zero size",
                scene.name
            );
            assert!(!scene.rects.is_empty(), "{} has no rects", scene.name);
        }
    }

    #[test]
    fn effect_scenes_map_to_ts_baselines_and_carry_effects() {
        for scene in effect_scenes() {
            assert!(
                scene.ts_baseline.is_some(),
                "{} should map to a TS baseline",
                scene.name
            );
            assert!(
                !(scene.effects)().is_empty(),
                "{} should carry an effect chain",
                scene.name
            );
        }
    }
}
