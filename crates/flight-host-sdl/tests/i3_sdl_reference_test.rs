use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Arc, Mutex, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_bitmaptext::{
    BITMAP_TEXT_KIND, BitmapTextGuardState, create_bitmap_text, get_bitmap_text_pages,
    update_bitmap_text,
};
use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_font::allocate_glyph_rasterizer_backend_from_glyph_outline_source;
use flight_font_formats::{
    SfntFontTable, SyntheticFontOptions, SyntheticGlyph, SyntheticGlyphPoint, assemble_sfnt_font,
    compute_sfnt_table_checksum, create_glyph_outline_source_from_open_type_font,
    create_synthetic_font, pack_sfnt_tag, read_sfnt_table_directory,
};
use flight_geometry::create_rectangle;
use flight_glyphatlas::{
    GlyphAtlas, GlyphAtlasOptions, create_glyph_atlas, create_glyph_source_from_glyph_atlas,
    get_glyph_atlas_bitmap,
};
use flight_host_headless::{
    create_bitmap_from_headless_screen_render_target, create_headless_host,
    create_headless_host_render_target, destroy_headless_host, get_headless_host_adapter_backend,
    get_headless_host_adapter_name, get_headless_host_wgpu_device,
};
use flight_host_sdl::*;
use flight_input::PointerType;
use flight_interaction::{
    HitArea, InteractionPointerOptions, InteractionSignalName, connect_interaction_signal,
    create_interaction_manager, dispatch_interaction_pointer_down, dispatch_interaction_pointer_up,
    set_node_hit_area, set_node_hit_test_enabled,
};
use flight_node::{NodeRef, add_node_child, set_node_color_adjustments_tint, set_node_enabled};
use flight_render::{
    RenderProxies2D, RenderTargetClear, RenderTargetDescriptor, destroy_render_state,
    explain_scene_2d_pipeline_coverage, prepare_scene_2d_render, register_node_renderer,
};
use flight_render_gl::{
    GlRenderState, begin_gl_render_pass, create_gl_context, create_gl_context_state,
    create_gl_render_state, create_gl_texture_render_target, destroy_gl_render_state,
    destroy_gl_texture_render_target, end_gl_render_pass, register_gl_bitmap_texture_resolver,
};
use flight_render_wgpu::{
    WgpuRenderState, WgpuRenderTarget, begin_wgpu_render_pass, create_wgpu_render_state,
    destroy_wgpu_screen_render_target, end_wgpu_render_pass, register_wgpu_bitmap_texture_resolver,
};
use flight_scene2d::create_sprite;
use flight_scene2d_gl::{
    GL_BITMAP_TEXT_RENDERER, gl_scene2d_render_preset,
    register_gl_color_adjustment_material_feature, render_gl_scene2d,
};
use flight_scene2d_wgpu::contract::{
    WGPU_BITMAP_TEXT_RENDERER, WGPU_SCENE2D_RENDER_PRESET, enable_wgpu_stroke_path_tessellation,
    register_wgpu_color_adjustment_material_feature, register_wgpu_render_preset,
    render_wgpu_scene2d,
};
use flight_shape::{
    append_shape_begin_fill, append_shape_end_fill, append_shape_line_style, append_shape_line_to,
    append_shape_move_to, append_shape_rectangle, create_shape,
};
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, CreateTextureOptions,
    RenderTargetColorSpace, TextureColorSpace, TextureSourceRef, create_pixel_art_sampler,
    create_texture,
};
use glow::{HasContext, PixelPackData};

const WIDTH: u32 = 480;
const HEIGHT: u32 = 320;
const BACKGROUND: u32 = 0x101827ff;
const FONT_BYTE_LENGTH: usize = 3096;
const FONT_FNV1A32: u32 = 0x29fd2e97;
// Production BitmapText is rasterized independently by glow and wgpu; a bounded per-channel
// allowance covers their edge-alpha rounding while the glyph/geometry anchors below stay strict.
const CHANNEL_TOLERANCE: u8 = 24;
const MAX_MISMATCH_FRACTION: f64 = 0.002;

const FILLED_RECTANGLE: (f64, f64, f64, f64, u32) = (24.0, 24.0, 124.0, 72.0, 0x2878e8ff);
const STROKED_RECTANGLE: (f64, f64, f64, f64, f64, u32) =
    (24.0, 118.0, 124.0, 72.0, 10.0, 0xe23aa8ff);
const SPRITE_COLORS: [u32; 4] = [0xf24848ff, 0xf6cf3aff, 0x45d36bff, 0x8c62eaff];
const TEXT_COLOR: u32 = 0xffc94aff;
const INTERACTION_INITIAL: u32 = 0xed7b2fff;
const INTERACTION_ACTIVE: u32 = 0x25b86aff;
const INTERACTION_STROKE: u32 = 0xffffffff;
const POINTER_MARKER: u32 = 0x42e8ffff;

struct ReferenceScene {
    root: NodeRef,
    interaction: flight_entity::Ref<flight_interaction::InteractionManager>,
    transitions: Arc<Mutex<Vec<&'static str>>>,
    font_bytes: Box<[u8]>,
}

struct FramePair {
    initial: Vec<u8>,
    final_frame: Vec<u8>,
}

struct GlIdentity {
    profile: &'static str,
    renderer: String,
    shading_language_version: String,
    vendor: String,
    version: String,
}

