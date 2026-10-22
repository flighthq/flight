use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_bitmap::{Bitmap, create_bitmap};
use flight_entity::{Ref, allocate_entity};
use flight_glyphatlas::contract::{
    GlyphAtlas, GlyphAtlasOptions, GlyphEntry, GlyphMetrics, GlyphRasterizedBitmap, GlyphSource,
    HostGlyphRasterizerCapability, create_glyph_atlas,
};
use flight_texture::TextureSourceRef;

use super::*;

pub(crate) const RELOCATED_GLYPH_X: u32 = 17;

pub(crate) fn bitmap_text_options(text: &str) -> BitmapTextOptions {
    return BitmapTextOptions {
        text: Some(text.to_string()),
        ..empty_bitmap_text_options()
    };
}

pub(crate) fn empty_bitmap_text_options() -> BitmapTextOptions {
    return BitmapTextOptions::default();
}

pub(crate) fn create_test_bitmap_text(
    glyph_source: Option<Ref<GlyphSource>>,
    options: Option<&BitmapTextOptions>,
) -> Ref<BitmapText> {
    let text = create_bitmap_text(glyph_source);
    if let Some(options) = options {
        let mut text = text.write().unwrap();
        if let Some(align) = options.align {
            set_bitmap_text_align(&mut text, align);
        }
        if let Some(ellipsis) = &options.ellipsis {
            set_bitmap_text_ellipsis(&mut text, ellipsis);
        }
        if let Some(letter_spacing) = options.letter_spacing {
            set_bitmap_text_letter_spacing(&mut text, letter_spacing);
        }
        if let Some(line_height) = options.line_height {
            set_bitmap_text_line_height(&mut text, line_height);
        }
        if let Some(max_lines) = options.max_lines {
            set_bitmap_text_max_lines(&mut text, max_lines);
        }
        if let Some(value) = &options.text {
            set_bitmap_text_text(&mut text, value);
        }
        if let Some(wrap_width) = options.wrap_width {
            set_bitmap_text_wrap_width(&mut text, wrap_width);
        }
    }
    return text;
}

pub(crate) fn create_codepoint_color_rasterizer_backend(
    size: u32,
) -> HostGlyphRasterizerCapability {
    return HostGlyphRasterizerCapability {
        measure_metrics: None,
        provider: Arc::new(()),
        rasterize: Arc::new(move |codepoint, _options| {
            let mut pixels = vec![0; size as usize * size as usize * 4].into_boxed_slice();
            for pixel in pixels.chunks_exact_mut(4) {
                pixel[0] = codepoint as u8;
                pixel[3] = 0xff;
            }
            return Some(GlyphRasterizedBitmap {
                advance: size as f32,
                bearing_x: 0,
                bearing_y: size as i32,
                height: size,
                pixels,
                width: size,
            });
        }),
    };
}

pub(crate) fn create_limited_glyph_source(codepoints: &[u32]) -> Ref<GlyphSource> {
    let mut entries = HashMap::new();
    for codepoint in codepoints {
        entries.insert(*codepoint, glyph_entry(0, 0));
    }
    return create_source(entries, HashMap::new(), HashMap::new());
}

pub(crate) fn create_mid_layout_relocating_glyph_source(nth: usize) -> Ref<GlyphSource> {
    let mut initial = HashMap::new();
    for codepoint in 0x41..=0x5a {
        initial.insert(codepoint, glyph_entry(0, 0));
    }
    let entries = Arc::new(RwLock::new(initial));
    let image = texture_source();
    let lookups = Arc::new(AtomicUsize::new(0));
    let version = Arc::new(AtomicU32::new(0));
    let mut source: GlyphSource = allocate_entity();
    source.get_glyph_atlas_image = Arc::new(move |page| {
        return (page.unwrap_or(0) == 0).then(|| image.clone());
    });
    let entry_map = entries.clone();
    let entry_lookups = lookups.clone();
    let entry_version = version.clone();
    source.get_glyph_entry = Arc::new(move |codepoint| {
        let lookup = entry_lookups.fetch_add(1, Ordering::SeqCst) + 1;
        if nth > 0 && lookup == nth {
            entry_map
                .write()
                .unwrap()
                .insert(0x41, glyph_entry(RELOCATED_GLYPH_X, 0));
            entry_version.fetch_add(1, Ordering::SeqCst);
        }
        return entry_map.read().unwrap().get(&codepoint).cloned();
    });
    source.get_glyph_kerning = Arc::new(|_left, _right| 0.0);
    source.get_glyph_layout_version = Arc::new(move || version.load(Ordering::SeqCst));
    source.get_glyph_metrics = Arc::new(glyph_metrics);
    return Arc::new(RwLock::new(source));
}

