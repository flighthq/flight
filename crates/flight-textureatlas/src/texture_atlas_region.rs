use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, Vector2};
use flight_texture::{
    Texture, Texture2D, TextureUvTransform, clone_texture, copy_texture, get_texture_height,
    get_texture_width,
};

use crate::types::*;

// The sort key past every real frame number (the source's Number.MAX_SAFE_INTEGER).
// flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
const NO_ORDINAL_SORT_KEY: f64 = 9007199254740991.0;

// flight-lint: allow(conform-params) Principal c0f9227c D23 callers assign authored region fields after canonical construction
pub fn create_texture_atlas_region() -> Ref<TextureAtlasRegion> {
    let mut out: TextureAtlasRegion = allocate_entity();
    initialize_texture_atlas_region(&mut out);
    return Arc::new(RwLock::new(out));
}

/// Restores canonical region defaults while preserving entity identity.
// flight-lint: allow(conform-params) Principal c0f9227c D23 initialization restores defaults before caller-authored assignment
pub fn initialize_texture_atlas_region(out: &mut TextureAtlasRegion) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
    out.id = -1;
    out.name = None;
    out.original_height = None;
    out.original_width = None;
    out.page_name = None;
    out.pivot_x = None;
    out.pivot_y = None;
    out.rotation = TextureAtlasRotation::None;
    out.source_x = 0.0;
    out.source_y = 0.0;
    out.trimmed = false;
}

/// Appends a region, assigning it an id no region in the atlas holds or has held: one past the
/// highest live id, and never below the atlas's high-water mark, so a removed id is not reused.
pub fn add_texture_atlas_region(
    target: &mut TextureAtlas,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    pivot_x: Option<f32>,
    pivot_y: Option<f32>,
    name: Option<&str>,
) {
    let id = next_texture_atlas_region_id(target);
    let options = TextureAtlasRegionOptions {
        x: Some(x),
        y: Some(y),
        width: Some(width),
        height: Some(height),
        id: Some(id),
        pivot_x,
        pivot_y,
        name: name.map(|name| name.to_string()),
        ..TextureAtlasRegionOptions::default()
    };
    let region = create_texture_atlas_region();
    set_texture_atlas_region(&mut region.write().unwrap(), &options);
    target.regions.push(region);
}

/// Appends a region given two opposite corners: `(ax, ay)` top-left and `(bx, by)` bottom-right.
pub fn add_texture_atlas_region_corners(
    target: &mut TextureAtlas,
    ax: f32,
    ay: f32,
    bx: f32,
    by: f32,
    pivot_x: Option<f32>,
    pivot_y: Option<f32>,
    name: Option<&str>,
) {
    add_texture_atlas_region(target, ax, ay, bx - ax, by - ay, pivot_x, pivot_y, name);
}

pub fn add_texture_atlas_region_rectangle(
    target: &mut TextureAtlas,
    rect: &Rectangle,
    pivot: Option<&Vector2>,
    name: Option<&str>,
) {
    add_texture_atlas_region(
        target,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        pivot.map(|pivot| pivot.x),
        pivot.map(|pivot| pivot.y),
        name,
    );
}

pub fn add_texture_atlas_region_vector2(
    target: &mut TextureAtlas,
    a: &Vector2,
    b: &Vector2,
    pivot: Option<&Vector2>,
    name: Option<&str>,
) {
    add_texture_atlas_region(
        target,
        a.x,
        a.y,
        b.x - a.x,
        b.y - a.y,
        pivot.map(|pivot| pivot.x),
        pivot.map(|pivot| pivot.y),
        name,
    );
}

/// Clears and fills a caller-owned name -> region lookup over the atlas (the first region wins a
/// duplicate name, as the linear scan does). The lookup is not cached on the atlas: rebuild it after
/// changing the atlas.
// flight-lint: allow(conform-params) D24: computed index fills and reuses caller-owned storage
pub fn build_texture_atlas_region_index(
    out: &mut HashMap<String, Ref<TextureAtlasRegion>>,
    atlas: &TextureAtlas,
) {
    out.clear();
    for region in &atlas.regions {
        if let Some(name) = region.read().unwrap().name.clone() {
            out.entry(name).or_insert_with(|| region.clone());
        }
    }
}