fn clear() -> RenderTargetClear {
    let [red, green, blue, alpha] = BACKGROUND.to_be_bytes();
    return RenderTargetClear {
        color: Some([
            f32::from(red) / 255.0,
            f32::from(green) / 255.0,
            f32::from(blue) / 255.0,
            f32::from(alpha) / 255.0,
        ]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
}

fn reference_scene(probe: Option<&str>) -> ReferenceScene {
    let root_shape = create_shape();
    let root: NodeRef = root_shape;

    let (x, y, width, height, color) = FILLED_RECTANGLE;
    let rectangle = create_shape();
    append_shape_begin_fill(&rectangle, color, Some(1.0));
    append_shape_rectangle(&rectangle, x, y, width, height);
    append_shape_end_fill(&rectangle);
    let rectangle: NodeRef = rectangle;
    add_node_child(&root, &rectangle);

    if probe != Some("missing-shape") {
        let triangle_x = if probe == Some("triangle-shift-1") {
            1.0
        } else {
            0.0
        };
        let triangle = create_shape();
        append_shape_begin_fill(&triangle, 0x18c9c3ff, Some(1.0));
        append_shape_move_to(&triangle, 170.0 + triangle_x, 190.0);
        append_shape_line_to(&triangle, 222.0 + triangle_x, 112.0);
        append_shape_line_to(&triangle, 282.0 + triangle_x, 190.0);
        append_shape_line_to(&triangle, 170.0 + triangle_x, 190.0);
        append_shape_end_fill(&triangle);
        let triangle: NodeRef = triangle;
        add_node_child(&root, &triangle);
    }

    let (x, y, width, height, thickness, color) = STROKED_RECTANGLE;
    let stroked = create_shape();
    append_shape_line_style(
        &stroked,
        Some(thickness),
        color,
        Some(1.0),
        None,
        None,
        None,
        None,
        None,
    );
    append_shape_rectangle(&stroked, x, y, width, height);
    let stroked: NodeRef = stroked;
    add_node_child(&root, &stroked);

    if probe != Some("missing-sprite") {
        add_node_child(&root, &quadrant_sprite(probe == Some("sprite-shift-1")));
    }

    let (font_bytes, glyph_source, glyph_atlas) = reference_font_fixture();
    assert_eq!(font_bytes.len(), FONT_BYTE_LENGTH, "pinned SFNT length");
    assert_eq!(fnv1a32(&font_bytes), FONT_FNV1A32, "pinned SFNT bytes");
    if probe != Some("missing-text") {
        let text = create_bitmap_text(Some(glyph_source));
        {
            let mut text = text.write().unwrap();
            text.data.text = match probe {
                Some("text-two-glyphs" | "ink-floor-one") => "FL".to_string(),
                Some("glyph-drop") => "FLIGH TS".to_string(),
                _ => "FLIGHT TS".to_string(),
            };
            update_bitmap_text(&mut text, &BitmapTextGuardState::default());
            let expected_glyphs = text.data.text.chars().filter(|value| *value != ' ').count();
            assert_eq!(
                get_bitmap_text_pages(&text)
                    .iter()
                    .map(|page| page.instance_count)
                    .sum::<usize>(),
                expected_glyphs,
                "production BitmapText layout must retain every visible glyph"
            );
            let (min_x, min_y) = get_bitmap_text_pages(&text)
                .iter()
                .flat_map(|page| page.transforms[..page.instance_count * 2].chunks_exact(2))
                .fold((f32::INFINITY, f32::INFINITY), |(min_x, min_y), value| {
                    (min_x.min(value[0]), min_y.min(value[1]))
                });
            assert!(
                min_x.is_finite() && min_y.is_finite(),
                "visible glyph bounds"
            );
            // BitmapText positions quads at glyph bearings while RichText positions a CSS line box.
            // Anchor the first native ink pixel to the same (26, 221) contract the browser paths use.
            text.x = f64::from(25.0 - min_x);
            text.y = f64::from(220.0 - min_y);
            let atlas_ink = get_glyph_atlas_bitmap(&glyph_atlas)
                .read()
                .unwrap()
                .data
                .chunks_exact(4)
                .filter(|pixel| pixel[3] != 0)
                .count();
            assert!(
                atlas_ink >= expected_glyphs * 100,
                "generated glyph atlas ink {atlas_ink} is insufficient for {expected_glyphs} glyphs"
            );
        }
        let text: NodeRef = text;
        set_node_color_adjustments_tint(&text, TEXT_COLOR);
        add_node_child(&root, &text);
    }

    let initial = control(INTERACTION_INITIAL, false);
    let active = control(INTERACTION_ACTIVE, true);
    set_node_enabled(&active, false);
    add_node_child(&root, &initial);
    add_node_child(&root, &active);

    set_node_hit_test_enabled(&initial, true);
    set_node_hit_area(
        &initial,
        Some(HitArea::Rect(create_rectangle(0.0, 0.0, 142.0, 80.0))),
    );
    let interaction = create_interaction_manager(root.clone(), None);
    let transitions = Arc::new(Mutex::new(vec!["initial"]));
    let down_transitions = transitions.clone();
    connect_interaction_signal(
        &interaction,
        &initial,
        InteractionSignalName::OnPointerDown,
        Arc::new(move |_| down_transitions.lock().unwrap().push("pointer-down")),
        None,
    )
    .expect("pointer-down registration");
    let click_transitions = transitions.clone();
    let initial_for_click = initial.clone();
    let active_for_click = active.clone();
    connect_interaction_signal(
        &interaction,
        &initial,
        InteractionSignalName::OnClick,
        Arc::new(move |_| {
            set_node_enabled(&initial_for_click, false);
            set_node_enabled(&active_for_click, true);
            click_transitions.lock().unwrap().push("activated");
        }),
        None,
    )
    .expect("click registration");

    return ReferenceScene {
        root,
        interaction,
        transitions,
        font_bytes,
    };
}

fn activate_scene(scene: &ReferenceScene, probe: Option<&str>) {
    if probe == Some("missing-pointer") {
        return;
    }
    let down = InteractionPointerOptions {
        alt_key: None,
        buttons: None,
        ctrl_key: None,
        meta_key: None,
        pointer_id: Some(7),
        pointer_type: Some(PointerType::Mouse),
        shift_key: None,
        time_stamp: Some(1_000.0),
    };
    dispatch_interaction_pointer_down(&scene.interaction, 416.0, 248.0, 0, Some(&down));
    let up = InteractionPointerOptions {
        time_stamp: Some(1_016.0),
        ..down
    };
    dispatch_interaction_pointer_up(
        &scene.interaction,
        416.0,
        248.0,
        0,
        Some(1_016.0),
        Some(&up),
    );
}

fn quadrant_sprite(shift_one_pixel: bool) -> NodeRef {
    let mut bitmap = create_bitmap(64, 64, None);
    for y in 0..64_u32 {
        for x in 0..64_u32 {
            let quadrant = usize::from(y >= 32) * 2 + usize::from(x >= 32);
            let offset = ((y * 64 + x) * 4) as usize;
            bitmap.data[offset..offset + 4].copy_from_slice(&SPRITE_COLORS[quadrant].to_be_bytes());
        }
    }
    return bitmap_sprite(bitmap, if shift_one_pixel { 203.0 } else { 202.0 }, 24.0);
}

fn bitmap_sprite(bitmap: Bitmap, x: f64, y: f64) -> NodeRef {
    let source: TextureSourceRef = Arc::new(RwLock::new(bitmap));
    let texture = create_texture(Some(&CreateTextureOptions::Texture2D(
        CreateTexture2DOptions {
            common: CreateTextureCommonOptions {
                color_space: Some(TextureColorSpace::Srgb),
                sampler: Some(create_pixel_art_sampler()),
                ..Default::default()
            },
            source: Some(source),
        },
    )));
    let sprite = create_sprite();
    {
        let mut sprite = sprite.write().unwrap();
        sprite.data.texture = Some(Arc::new(RwLock::new(texture)));
        sprite.x = x;
        sprite.y = y;
    }
    return sprite;
}

fn control(color: u32, marker: bool) -> NodeRef {
    let control = create_shape();
    {
        let mut control = control.write().unwrap();
        control.x = 310.0;
        control.y = 208.0;
    }
    append_shape_line_style(
        &control,
        Some(4.0),
        INTERACTION_STROKE,
        Some(1.0),
        None,
        None,
        None,
        None,
        None,
    );
    append_shape_begin_fill(&control, color, Some(1.0));
    append_shape_rectangle(&control, 0.0, 0.0, 142.0, 80.0);
    append_shape_end_fill(&control);
    if marker {
        append_shape_begin_fill(&control, POINTER_MARKER, Some(1.0));
        append_shape_rectangle(&control, 100.0, 34.0, 12.0, 12.0);
        append_shape_end_fill(&control);
    }
    return control;
}

fn reference_font_fixture() -> (
    Box<[u8]>,
    flight_entity::Ref<flight_glyphatlas::GlyphSource>,
    flight_entity::Ref<GlyphAtlas>,
) {
    const PATTERNS: [(&str, [&str; 7]); 7] = [
        (
            "F",
            [
                "11111", "10000", "10000", "11110", "10000", "10000", "10000",
            ],
        ),
        (
            "L",
            [
                "10000", "10000", "10000", "10000", "10000", "10000", "11111",
            ],
        ),
        (
            "I",
            [
                "11111", "00100", "00100", "00100", "00100", "00100", "11111",
            ],
        ),
        (
            "G",
            [
                "01110", "10001", "10000", "10111", "10001", "10001", "01110",
            ],
        ),
        (
            "H",
            [
                "10001", "10001", "10001", "11111", "10001", "10001", "10001",
            ],
        ),
        (
            "T",
            [
                "11111", "00100", "00100", "00100", "00100", "00100", "00100",
            ],
        ),
        (
            "S",
            [
                "01111", "10000", "10000", "01110", "00001", "00001", "11110",
            ],
        ),
    ];
    let mut glyphs = vec![empty_glyph(), empty_glyph()];
    let mut codepoints = vec![(32.0, 1.0)];
    for (letter, pattern) in PATTERNS {
        codepoints.push((letter.as_bytes()[0] as f32, glyphs.len() as f32));
        glyphs.push(pattern_glyph(&pattern));
    }
    let glyph_count = glyphs.len();
    let minimal = create_synthetic_font(Some(&SyntheticFontOptions {
        advances: Some(vec![24.0; glyphs.len()]),
        codepoints: Some(codepoints),
        glyphs: Some(glyphs),
        units_per_em: Some(28.0),
        ..Default::default()
    }));
    let bytes = complete_browser_font(&minimal, glyph_count);
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes.clone());
    let view = create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array)
        .expect("generated SFNT view");
    let source =
        create_glyph_outline_source_from_open_type_font(&view, &SDK_HOST_DECOMPRESS_DEFLATE, None)
            .expect("generated SFNT parser");
    let rasterizer = allocate_glyph_rasterizer_backend_from_glyph_outline_source(source);
    let atlas = create_glyph_atlas(&GlyphAtlasOptions {
        font_family: "FlightReferenceSynthetic".to_string(),
        font_size: 28.0,
        font_style: None,
        font_weight: None,
        height: 64,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: Some(1),
        rasterizer_backend: rasterizer,
        width: 256,
    });
    return (bytes, create_glyph_source_from_glyph_atlas(&atlas), atlas);
}

