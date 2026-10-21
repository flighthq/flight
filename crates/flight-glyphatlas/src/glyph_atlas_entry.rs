use std::sync::{Arc, RwLock};

use crate::types::*;
use flight_bitmap::invalidate_bitmap;
use flight_entity::Ref;

fn blit_glyph_into_atlas_bitmap(runtime: &mut GlyphAtlasRuntime, codepoint: u32, x: u32, y: u32) {
    let rasterized = runtime.bitmaps.get(&codepoint).unwrap();
    let mut bitmap = runtime.bitmap.write().unwrap();
    let mut py = 0;
    while py < rasterized.height {
        let mut px = 0;
        while px < rasterized.width {
            let source_index = (py as usize * rasterized.width as usize + px as usize) * 4;
            let dest_index = ((y + py) as usize * bitmap.width as usize + (x + px) as usize) * 4;
            bitmap.data[dest_index] = rasterized.pixels[source_index];
            bitmap.data[dest_index + 1] = rasterized.pixels[source_index + 1];
            bitmap.data[dest_index + 2] = rasterized.pixels[source_index + 2];
            bitmap.data[dest_index + 3] = rasterized.pixels[source_index + 3];
            px += 1;
        }
        py += 1;
    }
    invalidate_bitmap(&mut bitmap);
}

fn evict_least_recently_used_glyph(runtime: &mut GlyphAtlasRuntime) -> bool {
    if runtime.lru.is_empty() {
        return false;
    }
    let codepoint = runtime.lru.remove(0);
    release_glyph_budget(runtime, codepoint);
    runtime.entries.remove(&codepoint);
    runtime.bitmaps.remove(&codepoint);
    if let Some(index) = runtime
        .entry_order
        .iter()
        .position(|value| *value == codepoint)
    {
        runtime.entry_order.remove(index);
    }
    return true;
}

pub fn get_glyph_atlas_entry(atlas: &Ref<GlyphAtlas>, codepoint: u32) -> Option<Ref<GlyphEntry>> {
    let runtime = get_glyph_atlas_runtime(atlas);
    let mut runtime = runtime.write().unwrap();
    if let Some(existing) = runtime.entries.get(&codepoint).cloned() {
        touch_glyph_lru(&mut runtime, codepoint);
        return Some(existing);
    }

    let rasterized = runtime
        .rasterizer_backend
        .rasterize(codepoint, &runtime.rasterize_options);
    let Some(rasterized) = rasterized else {
        notify_glyph_atlas_entry_guard(
            &mut runtime,
            GlyphAtlasEntryGuardReason::RasterizerReturnedNull,
            codepoint,
        );
        return None;
    };

    let (atlas_width, atlas_height) = {
        let bitmap = runtime.bitmap.read().unwrap();
        (bitmap.width, bitmap.height)
    };
    let usable_width = atlas_width as i64 - 2 * i64::from(runtime.padding);
    let usable_height = atlas_height as i64 - 2 * i64::from(runtime.padding);
    if i64::from(rasterized.width) > usable_width || i64::from(rasterized.height) > usable_height {
        notify_glyph_atlas_entry_guard(
            &mut runtime,
            GlyphAtlasEntryGuardReason::GlyphLargerThanAtlas,
            codepoint,
        );
        return None;
    }

    let incoming_bytes = rasterized.pixels.len();
    let incoming_area = rasterized.width as usize * rasterized.height as usize;
    let mut needs_repack = false;
    while is_glyph_atlas_over_budget(&runtime, incoming_bytes, incoming_area) {
        if !evict_least_recently_used_glyph(&mut runtime) {
            break;
        }
        needs_repack = true;
    }

    let mut placement = place_glyph_on_shelf(&mut runtime, rasterized.width, rasterized.height);
    if placement.is_none() && needs_repack {
        repack_glyph_atlas(&mut runtime);
        placement = place_glyph_on_shelf(&mut runtime, rasterized.width, rasterized.height);
    }
    while placement.is_none() {
        if runtime.entries.is_empty() {
            return None;
        }
        evict_least_recently_used_glyph(&mut runtime);
        repack_glyph_atlas(&mut runtime);
        placement = place_glyph_on_shelf(&mut runtime, rasterized.width, rasterized.height);
    }

    let (x, y) = placement.unwrap();
    let entry = Arc::new(RwLock::new(GlyphEntry {
        advance: rasterized.advance,
        bearing_x: rasterized.bearing_x,
        bearing_y: rasterized.bearing_y,
        height: rasterized.height,
        page: 0,
        width: rasterized.width,
        x,
        y,
    }));
    runtime.entries.insert(codepoint, entry.clone());
    runtime.entry_order.push(codepoint);
    runtime.bitmaps.insert(codepoint, rasterized);
    runtime.retained_bytes += incoming_bytes;
    runtime.occupied_area += incoming_area;
    runtime.lru.push(codepoint);
    blit_glyph_into_atlas_bitmap(&mut runtime, codepoint, x, y);
    mark_glyph_atlas_dirty_rect(
        &mut runtime,
        x,
        y,
        entry.read().unwrap().width,
        entry.read().unwrap().height,
    );
    return Some(entry);
}

fn is_glyph_atlas_over_budget(
    runtime: &GlyphAtlasRuntime,
    incoming_bytes: usize,
    incoming_area: usize,
) -> bool {
    if runtime.entries.is_empty() {
        return false;
    }
    if runtime.max_glyphs > 0 && runtime.entries.len() >= runtime.max_glyphs {
        return true;
    }
    if runtime.max_bytes > 0 && runtime.retained_bytes + incoming_bytes > runtime.max_bytes {
        return true;
    }
    if runtime.max_area > 0 && runtime.occupied_area + incoming_area > runtime.max_area {
        return true;
    }
    return false;
}

