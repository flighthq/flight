//! Crate-private access to the shared bitmaps behind `BitmapRegion`s. Every lock a region
//! operation takes is acquired here, never in an operation body:
//!
//! - one region: a read lock (source only) or a write lock (destination only);
//! - a destination with sources: every distinct bitmap is locked exactly once, in allocation-address
//!   order so two threads running the same pair in opposite roles cannot deadlock. The destination
//!   bitmap is write-locked and every other bitmap is read-locked; source pixels are read in place.
//!   A source that shares the destination's bitmap is copied into scratch, but only its own
//!   rectangle, and read from that copy.
//!
//! Lock poisoning is recovered from, matching the rest of the crate: a bitmap is plain pixel data
//! with no invariant a panicking writer can break.

use std::ops::Index;
use std::sync::{Arc, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};

use flight_entity::Ref;

use crate::types::*;

/// Source pixels for an operation, indexed by absolute byte offset into the source bitmap
/// (`(y * width + x) * 4 + channel`), exactly as the bitmap's own `data` would be.
pub(crate) struct SourcePixels<'a> {
    pub width: u32,
    pub height: u32,
    storage: SourceStorage<'a>,
}

enum SourceStorage<'a> {
    Shared(&'a [u8]),
    // The source rectangle, clipped to its bitmap, copied out of a bitmap the operation is also
    // writing. `x`/`y` are the clipped origin and `columns` the clipped width, in pixels.
    Scratch {
        data: Vec<u8>,
        x: u32,
        y: u32,
        columns: u32,
        rows: u32,
    },
}

// Distinct bitmaps among `bitmaps`, sorted by allocation address: the one global lock order.
fn get_lock_order<'a>(bitmaps: impl Iterator<Item = &'a Ref<Bitmap>>) -> Vec<&'a Ref<Bitmap>> {
    let mut order: Vec<&Ref<Bitmap>> = Vec::new();
    for bitmap in bitmaps {
        if !order.iter().any(|seen| Arc::ptr_eq(seen, bitmap)) {
            order.push(bitmap);
        }
    }
    order.sort_by_key(|bitmap| Arc::as_ptr(bitmap) as usize);
    return order;
}

fn get_scratch_source<'a>(bitmap: &Bitmap, region: &BitmapRegion) -> SourcePixels<'a> {
    let width = bitmap.width;
    let height = bitmap.height;
    let x0 = region.x.clamp(0, width as i32) as u32;
    let y0 = region.y.clamp(0, height as i32) as u32;
    let x1 = region.x.saturating_add(region.width).clamp(0, width as i32) as u32;
    let y1 = region
        .y
        .saturating_add(region.height)
        .clamp(0, height as i32) as u32;
    let columns = x1.saturating_sub(x0);
    let rows = y1.saturating_sub(y0);
    let mut data = Vec::with_capacity((columns * rows * 4) as usize);
    for row in y0..y0 + rows {
        let start = ((row * width + x0) * 4) as usize;
        data.extend_from_slice(&bitmap.data[start..start + (columns * 4) as usize]);
    }
    return SourcePixels {
        width,
        height,
        storage: SourceStorage::Scratch {
            data,
            x: x0,
            y: y0,
            columns,
            rows,
        },
    };
}

fn get_shared_source<'a>(
    guards: &'a [(*const RwLock<Bitmap>, RwLockReadGuard<'_, Bitmap>)],
    bitmap: &Ref<Bitmap>,
) -> SourcePixels<'a> {
    let ptr = Arc::as_ptr(bitmap);
    let (_, guard) = guards
        .iter()
        .find(|(locked, _)| *locked == ptr)
        .expect("every source bitmap is in the lock order");
    return SourcePixels {
        width: guard.width,
        height: guard.height,
        storage: SourceStorage::Shared(&guard.data),
    };
}