fn complete_browser_font(minimal: &[u8], glyph_count: usize) -> Box<[u8]> {
    let directory = read_sfnt_table_directory(minimal).expect("generated SFNT directory");
    let mut tables = BTreeMap::<String, Vec<u8>>::new();
    for (tag, range) in directory.tables {
        tables.insert(
            tag,
            minimal[range.offset..range.offset + range.length].to_vec(),
        );
    }

    let head = tables.get_mut("head").unwrap();
    put_u32(head, 4, 0x00010000);
    put_u32(head, 12, 0x5f0f3cf5);
    put_u16(head, 16, 3);
    put_i16(head, 36, 0);
    put_i16(head, 38, 0);
    put_i16(head, 40, 19);
    put_i16(head, 42, 27);
    put_u16(head, 46, 8);
    put_i16(head, 48, 2);

    let hhea = tables.get_mut("hhea").unwrap();
    put_u32(hhea, 0, 0x00010000);
    put_i16(hhea, 4, 28);
    put_i16(hhea, 6, 0);
    put_i16(hhea, 8, 0);
    put_u16(hhea, 10, 24);
    put_i16(hhea, 12, 0);
    put_i16(hhea, 14, 5);
    put_i16(hhea, 16, 19);
    put_i16(hhea, 18, 1);

    let cmap = tables.get_mut("cmap").unwrap();
    let format4_offset = read_u32(cmap, 8) as usize;
    let segment_count = usize::from(read_u16(cmap, format4_offset + 6)) / 2;
    let segment_power_of_two = 1usize << segment_count.ilog2();
    put_u16(cmap, format4_offset + 8, (segment_power_of_two * 2) as u16);
    put_u16(
        cmap,
        format4_offset + 10,
        segment_power_of_two.ilog2() as u16,
    );
    put_u16(
        cmap,
        format4_offset + 12,
        (segment_count * 2 - segment_power_of_two * 2) as u16,
    );

    let mut maxp = vec![0; 32];
    put_u32(&mut maxp, 0, 0x00010000);
    put_u16(&mut maxp, 4, glyph_count as u16);
    put_u16(&mut maxp, 6, 128);
    put_u16(&mut maxp, 8, 32);
    put_u16(&mut maxp, 14, 1);
    tables.insert("maxp".to_string(), maxp);

    let loca = tables.get("loca").unwrap().clone();
    let glyf = tables.get_mut("glyf").unwrap();
    for glyph in 0..glyph_count {
        let start = read_u32(&loca, glyph * 4) as usize;
        let end = read_u32(&loca, (glyph + 1) * 4) as usize;
        if start == end {
            continue;
        }
        put_i16(glyf, start + 2, 0);
        put_i16(glyf, start + 4, 0);
        put_i16(glyf, start + 6, 19);
        put_i16(glyf, start + 8, 27);
    }
    tables.insert("name".to_string(), encode_reference_name_table());
    tables.insert("OS/2".to_string(), encode_reference_os2_table());
    let mut post = vec![0; 32];
    put_u32(&mut post, 0, 0x00030000);
    tables.insert("post".to_string(), post);

    let sfnt_tables = tables
        .into_iter()
        .map(|(tag, data)| SfntFontTable {
            data: data.into_boxed_slice(),
            tag: pack_sfnt_tag(&tag),
        })
        .collect::<Vec<_>>();
    let mut font = assemble_sfnt_font(0x00010000, &sfnt_tables);
    let table_count = sfnt_tables.len();
    let maximum_power_of_two = 1usize << table_count.ilog2();
    put_u16(&mut font, 6, (maximum_power_of_two * 16) as u16);
    put_u16(&mut font, 8, maximum_power_of_two.ilog2() as u16);
    put_u16(
        &mut font,
        10,
        (table_count * 16 - maximum_power_of_two * 16) as u16,
    );
    let completed = read_sfnt_table_directory(&font).expect("completed SFNT directory");
    let head_offset = completed.tables.get("head").unwrap().offset;
    put_u32(&mut font, head_offset + 8, 0);
    let adjustment = 0xb1b0afba_u32.wrapping_sub(compute_sfnt_table_checksum(&font, None));
    put_u32(&mut font, head_offset + 8, adjustment);
    return font;
}

