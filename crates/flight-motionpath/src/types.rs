//! flight-compiler: string-union MotionPathLoopMode
//! flight-compiler: numeric-union MotionPathDirection
//! The motion-path contract types: the arc-length marker entity, its closed loop-mode and direction
//! representations (TS `types/src/MotionPath.ts`).

use std::sync::RwLock;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_path::{Path, create_path};

/// How the marker behaves when it reaches an end of the path (TS `MotionPathLoopMode`), a closed
/// string union. `Clamp` stops at the ends; `Loop` wraps modulo the path length; `Pingpong`
/// reflects at each end and reverses `direction`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MotionPathLoopMode {
    #[default]
    Clamp,
    Loop,
    Pingpong,
}

/// The marker's travel direction (TS `1 | -1`), a closed representation. `Forward` traverses from
/// the path start; `Backward` travels toward it. Direction is stored rather than folded into a
/// signed speed because `Pingpong` must remember which way the marker is heading across frames.
/// The discriminants are the source's numeric values, so `direction as i8 as f64` is the signed
/// travel factor.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(i8)]
pub enum MotionPathDirection {
    #[default]
    Forward = 1,
    Backward = -1,
}

/// A marker's arc-length position and traversal state along a `Path` (TS `MotionPath`, an Entity).
/// `distance` is kept in `[0, length]`; `length` is the path's total arc length cached once at
/// creation. `speed` is a magnitude — the travel sign lives in `direction`. The `path` handle is the
/// source's retained object reference.
// flight-lint: allow(f64) D1: distance, length, speed and tolerance flow through flight-path's f64 arc-length API; rounding to f32 would change end and loop boundary comparisons
pub struct MotionPath {
    runtime: EntityRuntimeSlot,
    pub direction: MotionPathDirection,
    pub distance: f64,
    pub length: f64,
    pub loop_mode: MotionPathLoopMode,
    pub path: Ref<Path>,
    pub speed: f64,
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `MotionPathLoopMode` literal union; the TS package exports no get_/parse_ free functions
pub fn get_motion_path_loop_mode_string(value: MotionPathLoopMode) -> &'static str {
    return match value {
        MotionPathLoopMode::Clamp => "clamp",
        MotionPathLoopMode::Loop => "loop",
        MotionPathLoopMode::Pingpong => "pingpong",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `MotionPathLoopMode` literal union; the TS package exports no get_/parse_ free functions
pub fn parse_motion_path_loop_mode(value: &str) -> Option<MotionPathLoopMode> {
    return match value {
        "clamp" => Some(MotionPathLoopMode::Clamp),
        "loop" => Some(MotionPathLoopMode::Loop),
        "pingpong" => Some(MotionPathLoopMode::Pingpong),
        _ => None,
    };
}

// D12 allocation bootstrap: `initialize_motion_path` immediately replaces every field.
impl Default for MotionPath {
    fn default() -> Self {
        return MotionPath {
            runtime: EntityRuntimeSlot::default(),
            direction: MotionPathDirection::Forward,
            distance: 0.0,
            length: 0.0,
            loop_mode: MotionPathLoopMode::Clamp,
            path: Ref::new(RwLock::new(create_path(Some(
                flight_path::PathWinding::NonZero,
            )))),
            speed: 0.0,
        };
    }
}

flight_entity::impl_entity!(MotionPath);