pub(crate) fn create_repacking_glyph_atlas() -> Ref<GlyphAtlas> {
    return create_glyph_atlas(&GlyphAtlasOptions {
        font_family: "codepoint-color".to_string(),
        font_size: 8.0,
        font_style: None,
        font_weight: None,
        height: 32,
        max_area: None,
        max_bytes: None,
        max_glyphs: None,
        padding: Some(1),
        rasterizer_backend: create_codepoint_color_rasterizer_backend(8),
        width: 32,
    });
}

pub(crate) fn create_test_glyph_source() -> Ref<GlyphSource> {
    return create_test_glyph_source_with_kerning(-2.0);
}

pub(crate) fn create_test_glyph_source_without_kerning() -> Ref<GlyphSource> {
    return create_test_glyph_source_with_kerning(0.0);
}

fn create_test_glyph_source_with_kerning(amount: f32) -> Ref<GlyphSource> {
    let entries = HashMap::from([
        (0x41, glyph_entry(0, 0)),
        (0x42, glyph_entry(6, 0)),
        (
            0x20,
            Arc::new(RwLock::new(GlyphEntry {
                advance: 5.0,
                ..GlyphEntry::default()
            })),
        ),
    ]);
    let kerning = HashMap::from([((0x41, 0x42), amount)]);
    let images = HashMap::from([(0, texture_source())]);
    return create_source(entries, kerning, images);
}

pub(crate) fn create_two_page_glyph_source()
-> (Ref<GlyphSource>, TextureSourceRef, TextureSourceRef) {
    let page_zero = texture_source();
    let page_one = texture_source();
    let entries = HashMap::from([(0x41, glyph_entry(0, 0)), (0x42, glyph_entry(3, 1))]);
    let images = HashMap::from([(0, page_zero.clone()), (1, page_one.clone())]);
    return (
        create_source(entries, HashMap::new(), images),
        page_zero,
        page_one,
    );
}

pub(crate) fn glyph_entry(x: u32, page: u32) -> Ref<GlyphEntry> {
    return Arc::new(RwLock::new(GlyphEntry {
        advance: 10.0,
        bearing_x: 0,
        bearing_y: 8,
        height: 8,
        page,
        width: 6,
        x,
        y: 0,
    }));
}

pub(crate) fn guard_state() -> BitmapTextGuardState {
    return BitmapTextGuardState::default();
}

pub(crate) fn layout(text: &Ref<BitmapText>, guard_state: &BitmapTextGuardState) {
    update_bitmap_text(&mut text.write().unwrap(), guard_state);
}

pub(crate) fn read_glyph_codepoint_at_region(bitmap: &Ref<Bitmap>, x: f32, y: f32) -> u8 {
    let bitmap = bitmap.read().unwrap();
    return bitmap.data[(y as usize * bitmap.width as usize + x as usize) * 4];
}

pub(crate) fn texture_source() -> TextureSourceRef {
    let bitmap = Arc::new(RwLock::new(create_bitmap(32, 32, None)));
    return bitmap;
}

fn create_source(
    entries: HashMap<u32, Ref<GlyphEntry>>,
    kerning: HashMap<(u32, u32), f32>,
    images: HashMap<u32, TextureSourceRef>,
) -> Ref<GlyphSource> {
    let entries = Arc::new(entries);
    let kerning = Arc::new(kerning);
    let images = Arc::new(images);
    let mut source: GlyphSource = allocate_entity();
    source.get_glyph_atlas_image = Arc::new(move |page| {
        return images.get(&page.unwrap_or(0)).cloned();
    });
    source.get_glyph_entry = Arc::new(move |codepoint| entries.get(&codepoint).cloned());
    source.get_glyph_kerning =
        Arc::new(move |left, right| kerning.get(&(left, right)).copied().unwrap_or(0.0));
    source.get_glyph_layout_version = Arc::new(|| 0);
    source.get_glyph_metrics = Arc::new(glyph_metrics);
    return Arc::new(RwLock::new(source));
}

fn glyph_metrics() -> Arc<GlyphMetrics> {
    return Arc::new(GlyphMetrics {
        ascent: 8.0,
        descent: 2.0,
        line_gap: 0.0,
    });
}