fn encode_reference_name_table() -> Vec<u8> {
    let names = [
        (1_u16, "FlightReferenceSynthetic"),
        (2, "Regular"),
        (4, "FlightReferenceSynthetic"),
        (6, "FlightReferenceSynthetic-Regular"),
    ];
    let encoded = names
        .iter()
        .map(|(id, value)| {
            let bytes = value
                .encode_utf16()
                .flat_map(u16::to_be_bytes)
                .collect::<Vec<_>>();
            return (*id, bytes);
        })
        .collect::<Vec<_>>();
    let string_offset = 6 + encoded.len() * 12;
    let mut out =
        vec![0; string_offset + encoded.iter().map(|(_, bytes)| bytes.len()).sum::<usize>()];
    put_u16(&mut out, 2, encoded.len() as u16);
    put_u16(&mut out, 4, string_offset as u16);
    let mut offset = 0;
    for (index, (id, bytes)) in encoded.iter().enumerate() {
        let record = 6 + index * 12;
        put_u16(&mut out, record, 3);
        put_u16(&mut out, record + 2, 1);
        put_u16(&mut out, record + 4, 0x0409);
        put_u16(&mut out, record + 6, *id);
        put_u16(&mut out, record + 8, bytes.len() as u16);
        put_u16(&mut out, record + 10, offset as u16);
        out[string_offset + offset..string_offset + offset + bytes.len()].copy_from_slice(bytes);
        offset += bytes.len();
    }
    return out;
}