/// Removes every region, leaving the atlas reusable and its texture untouched.
pub fn clear_texture_atlas_regions(target: &mut TextureAtlas) {
    target.regions.clear();
}

/// Why `get_texture_atlas_region_texture` can or cannot mint the requested view. A page with a
/// nonzero UV rotation is refused: composing it with a region window can need shear, which a Texture
/// cannot represent.
pub fn explain_texture_atlas_region_texture(
    atlas: &TextureAtlas,
    region_id: i32,
) -> TextureAtlasRegionTextureExplanation {
    let status = if get_texture_atlas_region_by_id(atlas, region_id).is_none() {
        TextureAtlasRegionTextureStatus::MissingRegion
    } else {
        match &atlas.texture {
            None => TextureAtlasRegionTextureStatus::MissingTexture,
            Some(texture) if texture.read().unwrap().texture_fields().uv_rotation != 0.0 => {
                TextureAtlasRegionTextureStatus::RotatedPage
            }
            Some(_) => TextureAtlasRegionTextureStatus::Ready,
        }
    };
    return TextureAtlasRegionTextureExplanation { status };
}

/// The first region with this id, or `None`.
pub fn get_texture_atlas_region_by_id(
    atlas: &TextureAtlas,
    id: i32,
) -> Option<Ref<TextureAtlasRegion>> {
    return atlas
        .regions
        .iter()
        .find(|region| region.read().unwrap().id == id)
        .cloned();
}

/// The first region whose name matches exactly (case-sensitive), or `None`.
pub fn get_texture_atlas_region_by_name(
    atlas: &TextureAtlas,
    name: &str,
) -> Option<Ref<TextureAtlasRegion>> {
    return atlas
        .regions
        .iter()
        .find(|region| region.read().unwrap().name.as_deref() == Some(name))
        .cloned();
}

/// The first region whose name starts with `prefix` and carries this trailing ordinal (compared as a
/// number, so zero padding does not matter), or `None`.
// flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
pub fn get_texture_atlas_region_by_ordinal(
    atlas: &TextureAtlas,
    prefix: &str,
    ordinal: f64,
) -> Option<Ref<TextureAtlasRegion>> {
    for region in &atlas.regions {
        let guard = region.read().unwrap();
        let Some(name) = &guard.name else {
            continue;
        };
        if !name.starts_with(prefix) {
            continue;
        }
        if get_texture_atlas_region_ordinal(&guard) == ordinal {
            return Some(region.clone());
        }
    }
    return None;
}

/// The number of regions in the atlas.
pub fn get_texture_atlas_region_count(atlas: &TextureAtlas) -> usize {
    return atlas.regions.len();
}

/// Writes the region's placement inside its original, untrimmed frame: the trim offset
/// (`source_x`/`source_y`) and the original extent, falling back to the logical drawn extent (swapped
/// for a rotated region) when no original size is recorded.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (region, out) and returns out
pub fn get_texture_atlas_region_frame(out: &mut Rectangle, region: &TextureAtlasRegion) {
    let rotated = region.rotation != TextureAtlasRotation::None;
    let original_width =
        region
            .original_width
            .unwrap_or(if rotated { region.height } else { region.width });
    let original_height =
        region
            .original_height
            .unwrap_or(if rotated { region.width } else { region.height });
    out.x = region.source_x;
    out.y = region.source_y;
    out.width = original_width;
    out.height = original_height;
}

/// The trailing decimal ordinal in the region's name (`walk_007` is 7), or -1 when the name is null
/// or does not end in digits. Digits must run to the end of the name.
// flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
pub fn get_texture_atlas_region_ordinal(region: &TextureAtlasRegion) -> f64 {
    let Some(name) = &region.name else {
        return -1.0;
    };
    let bytes = name.as_bytes();
    let mut start = bytes.len();
    while start > 0 && bytes[start - 1].is_ascii_digit() {
        start -= 1;
    }
    if start == bytes.len() {
        return -1.0;
    }
    let mut ordinal = 0.0;
    for digit in &bytes[start..] {
        ordinal = ordinal * 10.0 + f64::from(digit - b'0');
    }
    return ordinal;
}