fn mark_glyph_atlas_dirty_rect(
    runtime: &mut GlyphAtlasRuntime,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) {
    let max_x = x + width;
    let max_y = y + height;
    if !runtime.dirty {
        runtime.dirty = true;
        runtime.dirty_min_x = x;
        runtime.dirty_min_y = y;
        runtime.dirty_max_x = max_x;
        runtime.dirty_max_y = max_y;
        return;
    }
    runtime.dirty_min_x = runtime.dirty_min_x.min(x);
    runtime.dirty_min_y = runtime.dirty_min_y.min(y);
    runtime.dirty_max_x = runtime.dirty_max_x.max(max_x);
    runtime.dirty_max_y = runtime.dirty_max_y.max(max_y);
}

fn notify_glyph_atlas_entry_guard(
    runtime: &mut GlyphAtlasRuntime,
    reason: GlyphAtlasEntryGuardReason,
    subject: u32,
) {
    let Some(guard) = runtime.entry_guard.clone() else {
        return;
    };
    if reason == GlyphAtlasEntryGuardReason::Repack {
        runtime.guard_repack_count += 1;
    }
    guard(&GlyphAtlasEntryGuardNotice {
        reason,
        subject,
        repack_count: runtime.guard_repack_count,
    });
}

fn place_glyph_on_shelf(
    runtime: &mut GlyphAtlasRuntime,
    width: u32,
    height: u32,
) -> Option<(u32, u32)> {
    let (bitmap_width, bitmap_height) = {
        let bitmap = runtime.bitmap.read().unwrap();
        (bitmap.width, bitmap.height)
    };
    let padding = runtime.padding;
    let right_limit = i64::from(bitmap_width) - i64::from(padding);
    let mut best_index = None;
    let mut best_slack = u32::MAX;
    for (index, shelf) in runtime.shelves.iter().enumerate() {
        if shelf.height < height || i64::from(shelf.cursor_x + width) > right_limit {
            continue;
        }
        let slack = shelf.height - height;
        if slack < best_slack {
            best_index = Some(index);
            best_slack = slack;
        }
    }
    if let Some(index) = best_index {
        let shelf = &mut runtime.shelves[index];
        let x = shelf.cursor_x;
        shelf.cursor_x = x + width + padding;
        return Some((x, shelf.y));
    }

    let y = runtime.pack_bottom;
    if i64::from(y + height) > i64::from(bitmap_height) - i64::from(padding)
        || i64::from(padding + width) > right_limit
    {
        return None;
    }
    runtime.shelves.push(GlyphAtlasShelf {
        cursor_x: padding + width + padding,
        height,
        y,
    });
    runtime.pack_bottom = y + height + padding;
    return Some((padding, y));
}

fn release_glyph_budget(runtime: &mut GlyphAtlasRuntime, codepoint: u32) {
    let Some(bitmap) = runtime.bitmaps.get(&codepoint) else {
        return;
    };
    runtime.retained_bytes -= bitmap.pixels.len();
    runtime.occupied_area -= bitmap.width as usize * bitmap.height as usize;
}

fn repack_glyph_atlas(runtime: &mut GlyphAtlasRuntime) {
    runtime.layout_version += 1;
    notify_glyph_atlas_entry_guard(
        runtime,
        GlyphAtlasEntryGuardReason::Repack,
        runtime.entries.len() as u32,
    );
    runtime.shelves.clear();
    runtime.pack_bottom = runtime.padding;
    runtime.bitmap.write().unwrap().data.fill(0);

    let mut codepoints = runtime.entry_order.clone();
    codepoints.sort_by(|a, b| {
        let a_height = runtime.entries.get(a).unwrap().read().unwrap().height;
        let b_height = runtime.entries.get(b).unwrap().read().unwrap().height;
        return b_height.cmp(&a_height).then_with(|| a.cmp(b));
    });
    for codepoint in codepoints {
        let (width, height) = {
            let bitmap = runtime.bitmaps.get(&codepoint).unwrap();
            (bitmap.width, bitmap.height)
        };
        let Some((x, y)) = place_glyph_on_shelf(runtime, width, height) else {
            notify_glyph_atlas_entry_guard(
                runtime,
                GlyphAtlasEntryGuardReason::RepackDropped,
                codepoint,
            );
            release_glyph_budget(runtime, codepoint);
            runtime.entries.remove(&codepoint);
            runtime.bitmaps.remove(&codepoint);
            runtime.lru.retain(|value| *value != codepoint);
            runtime.entry_order.retain(|value| *value != codepoint);
            continue;
        };
        {
            let mut entry = runtime.entries.get(&codepoint).unwrap().write().unwrap();
            entry.x = x;
            entry.y = y;
        }
        blit_glyph_into_atlas_bitmap(runtime, codepoint, x, y);
    }
    let (width, height) = {
        let bitmap = runtime.bitmap.read().unwrap();
        (bitmap.width, bitmap.height)
    };
    mark_glyph_atlas_dirty_rect(runtime, 0, 0, width, height);
}

// flight-lint: allow(conform-params) D5: the atlas is the explicit owner of the typed guard slot
pub fn set_glyph_atlas_entry_guard(atlas: &Ref<GlyphAtlas>, guard: Option<GlyphAtlasEntryGuard>) {
    get_glyph_atlas_runtime(atlas).write().unwrap().entry_guard = guard;
}

fn touch_glyph_lru(runtime: &mut GlyphAtlasRuntime, codepoint: u32) {
    if let Some(index) = runtime.lru.iter().position(|value| *value == codepoint) {
        runtime.lru.remove(index);
    }
    runtime.lru.push(codepoint);
}