fn encode_reference_os2_table() -> Vec<u8> {
    let mut out = vec![0; 78];
    put_i16(&mut out, 2, 24);
    put_u16(&mut out, 4, 400);
    put_u16(&mut out, 6, 5);
    out[58..62].copy_from_slice(b"FLIT");
    put_u16(&mut out, 62, 0x0040);
    put_u16(&mut out, 64, 0x0020);
    put_u16(&mut out, 66, 0x0054);
    put_i16(&mut out, 68, 28);
    put_i16(&mut out, 70, 0);
    put_i16(&mut out, 72, 0);
    put_u16(&mut out, 74, 28);
    put_u16(&mut out, 76, 0);
    return out;
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    return u16::from_be_bytes(bytes[offset..offset + 2].try_into().unwrap());
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    return u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap());
}

fn put_i16(bytes: &mut [u8], offset: usize, value: i16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_be_bytes());
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_be_bytes());
}

fn empty_glyph() -> SyntheticGlyph {
    return SyntheticGlyph {
        end_points: Vec::new(),
        points: Vec::new(),
    };
}

fn pattern_glyph(pattern: &[&str; 7]) -> SyntheticGlyph {
    let mut points = Vec::new();
    let mut end_points = Vec::new();
    for (row, line) in pattern.iter().enumerate() {
        for (column, value) in line.as_bytes().iter().enumerate() {
            if *value != b'1' {
                continue;
            }
            let x = (column * 4) as f32;
            let y = (row * 4) as f32;
            points.extend([
                SyntheticGlyphPoint {
                    x,
                    y,
                    on_curve: true,
                },
                SyntheticGlyphPoint {
                    x: x + 3.0,
                    y,
                    on_curve: true,
                },
                SyntheticGlyphPoint {
                    x: x + 3.0,
                    y: y + 3.0,
                    on_curve: true,
                },
                SyntheticGlyphPoint {
                    x,
                    y: y + 3.0,
                    on_curve: true,
                },
            ]);
            end_points.push((points.len() - 1) as f32);
        }
    }
    return SyntheticGlyph { end_points, points };
}

fn render_gl_reference(probe: Option<&str>) -> (FramePair, ReferenceScene, GlIdentity) {
    let creator_thread = std::thread::current().id();
    let host = create_sdl_host(&create_sdl_host_options(
        "Flight GL reference",
        f64::from(WIDTH),
        f64::from(HEIGHT),
        false,
        SdlHostRenderBackend::Gl,
    ))
    .unwrap_or_else(|failure| panic!("{failure}"));
    assert_eq!(
        creator_thread,
        std::thread::current().id(),
        "GL stays on creator thread"
    );
    make_sdl_host_gl_context_current(&host).expect("make GL current");
    let surface = create_sdl_host_surface(&host);
    let host_context = (get_sdl_host_gl_capability(&host)
        .expect("GL capability")
        .acquire)(&surface, None)
    .expect("GL token");
    // SAFETY: the SDL host made this exact context current on this creator thread.
    let gl = unsafe { create_gl_context(&host_context) }.expect("create glow context");
    // SAFETY: the SDL host made this context current on this thread above.
    let identity = unsafe {
        let profile_mask = gl.get_parameter_i32(glow::CONTEXT_PROFILE_MASK);
        GlIdentity {
            profile: if profile_mask & glow::CONTEXT_CORE_PROFILE_BIT as i32 != 0 {
                "core"
            } else {
                "non-core"
            },
            renderer: gl.get_parameter_string(glow::RENDERER),
            shading_language_version: gl.get_parameter_string(glow::SHADING_LANGUAGE_VERSION),
            vendor: gl.get_parameter_string(glow::VENDOR),
            version: gl.get_parameter_string(glow::VERSION),
        }
    };
    // SAFETY: desktop core GL requires one VAO to be bound before Flight's vertex draws.
    let vertex_array = unsafe {
        let vertex_array = gl
            .create_vertex_array()
            .expect("create core GL vertex array");
        gl.bind_vertex_array(Some(vertex_array));
        vertex_array
    };
    let context_state = create_gl_context_state(gl.clone()).expect("create GL context state");
    let options = gl_scene2d_render_preset();
    let mut state = create_gl_render_state(context_state, Some(&options));
    register_gl_color_adjustment_material_feature(&mut state);
    register_node_renderer(
        &mut state,
        BITMAP_TEXT_KIND.to_string(),
        &GL_BITMAP_TEXT_RENDERER,
    );
    register_gl_bitmap_texture_resolver(&mut state);
    let descriptor = RenderTargetDescriptor {
        width: f64::from(WIDTH),
        height: f64::from(HEIGHT),
        format: None,
        color_attachments: None,
        color_formats: None,
        sample_count: Some(1.0),
        depth: None,
        color_space: Some(RenderTargetColorSpace::Srgb),
    };
    let mut target = create_gl_texture_render_target(&state, &descriptor, None)
        .expect("allocate GL reference target")
        .expect("supported GL reference target");
    let scene = reference_scene(probe);
    assert_registry(&state, &scene.root, "gl");
    let mut proxies = RenderProxies2D::<GlRenderState>::default();
    render_gl_frame(&mut state, &mut proxies, &target, &scene.root);
    let initial = read_gl_frame(&gl, Some(target.framebuffer));
    activate_scene(&scene, probe);
    render_gl_frame(&mut state, &mut proxies, &target, &scene.root);
    let final_frame = read_gl_frame(&gl, Some(target.framebuffer));
    present_sdl_host_gl(&host).expect("swap GL reference");

    destroy_gl_render_state(&mut state, &mut proxies);
    destroy_gl_texture_render_target(&mut target);
    drop(target);
    drop(state);
    // SAFETY: the VAO belongs to this still-current host context and is no longer referenced.
    unsafe { gl.delete_vertex_array(vertex_array) };
    drop(gl);
    drop(host_context);
    destroy_sdl_host(host).expect("destroy GL reference host");
    return (
        FramePair {
            initial,
            final_frame,
        },
        scene,
        identity,
    );
}

