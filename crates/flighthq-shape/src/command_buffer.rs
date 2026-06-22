//! Encoding helpers for the flat heterogeneous shape command buffer.
//!
//! A shape's `commands` is a `Vec<Box<dyn Any + Send + Sync>>` that mirrors the
//! TypeScript flat command stream. Each command occupies a key slot
//! (`&'static str`), an argument-count slot (`i32`), then its arguments boxed in
//! their natural Rust types (`f32` for coordinates, `u32` for colors, `bool`,
//! the style enums, `ImageResource`, `Option<Matrix>`, `Vec<u32>`/`Vec<f32>` for
//! gradients, and `Vec<u8>`/`Vec<f32>`/`PathWinding` for raw paths).
//!
//! The `read_*` helpers downcast a slot back to a concrete type; they panic on a
//! type mismatch, which can only happen if a command was encoded incorrectly —
//! an internal invariant, not a user-reachable error.

use flighthq_types::{
    CapsStyle, GradientType, ImageResource, InterpolationMethod, JointStyle, LineScaleMode, Matrix,
    PathWinding, SpreadMethod,
};

/// A single boxed entry in a command buffer.
pub type AnyBox = Box<dyn std::any::Any + Send + Sync>;

/// Clones every entry of a command buffer into a fresh buffer.
///
/// Trait-object `Box<dyn Any>` is not `Clone`, so each entry is re-boxed by
/// matching its concrete type. Unknown types are skipped, which cannot happen
/// for buffers built through the append helpers.
pub fn clone_command_buffer(buf: &[AnyBox]) -> Vec<AnyBox> {
    let mut out: Vec<AnyBox> = Vec::with_capacity(buf.len());
    for entry in buf {
        out.push(clone_entry(entry));
    }
    out
}

pub fn read_bool(buf: &[AnyBox], i: usize) -> bool {
    *buf[i].downcast_ref::<bool>().expect("bool slot")
}

pub fn read_f32(buf: &[AnyBox], i: usize) -> f32 {
    *buf[i].downcast_ref::<f32>().expect("f32 slot")
}

pub fn read_key(buf: &[AnyBox], i: usize) -> &'static str {
    *buf[i].downcast_ref::<&'static str>().expect("key slot")
}

pub fn read_u8_vec(buf: &[AnyBox], i: usize) -> &Vec<u8> {
    buf[i].downcast_ref::<Vec<u8>>().expect("u8 vec slot")
}

pub fn read_u32(buf: &[AnyBox], i: usize) -> u32 {
    *buf[i].downcast_ref::<u32>().expect("u32 slot")
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

fn clone_entry(entry: &AnyBox) -> AnyBox {
    let any = entry.as_ref();
    if let Some(v) = any.downcast_ref::<&'static str>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<i32>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<f32>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<u32>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<bool>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<Vec<u8>>() {
        return Box::new(v.clone());
    }
    if let Some(v) = any.downcast_ref::<Vec<u32>>() {
        return Box::new(v.clone());
    }
    if let Some(v) = any.downcast_ref::<Vec<f32>>() {
        return Box::new(v.clone());
    }
    if let Some(v) = any.downcast_ref::<Option<Matrix>>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<ImageResource>() {
        return Box::new(v.clone());
    }
    if let Some(v) = any.downcast_ref::<GradientType>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<SpreadMethod>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<InterpolationMethod>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<LineScaleMode>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<CapsStyle>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<JointStyle>() {
        return Box::new(*v);
    }
    if let Some(v) = any.downcast_ref::<PathWinding>() {
        return Box::new(*v);
    }
    panic!("command buffer entry of unknown type");
}