/// Writes every region whose name starts with `prefix` into `out` (cleared first), ordered by the
/// trailing ordinal; regions without one follow the numbered run. The sort is stable, so equal
/// ordinals and unnumbered regions keep insertion order.
// flight-lint: allow(f64) D1: ordinal sort keys are JS numbers
// flight-lint: allow(conform-params) D9b: out-first; the source passes (atlas, prefix, out) and returns out
// flight-lint: allow(hashmap-iteration) this output is a Vec; a separate D24 function in this file owns the HashMap output
pub fn get_texture_atlas_region_sequence(
    out: &mut Vec<Ref<TextureAtlasRegion>>,
    atlas: &TextureAtlas,
    prefix: &str,
) {
    out.clear();
    for region in &atlas.regions {
        let matches = region
            .read()
            .unwrap()
            .name
            .as_ref()
            .is_some_and(|name| name.starts_with(prefix));
        if matches {
            out.push(region.clone());
        }
    }
    let mut keys: Vec<f64> = out
        .iter()
        .map(|region| texture_atlas_region_sequence_key(&region.read().unwrap()))
        .collect();
    // Insertion sort over both vectors, stable by construction, as in the source.
    for i in 1..out.len() {
        let region = out[i].clone();
        let key = keys[i];
        let mut j = i;
        while j > 0 && keys[j - 1] > key {
            out[j] = out[j - 1].clone();
            keys[j] = keys[j - 1];
            j -= 1;
        }
        out[j] = region;
        keys[j] = key;
    }
}

/// One shared 2D texture per distinct region, viewing the region's texel rect through the page
/// texture's window (page offset and scale in source pixels, page flips folded in, a packed rotation
/// as a quarter-turn). The cache keeps identity only: each call re-derives the window into the cached
/// texture, so in-place region edits and page changes are picked up, and an earlier reference is
/// rewritten rather than snapshotted. `None` (after consulting the guard, when one is installed) when
/// the region or page is missing or the page is rotated.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn get_texture_atlas_region_texture(
    atlas: &Ref<TextureAtlas>,
    region_id: i32,
    guards: Option<&TextureAtlasGuardState>,
) -> Option<Ref<Texture2D>> {
    let atlas_value = atlas.read().unwrap();
    let explanation = explain_texture_atlas_region_texture(&atlas_value, region_id);
    if explanation.status != TextureAtlasRegionTextureStatus::Ready {
        let guard = guards.and_then(|guards| guards.guard.clone());
        drop(atlas_value);
        if let Some(guard) = guard {
            guard(atlas, region_id, &explanation);
        }
        return None;
    }
    let region = get_texture_atlas_region_by_id(&atlas_value, region_id)?;
    let page_ref = atlas_value.texture.clone()?;
    let page = page_ref.read().unwrap();
    let mut cache = atlas_value.region_textures.lock().unwrap();
    cache.retain(|(key, _)| key.strong_count() > 0);
    let cached = cache
        .iter()
        .find(|(key, _)| std::ptr::eq(key.as_ptr(), Arc::as_ptr(&region)))
        .map(|(_, texture)| texture.clone());
    let texture = match cached {
        Some(texture) => {
            copy_texture(&mut *texture.write().unwrap(), &*page);
            texture
        }
        None => {
            let Texture::Texture2D(clone) = clone_texture(&*page) else {
                unreachable!("an atlas page is a 2D texture");
            };
            let texture = Arc::new(RwLock::new(clone));
            cache.push((Arc::downgrade(&region), texture.clone()));
            texture
        }
    };
    set_texture_atlas_region_texture_window(
        &mut texture.write().unwrap(),
        &page,
        &region.read().unwrap(),
    );
    return Some(texture);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextureAtlasRegionTextureStatus string union; the TS package exports no get_/parse_ free functions
pub fn get_texture_atlas_region_texture_status_string(
    value: TextureAtlasRegionTextureStatus,
) -> &'static str {
    return match value {
        TextureAtlasRegionTextureStatus::MissingRegion => "missing-region",
        TextureAtlasRegionTextureStatus::MissingTexture => "missing-texture",
        TextureAtlasRegionTextureStatus::Ready => "ready",
        TextureAtlasRegionTextureStatus::RotatedPage => "rotated-page",
    };
}