fn render_gl_frame(
    state: &mut GlRenderState,
    proxies: &mut RenderProxies2D<GlRenderState>,
    target: &flight_render_gl::GlTextureRenderTarget,
    root: &NodeRef,
) {
    prepare_scene_2d_render(state, proxies, root);
    let pass = begin_gl_render_pass(state, target, Some(&clear()), None).expect("begin GL pass");
    render_gl_scene2d(state, proxies, &pass, root, None);
    end_gl_render_pass(state, &pass).expect("end GL pass");
}

fn read_gl_frame(gl: &glow::Context, framebuffer: Option<glow::NativeFramebuffer>) -> Vec<u8> {
    let mut bottom_up = vec![0_u8; (WIDTH * HEIGHT * 4) as usize];
    // SAFETY: the target belongs to the current SDL GL context and output is a valid RGBA slice.
    unsafe {
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, framebuffer);
        gl.read_buffer(glow::COLOR_ATTACHMENT0);
        gl.read_pixels(
            0,
            0,
            WIDTH as i32,
            HEIGHT as i32,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelPackData::Slice(Some(&mut bottom_up)),
        );
        gl.finish();
        gl.bind_framebuffer(glow::DRAW_FRAMEBUFFER, None);
    }
    let mut top_down = vec![0_u8; bottom_up.len()];
    let row_bytes = WIDTH as usize * 4;
    for row in 0..HEIGHT as usize {
        let source = (HEIGHT as usize - 1 - row) * row_bytes;
        let destination = row * row_bytes;
        top_down[destination..destination + row_bytes]
            .copy_from_slice(&bottom_up[source..source + row_bytes]);
    }
    return top_down;
}

fn render_wgpu_reference(probe: Option<&str>) -> (FramePair, ReferenceScene, String, String) {
    let mut host = create_headless_host(None).expect(
        "no headless wgpu adapter; install/enable Mesa lavapipe before running the reference capture",
    );
    let adapter_name = get_headless_host_adapter_name(&host).to_string();
    let adapter_backend = get_headless_host_adapter_backend(&host).to_string();
    let mut state = create_wgpu_render_state(
        get_headless_host_wgpu_device(&host).expect("headless wgpu device"),
        None,
    );
    if probe != Some("wrong-preset") {
        register_wgpu_render_preset(&mut state, &WGPU_SCENE2D_RENDER_PRESET);
        register_wgpu_color_adjustment_material_feature(&mut state);
        enable_wgpu_stroke_path_tessellation(&mut state);
    }
    register_node_renderer(
        &mut state,
        BITMAP_TEXT_KIND.to_string(),
        &WGPU_BITMAP_TEXT_RENDERER,
    );
    register_wgpu_bitmap_texture_resolver(&mut state);
    let target =
        create_headless_host_render_target(&host, WIDTH, HEIGHT).expect("headless capture target");
    let WgpuRenderTarget::Screen(screen) = &target else {
        panic!("headless host must produce a screen target");
    };
    let screen = screen.clone();
    let scene = reference_scene(probe);
    assert_registry(&state, &scene.root, "wgpu");
    let mut proxies = RenderProxies2D::<WgpuRenderState>::default();
    render_wgpu_frame(&mut state, &mut proxies, &target, &scene.root);
    let initial = create_bitmap_from_headless_screen_render_target(&screen, Some(10_000))
        .expect("bounded initial wgpu capture")
        .data
        .to_vec();
    activate_scene(&scene, probe);
    render_wgpu_frame(&mut state, &mut proxies, &target, &scene.root);
    let final_frame = create_bitmap_from_headless_screen_render_target(&screen, Some(10_000))
        .expect("bounded final wgpu capture")
        .data
        .to_vec();

    destroy_render_state(&mut state, &mut proxies);
    drop(target);
    destroy_wgpu_screen_render_target(&mut screen.write().unwrap());
    drop(screen);
    drop(state);
    destroy_headless_host(&mut host);
    return (
        FramePair {
            initial,
            final_frame,
        },
        scene,
        adapter_name,
        adapter_backend,
    );
}

fn render_wgpu_frame(
    state: &mut WgpuRenderState,
    proxies: &mut RenderProxies2D<WgpuRenderState>,
    target: &WgpuRenderTarget,
    root: &NodeRef,
) {
    prepare_scene_2d_render(state, proxies, root);
    let mut pass = begin_wgpu_render_pass(state, target, Some(&clear()));
    render_wgpu_scene2d(&mut pass, proxies, root, None);
    end_wgpu_render_pass(pass);
}

fn assert_registry<S: flight_render::RenderState>(state: &S, root: &NodeRef, backend: &str) {
    let coverage = explain_scene_2d_pipeline_coverage(state, root);
    assert!(
        coverage.uncovered_kinds.is_empty(),
        "{backend} registry misses: {:?}",
        coverage.uncovered_kinds
    );
    assert_eq!(
        coverage.used_kinds,
        [
            "BitmapText".to_string(),
            "Shape".to_string(),
            "Sprite".to_string()
        ]
    );
}

