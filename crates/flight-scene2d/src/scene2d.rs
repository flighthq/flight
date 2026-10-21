//! The Scene2D presentation context: its display root and back-pointer, view size, signals and
//! closed string tables (TS `scene2d.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_node::{NodeRef, get_node_root};
use flight_signals::{create_signal, emit_signal};

use crate::display_object::create_display_object;
use crate::types::*;

/// Allocates a scene with a fresh display-object root that points back to it (TS `createScene2D`).
/// The scene stays unbound; its runtime is allocated on first access.
pub fn create_scene2d(obj: Option<&Scene2DOptions>) -> Ref<Scene2D> {
    let root = create_display_object(None);
    let mut scene2d: Scene2D = allocate_entity();
    initialize_scene2d(&mut scene2d, root.clone(), obj);
    let scene2d = Arc::new(RwLock::new(scene2d));
    root.write().unwrap().node2d_runtime_mut().scene2d = Some(Arc::downgrade(&scene2d));
    return scene2d;
}

/// A runtime with no signals yet (TS `createScene2DRuntime`).
pub fn create_scene2d_runtime() -> Scene2DRuntime {
    return Scene2DRuntime {
        scene2d_signals: None,
    };
}

/// Allocates the scene's signal registry (TS `createScene2DSignals`).
pub fn create_scene2d_signals() -> Ref<Scene2DSignals> {
    let mut out: Scene2DSignals = allocate_entity();
    initialize_scene2d_signals(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_scene2d` (TS `initializeScene2D`).
pub fn initialize_scene2d(out: &mut Scene2D, root: Node2DRef, obj: Option<&Scene2DOptions>) {
    out.align = obj
        .and_then(|obj| obj.align)
        .unwrap_or(flight_layout::ViewportAlign::TopLeft);
    out.color = obj.and_then(|obj| obj.color);
    out.root = root;
    out.scale_mode = obj
        .and_then(|obj| obj.scale_mode)
        .unwrap_or(flight_node::ViewportScaleMode::NoScale);
    out.scene2d_height = obj.and_then(|obj| obj.scene2d_height).unwrap_or(550.0);
    out.scene2d_width = obj.and_then(|obj| obj.scene2d_width).unwrap_or(400.0);
}

/// The construction initializer of `create_scene2d_signals` (TS `initializeScene2DSignals`).
pub fn initialize_scene2d_signals(out: &mut Scene2DSignals) {
    out.on_fullscreen_changed = create_signal();
    out.on_orientation_changed = create_signal();
    out.on_resize = create_signal();
}

/// The scene's signals, created on first call and shared after (TS `enableScene2DSignals`).
pub fn enable_scene2d_signals(source: &mut Scene2D) -> Ref<Scene2DSignals> {
    let runtime = ensure_scene2d_runtime(source);
    if let Some(signals) = &runtime.scene2d_signals {
        return signals.clone();
    }
    let signals = create_scene2d_signals();
    runtime.scene2d_signals = Some(signals.clone());
    return signals;
}

fn ensure_scene2d_runtime(source: &mut Scene2D) -> &mut Scene2DRuntime {
    return source.state.get_or_insert_with(create_scene2d_runtime);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DAlign string union; the TS package exports no get_/parse_ free functions
pub fn get_scene2d_align_string(value: Scene2DAlign) -> &'static str {
    return match value {
        Scene2DAlign::Bottom => "bottom",
        Scene2DAlign::BottomLeft => "bottomleft",
        Scene2DAlign::BottomRight => "bottomright",
        Scene2DAlign::Left => "left",
        Scene2DAlign::Right => "right",
        Scene2DAlign::Top => "top",
        Scene2DAlign::TopLeft => "topleft",
        Scene2DAlign::TopRight => "topright",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DDisplayState string union; the TS package exports no get_/parse_ free functions
pub fn get_scene2d_display_state_string(value: Scene2DDisplayState) -> &'static str {
    return match value {
        Scene2DDisplayState::Fullscreen => "fullscreen",
        Scene2DDisplayState::FullscreenInteractive => "fullscreeninteractive",
        Scene2DDisplayState::Normal => "normal",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DQuality string union; the TS package exports no get_/parse_ free functions
pub fn get_scene2d_quality_string(value: Scene2DQuality) -> &'static str {
    return match value {
        Scene2DQuality::Best => "best",
        Scene2DQuality::High => "high",
        Scene2DQuality::Low => "low",
        Scene2DQuality::Medium => "medium",
    };
}

/// The scene a display node belongs to, or `None` when its root is not a scene's root (TS
/// `getScene2DRoot`): walks to the root and reads the back-pointer `create_scene2d` set there.
/// Only `create_scene2d` sets it, on the display object it allocates, so the root is read as that
/// display object.
pub fn get_scene2d_root(source: &Node2DRef) -> Option<Ref<Scene2D>> {
    let node: NodeRef = source.clone();
    let root = get_node_root(&node);
    let root = root.read().unwrap();
    let root = root.as_any().downcast_ref::<DisplayObject>()?;
    return root
        .node2d_runtime()
        .scene2d
        .as_ref()
        .and_then(|scene2d| scene2d.upgrade());
}

/// The scene's runtime, allocated on first access (TS `getScene2DRuntime`). Readers of enabled
/// signals should use `get_scene2d_signals`, which does not allocate.
pub fn get_scene2d_runtime(source: &mut Scene2D) -> &Scene2DRuntime {
    return ensure_scene2d_runtime(source);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DScaleMode string union; the TS package exports no get_/parse_ free functions
pub fn get_scene2d_scale_mode_string(value: Scene2DScaleMode) -> &'static str {
    return match value {
        Scene2DScaleMode::ExactFit => "exactfit",
        Scene2DScaleMode::NoBorder => "noborder",
        Scene2DScaleMode::NoScale => "noscale",
        Scene2DScaleMode::ShowAll => "showall",
    };
}

/// The scene's signals, or `None` until enabled (TS `getScene2DSignals`).
pub fn get_scene2d_signals(source: &Scene2D) -> Option<Ref<Scene2DSignals>> {
    return source
        .state
        .as_ref()
        .and_then(|runtime| runtime.scene2d_signals.clone());
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DAlign string union; the TS package exports no get_/parse_ free functions
pub fn parse_scene2d_align(value: &str) -> Option<Scene2DAlign> {
    return match value {
        "bottom" => Some(Scene2DAlign::Bottom),
        "bottomleft" => Some(Scene2DAlign::BottomLeft),
        "bottomright" => Some(Scene2DAlign::BottomRight),
        "left" => Some(Scene2DAlign::Left),
        "right" => Some(Scene2DAlign::Right),
        "top" => Some(Scene2DAlign::Top),
        "topleft" => Some(Scene2DAlign::TopLeft),
        "topright" => Some(Scene2DAlign::TopRight),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DDisplayState string union; the TS package exports no get_/parse_ free functions
pub fn parse_scene2d_display_state(value: &str) -> Option<Scene2DDisplayState> {
    return match value {
        "fullscreen" => Some(Scene2DDisplayState::Fullscreen),
        "fullscreeninteractive" => Some(Scene2DDisplayState::FullscreenInteractive),
        "normal" => Some(Scene2DDisplayState::Normal),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DQuality string union; the TS package exports no get_/parse_ free functions
pub fn parse_scene2d_quality(value: &str) -> Option<Scene2DQuality> {
    return match value {
        "best" => Some(Scene2DQuality::Best),
        "high" => Some(Scene2DQuality::High),
        "low" => Some(Scene2DQuality::Low),
        "medium" => Some(Scene2DQuality::Medium),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for the TS Scene2DScaleMode string union; the TS package exports no get_/parse_ free functions
pub fn parse_scene2d_scale_mode(value: &str) -> Option<Scene2DScaleMode> {
    return match value {
        "exactfit" => Some(Scene2DScaleMode::ExactFit),
        "noborder" => Some(Scene2DScaleMode::NoBorder),
        "noscale" => Some(Scene2DScaleMode::NoScale),
        "showall" => Some(Scene2DScaleMode::ShowAll),
        _ => None,
    };
}

/// Sets the view size and emits `on_resize` when enabled; a no-op when unchanged (TS
/// `setScene2DSize`). The scene is released before the signal is emitted, so listeners may read it.
// flight-lint: allow(f64) D1: the view size is a JS number compared exactly
pub fn set_scene2d_size(source: &Ref<Scene2D>, width: f64, height: f64) {
    let signals = {
        let mut scene2d = source.write().unwrap();
        if scene2d.scene2d_width == width && scene2d.scene2d_height == height {
            return;
        }
        scene2d.scene2d_width = width;
        scene2d.scene2d_height = height;
        get_scene2d_signals(&scene2d)
    };
    if let Some(signals) = signals {
        let on_resize = signals.read().unwrap().on_resize.clone();
        emit_signal(&on_resize, &());
    }
}