/// Writes normalized UVs of the packed rect (`x / image_width`, ...) into `out`; all zeros when either
/// image dimension is not positive. A rotated region's rect still covers its packed texels.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (region, imageWidth, imageHeight, out) and returns out
pub fn get_texture_atlas_region_uv(
    out: &mut Rectangle,
    region: &TextureAtlasRegion,
    image_width: f32,
    image_height: f32,
) {
    if image_width <= 0.0 || image_height <= 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }
    out.x = region.x / image_width;
    out.y = region.y / image_height;
    out.width = region.width / image_width;
    out.height = region.height / image_height;
}

/// Writes the drawn quad's four UV corners into `out` (resized to 8): top-left, top-right,
/// bottom-right, bottom-left, walking the packed rect in the order that undoes a clockwise or
/// counterclockwise packed quarter-turn. All zeros when either image dimension is not positive.
// flight-lint: allow(conform-params) D9b: out-first; the source passes (region, imageWidth, imageHeight, out) and returns out
pub fn get_texture_atlas_region_uv_quad(
    out: &mut Vec<f32>,
    region: &TextureAtlasRegion,
    image_width: f32,
    image_height: f32,
) {
    out.resize(8, 0.0);
    if image_width <= 0.0 || image_height <= 0.0 {
        out.fill(0.0);
        return;
    }
    let u0 = region.x / image_width;
    let v0 = region.y / image_height;
    let u1 = (region.x + region.width) / image_width;
    let v1 = (region.y + region.height) / image_height;
    let corners = match region.rotation {
        TextureAtlasRotation::Counterclockwise90 => [u0, v1, u0, v0, u1, v0, u1, v1],
        TextureAtlasRotation::Clockwise90 => [u1, v0, u1, v1, u0, v1, u0, v0],
        TextureAtlasRotation::None => [u0, v0, u1, v0, u1, v1, u0, v1],
    };
    out.copy_from_slice(&corners);
}

/// Whether the atlas holds a region with this exact (case-sensitive) name.
pub fn has_texture_atlas_region(atlas: &TextureAtlas, name: &str) -> bool {
    return get_texture_atlas_region_by_name(atlas, name).is_some();
}