fn assert_scene(pair: &FramePair, scene: &ReferenceScene, backend: &str, minimum_text_ink: usize) {
    assert_eq!(pair.initial.len(), (WIDTH * HEIGHT * 4) as usize);
    assert_eq!(pair.final_frame.len(), pair.initial.len());
    assert_color(
        &pair.initial,
        380,
        240,
        INTERACTION_INITIAL,
        12,
        &format!("{backend} initial control"),
    );
    assert_color(
        &pair.initial,
        416,
        248,
        INTERACTION_INITIAL,
        12,
        &format!("{backend} initial marker absence"),
    );

    let frame = &pair.final_frame;
    assert_color(
        frame,
        470,
        310,
        BACKGROUND,
        8,
        &format!("{backend} background"),
    );
    assert_color(
        frame,
        40,
        40,
        FILLED_RECTANGLE.4,
        8,
        &format!("{backend} filled rectangle"),
    );
    assert_color(
        frame,
        222,
        160,
        0x18c9c3ff,
        10,
        &format!("{backend} triangle"),
    );
    assert_color(
        frame,
        170,
        189,
        0x18c9c3ff,
        10,
        &format!("{backend} triangle left anchor"),
    );
    assert_color(
        frame,
        24,
        150,
        STROKED_RECTANGLE.5,
        12,
        &format!("{backend} stroke"),
    );
    assert_color(
        frame,
        86,
        154,
        BACKGROUND,
        8,
        &format!("{backend} hollow center"),
    );
    for (index, (x, y)) in [(218, 40), (250, 40), (218, 72), (250, 72)]
        .into_iter()
        .enumerate()
    {
        assert_color(
            frame,
            x,
            y,
            SPRITE_COLORS[index],
            4,
            &format!("{backend} sprite {index}"),
        );
    }
    for (index, (x, y, color)) in [
        (202, 24, SPRITE_COLORS[0]),
        (265, 24, SPRITE_COLORS[1]),
        (202, 87, SPRITE_COLORS[2]),
        (265, 87, SPRITE_COLORS[3]),
    ]
    .into_iter()
    .enumerate()
    {
        assert_color(
            frame,
            x,
            y,
            color,
            4,
            &format!("{backend} sprite extent anchor {index}"),
        );
    }
    for (index, x) in [24, 48, 72, 96, 120, 144, 192, 216].into_iter().enumerate() {
        let glyph_ink = count_color(frame, x, 218, 24, 70, TEXT_COLOR, 16);
        assert!(
            glyph_ink >= 50,
            "{backend} text glyph {index} ink {glyph_ink} < 50"
        );
    }
    let text_ink = count_color(frame, 24, 218, 252, 70, TEXT_COLOR, 16);
    assert!(
        text_ink >= minimum_text_ink,
        "{backend} text ink {text_ink} < {minimum_text_ink}"
    );
    assert_color(
        frame,
        310,
        248,
        INTERACTION_STROKE,
        12,
        &format!("{backend} active stroke"),
    );
    assert_color(
        frame,
        380,
        240,
        INTERACTION_ACTIVE,
        12,
        &format!("{backend} active control"),
    );
    assert_color(
        frame,
        416,
        248,
        POINTER_MARKER,
        10,
        &format!("{backend} pointer marker"),
    );
    assert_eq!(
        *scene.transitions.lock().unwrap(),
        ["initial", "pointer-down", "activated"],
        "{backend} interaction transitions"
    );
    assert_eq!(scene.font_bytes.len(), FONT_BYTE_LENGTH);
    assert_eq!(fnv1a32(&scene.font_bytes), FONT_FNV1A32);
}

fn assert_color(frame: &[u8], x: u32, y: u32, expected: u32, tolerance: u8, label: &str) {
    let offset = ((y * WIDTH + x) * 4) as usize;
    let expected = expected.to_be_bytes();
    let actual = &frame[offset..offset + 4];
    let delta = actual
        .iter()
        .zip(expected)
        .map(|(left, right)| left.abs_diff(right))
        .max()
        .unwrap();
    assert!(
        delta <= tolerance,
        "{label}: got {actual:?}, expected {expected:?} ±{tolerance}"
    );
}

fn count_color(
    frame: &[u8],
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    expected: u32,
    tolerance: u8,
) -> usize {
    let expected = expected.to_be_bytes();
    let mut count = 0;
    for row in y..y + height {
        for column in x..x + width {
            let offset = ((row * WIDTH + column) * 4) as usize;
            if frame[offset..offset + 4]
                .iter()
                .zip(expected)
                .all(|(left, right)| left.abs_diff(right) <= tolerance)
            {
                count += 1;
            }
        }
    }
    return count;
}

fn assert_parity(canvas_name: &str, left: &[u8], right: &[u8]) {
    assert_parity_with_policy(
        canvas_name,
        left,
        right,
        CHANNEL_TOLERANCE,
        MAX_MISMATCH_FRACTION,
    );
}

fn assert_parity_with_policy(
    canvas_name: &str,
    left: &[u8],
    right: &[u8],
    channel_tolerance: u8,
    max_mismatch_fraction: f64,
) {
    let mut mismatched = 0_usize;
    let mut max_delta = 0_u8;
    for (left, right) in left.as_chunks::<4>().0.iter().zip(right.as_chunks::<4>().0) {
        let delta = left
            .iter()
            .zip(right)
            .map(|(a, b)| a.abs_diff(*b))
            .max()
            .unwrap();
        max_delta = max_delta.max(delta);
        if delta > channel_tolerance {
            mismatched += 1;
        }
    }
    let total = left.len() / 4;
    let fraction = mismatched as f64 / total as f64;
    assert!(
        fraction <= max_mismatch_fraction,
        "{canvas_name}: {mismatched}/{total} pixels differ above channel tolerance {channel_tolerance} (fraction {fraction}, max delta {max_delta})"
    );
}

fn fnv1a32(bytes: &[u8]) -> u32 {
    let mut hash = 0x811c9dc5_u32;
    for byte in bytes {
        hash = (hash ^ u32::from(*byte)).wrapping_mul(0x01000193);
    }
    return hash;
}