// The byte at absolute offset `index`; a scratch source maps the offset into its copied rectangle.
fn get_source_pixel_byte<'a>(pixels: &'a SourcePixels<'_>, index: usize) -> &'a u8 {
    return match &pixels.storage {
        SourceStorage::Shared(data) => &data[index],
        SourceStorage::Scratch {
            data,
            x,
            y,
            columns,
            rows,
        } => {
            let pixel = (index / 4) as u32;
            let channel = index % 4;
            let column = (pixel % pixels.width).wrapping_sub(*x);
            let row = (pixel / pixels.width).wrapping_sub(*y);
            assert!(
                column < *columns && row < *rows,
                "same-bitmap source read outside its own rectangle"
            );
            &data[((row * columns + column) * 4) as usize + channel]
        }
    };
}

fn read_bitmap(bitmap: &Ref<Bitmap>) -> RwLockReadGuard<'_, Bitmap> {
    return bitmap.read().unwrap_or_else(PoisonError::into_inner);
}

/// Runs `f` with the bitmap behind `region` read-locked.
pub(crate) fn read_region_bitmap<R>(region: &BitmapRegion, f: impl FnOnce(&Bitmap) -> R) -> R {
    let bitmap = read_bitmap(&region.bitmap);
    return f(&bitmap);
}

/// Runs `f` with every source region's pixels read-locked. Each distinct bitmap is locked once.
pub(crate) fn read_region_sources<R, const N: usize>(
    sources: [&BitmapRegion; N],
    f: impl FnOnce([SourcePixels<'_>; N]) -> R,
) -> R {
    let order = get_lock_order(sources.iter().map(|region| &region.bitmap));
    let guards: Vec<(*const RwLock<Bitmap>, RwLockReadGuard<'_, Bitmap>)> = order
        .iter()
        .map(|bitmap| (Arc::as_ptr(bitmap), read_bitmap(bitmap)))
        .collect();
    let views = sources.map(|region| get_shared_source(&guards, &region.bitmap));
    return f(views);
}

fn write_bitmap(bitmap: &Ref<Bitmap>) -> RwLockWriteGuard<'_, Bitmap> {
    return bitmap.write().unwrap_or_else(PoisonError::into_inner);
}

/// Runs `f` with the bitmap behind `region` write-locked.
pub(crate) fn write_region_bitmap<R>(region: &BitmapRegion, f: impl FnOnce(&mut Bitmap) -> R) -> R {
    let mut bitmap = write_bitmap(&region.bitmap);
    return f(&mut bitmap);
}

/// Runs `f` with the destination bitmap write-locked and each source's pixels readable. Distinct
/// bitmaps are locked once each, in allocation-address order; a source on the destination's own
/// bitmap reads a scratch copy of its rectangle only.
pub(crate) fn write_region_with_sources<R, const N: usize>(
    dest: &BitmapRegion,
    sources: [&BitmapRegion; N],
    f: impl FnOnce(&mut Bitmap, [SourcePixels<'_>; N]) -> R,
) -> R {
    let dest_ptr = Arc::as_ptr(&dest.bitmap);
    let order = get_lock_order(
        std::iter::once(&dest.bitmap).chain(sources.iter().map(|region| &region.bitmap)),
    );
    let mut dest_guard = None;
    let mut read_guards = Vec::new();
    for bitmap in &order {
        if Arc::as_ptr(bitmap) == dest_ptr {
            dest_guard = Some(write_bitmap(bitmap));
        } else {
            read_guards.push((Arc::as_ptr(bitmap), read_bitmap(bitmap)));
        }
    }
    let mut dest_guard = dest_guard.expect("the destination bitmap is always in the lock order");
    let views = sources.map(|region| {
        if Arc::as_ptr(&region.bitmap) == dest_ptr {
            return get_scratch_source(&dest_guard, region);
        }
        return get_shared_source(&read_guards, &region.bitmap);
    });
    return f(&mut dest_guard, views);
}

impl Index<usize> for SourcePixels<'_> {
    type Output = u8;

    fn index(&self, index: usize) -> &u8 {
        return get_source_pixel_byte(self, index);
    }
}