// The next id for this atlas, never below its high-water mark, so removing the highest region cannot
// hand its id out again (an atlas built pre-populated is seeded from its highest live id).
fn next_texture_atlas_region_id(atlas: &mut TextureAtlas) -> i32 {
    let highest = atlas
        .regions
        .iter()
        .map(|region| region.read().unwrap().id)
        .fold(-1, i32::max);
    let marked = atlas.next_region_id_mark;
    let next = if marked > highest + 1 {
        marked
    } else {
        highest + 1
    };
    atlas.next_region_id_mark = next + 1;
    return next;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS TextureAtlasRegionTextureStatus string union; the TS package exports no get_/parse_ free functions
pub fn parse_texture_atlas_region_texture_status(
    value: &str,
) -> Option<TextureAtlasRegionTextureStatus> {
    return match value {
        "missing-region" => Some(TextureAtlasRegionTextureStatus::MissingRegion),
        "missing-texture" => Some(TextureAtlasRegionTextureStatus::MissingTexture),
        "ready" => Some(TextureAtlasRegionTextureStatus::Ready),
        "rotated-page" => Some(TextureAtlasRegionTextureStatus::RotatedPage),
        _ => None,
    };
}

/// Removes the region with this id; `true` when one was removed. Ids stay valid across removals.
pub fn remove_texture_atlas_region(target: &mut TextureAtlas, id: i32) -> bool {
    let Some(index) = target
        .regions
        .iter()
        .position(|region| region.read().unwrap().id == id)
    else {
        return false;
    };
    target.regions.remove(index);
    return true;
}

/// Overwrites every authored field of `out` from `source`, taking canonical defaults for unset
/// fields while preserving entity identity.
pub fn set_texture_atlas_region(out: &mut TextureAtlasRegion, source: &TextureAtlasRegionOptions) {
    out.x = source.x.unwrap_or(0.0);
    out.y = source.y.unwrap_or(0.0);
    out.width = source.width.unwrap_or(0.0);
    out.height = source.height.unwrap_or(0.0);
    out.id = source.id.unwrap_or(-1);
    out.name = source.name.clone();
    out.original_height = source.original_height;
    out.original_width = source.original_width;
    out.page_name = source.page_name.clone();
    out.pivot_x = source.pivot_x;
    out.pivot_y = source.pivot_y;
    out.rotation = source.rotation.unwrap_or(TextureAtlasRotation::None);
    out.source_x = source.source_x.unwrap_or(0.0);
    out.source_y = source.source_y.unwrap_or(0.0);
    out.trimmed = source.trimmed.unwrap_or(false);
}

/// Installs (or, with `None`, removes) the diagnostics hook consulted when region texture minting
/// returns `None`.
// flight-lint: allow(conform-params) D5: caller-owned guard state replaces the source module guard slot
pub fn set_texture_atlas_region_texture_guard(
    state: &mut TextureAtlasGuardState,
    guard: Option<TextureAtlasRegionTextureGuard>,
) {
    state.guard = guard;
}

fn set_texture_atlas_region_texture_window(
    texture: &mut Texture2D,
    page: &Texture2D,
    region: &TextureAtlasRegion,
) {
    let source_width = get_texture_width(page) as f32;
    let source_height = get_texture_height(page) as f32;
    let page_fields = page.texture_fields().clone();
    let fields = texture.texture_fields_mut();
    if source_width <= 0.0 || source_height <= 0.0 {
        fields.flip_x = false;
        fields.flip_y = false;
        fields.uv_offset.x = 0.0;
        fields.uv_offset.y = 0.0;
        fields.uv_rotation = 0.0;
        fields.uv_scale.x = 0.0;
        fields.uv_scale.y = 0.0;
        return;
    }
    let page_x = page_fields.uv_offset.x * source_width;
    let page_y = page_fields.uv_offset.y * source_height;
    let page_width = page_fields.uv_scale.x * source_width;
    let page_height = page_fields.uv_scale.y * source_height;
    let x = if page_fields.flip_x {
        page_x + page_width - region.x - region.width
    } else {
        page_x + region.x
    };
    let y = if page_fields.flip_y {
        page_y + page_height - region.y - region.height
    } else {
        page_y + region.y
    };
    let counterclockwise = region.rotation == TextureAtlasRotation::Counterclockwise90;
    fields.uv_offset.x = x / source_width;
    if region.rotation != TextureAtlasRotation::None {
        fields.flip_x = page_fields.flip_y;
        fields.flip_y = page_fields.flip_x;
        fields.uv_offset.x = (x + if counterclockwise { 0.0 } else { region.width }) / source_width;
        fields.uv_offset.y =
            (y + if counterclockwise { region.height } else { 0.0 }) / source_height;
        fields.uv_rotation = (region.rotation as i32) as f32 * (std::f32::consts::PI / 2.0);
        fields.uv_scale.x = region.height / source_height;
        fields.uv_scale.y = region.width / source_width;
    } else {
        fields.flip_x = page_fields.flip_x;
        fields.flip_y = page_fields.flip_y;
        fields.uv_offset.y = y / source_height;
        fields.uv_rotation = 0.0;
        fields.uv_scale.x = region.width / source_width;
        fields.uv_scale.y = region.height / source_height;
    }
}

// The sequence sort key: the ordinal, with "no ordinal" past every real frame number.
// flight-lint: allow(f64) D1: ordinals are JS numbers accumulated digit by digit
fn texture_atlas_region_sequence_key(region: &TextureAtlasRegion) -> f64 {
    let ordinal = get_texture_atlas_region_ordinal(region);
    return if ordinal < 0.0 {
        NO_ORDINAL_SORT_KEY
    } else {
        ordinal
    };
}