fn write_evidence(
    directory: &Path,
    gl: &FramePair,
    wgpu: &FramePair,
    font: &[u8],
    adapter_name: &str,
    adapter_backend: &str,
    gl_identity: &GlIdentity,
) {
    std::fs::create_dir_all(directory).expect("create native evidence directory");
    for (name, bytes) in [
        ("rust-gl-initial.rgba", &gl.initial),
        ("rust-gl-final.rgba", &gl.final_frame),
        ("rust-wgpu-initial.rgba", &wgpu.initial),
        ("rust-wgpu-final.rgba", &wgpu.final_frame),
    ] {
        std::fs::write(directory.join(name), bytes).expect("write native capture");
    }
    std::fs::write(directory.join("reference-font.sfnt"), font).expect("write font fixture");
    std::fs::write(directory.join("rust-gl.logs.jsonl"), []).expect("write GL log evidence");
    std::fs::write(directory.join("rust-wgpu.logs.jsonl"), []).expect("write wgpu log evidence");
    let status = format!(
        "{{\n  \"state\": \"ready\",\n  \"width\": {WIDTH},\n  \"height\": {HEIGHT},\n  \"devicePixelRatio\": 1,\n  \"colorSpace\": \"srgb\",\n  \"fontBytes\": {},\n  \"fontFnv1a32\": \"{:08x}\",\n  \"glVersion\": {:?},\n  \"glShadingLanguageVersion\": {:?},\n  \"glProfile\": {:?},\n  \"glVendor\": {:?},\n  \"glRenderer\": {:?},\n  \"wgpuAdapter\": {:?},\n  \"wgpuBackend\": {:?}\n}}\n",
        font.len(),
        fnv1a32(font),
        gl_identity.version,
        gl_identity.shading_language_version,
        gl_identity.profile,
        gl_identity.vendor,
        gl_identity.renderer,
        adapter_name,
        adapter_backend,
    );
    std::fs::write(directory.join("rust-status.json"), status).expect("write native status");
}

fn main() {
    let probe = std::env::var("FLIGHT_REFERENCE_PROBE").ok();
    let gl_probe = if matches!(
        probe.as_deref(),
        Some("tolerance-weakening" | "ink-floor-one")
    ) {
        None
    } else {
        probe.as_deref()
    };
    let wgpu_probe = if probe.as_deref() == Some("tolerance-weakening") {
        Some("text-two-glyphs")
    } else if probe.as_deref() == Some("ink-floor-one") {
        Some("ink-floor-one")
    } else {
        probe.as_deref()
    };
    let (gl, gl_scene, gl_identity) = render_gl_reference(gl_probe);
    let (mut wgpu, wgpu_scene, adapter_name, adapter_backend) = render_wgpu_reference(wgpu_probe);
    if probe.as_deref() == Some("blank") {
        wgpu.final_frame.fill(0);
    }
    if let Some(directory) = std::env::var_os("FLIGHT_REFERENCE_CAPTURE_DIR") {
        write_evidence(
            Path::new(&directory),
            &gl,
            &wgpu,
            &gl_scene.font_bytes,
            &adapter_name,
            &adapter_backend,
            &gl_identity,
        );
    }
    assert_gl_identity(&gl_identity);
    assert_wgpu_identity(
        &adapter_name,
        &adapter_backend,
        if probe.as_deref() == Some("wrong-backend") {
            "rust-gl"
        } else {
            "rust-wgpu"
        },
    );
    if probe.as_deref() == Some("tolerance-weakening") {
        assert_parity_with_policy(
            "weakened native GL/wgpu parity",
            &gl.final_frame,
            &wgpu.final_frame,
            u8::MAX,
            1.0,
        );
        println!(
            "PROBE weakened parity policy accepted the partial text; structural oracle follows"
        );
    }
    assert_scene(&gl, &gl_scene, "rust-gl", 650);
    assert_scene(
        &wgpu,
        &wgpu_scene,
        "rust-wgpu",
        if probe.as_deref() == Some("ink-floor-one") {
            1
        } else {
            650
        },
    );
    assert_parity("native GL/wgpu parity", &gl.final_frame, &wgpu.final_frame);
    println!(
        "{{\"state\":\"ready\",\"gl\":\"sdl-current-thread\",\"wgpu\":\"headless-{adapter_backend}\",\"fontFnv1a32\":\"{:08x}\",\"channelTolerance\":{CHANNEL_TOLERANCE},\"maxMismatchFraction\":{MAX_MISMATCH_FRACTION}}}",
        fnv1a32(&gl_scene.font_bytes)
    );
}

fn assert_gl_identity(identity: &GlIdentity) {
    assert_eq!(
        identity.profile, "core",
        "reference GL profile must be core"
    );
    assert!(
        identity.version.contains("4.5"),
        "reference GL version is not pinned Mesa 4.5: {}",
        identity.version
    );
    assert!(
        identity.renderer.to_lowercase().contains("llvmpipe"),
        "reference GL renderer is not pinned llvmpipe: {}",
        identity.renderer
    );
    assert!(
        identity.vendor.to_lowercase().contains("mesa"),
        "reference GL vendor is not pinned Mesa: {}",
        identity.vendor
    );
}

fn assert_wgpu_identity(adapter_name: &str, adapter_backend: &str, expected_path: &str) {
    let backend = adapter_backend.to_lowercase();
    let observed_path = if backend == "vulkan" {
        "rust-wgpu".to_string()
    } else {
        format!("rust-wgpu-{backend}")
    };
    assert_eq!(
        observed_path, expected_path,
        "observed backend {observed_path} does not match requested path {expected_path}"
    );
    assert!(
        adapter_name.to_lowercase().contains("llvmpipe"),
        "reference wgpu adapter is not pinned llvmpipe: {adapter_name}"
    );
    assert_eq!(
        backend, "vulkan",
        "reference wgpu backend is not pinned Vulkan"
    );
}
