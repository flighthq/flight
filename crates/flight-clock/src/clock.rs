use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{FrameTick, clear_signal, emit_signal};

use crate::types::{Clock, ClockOptions};

/// Allocates a child clock and attaches it to `parent` in one step. Equivalent to `create_clock`
/// followed by `add_clock_child`; the child inherits `parent`'s scale and pause state through the
/// `advance_clock` cascade.
pub fn create_child_clock(parent: &Ref<Clock>, options: Option<&ClockOptions>) -> Ref<Clock> {
    let child = create_clock();
    // D23 (B): the canonical create takes no fields; the requested ones are assigned after it.
    if let Some(options) = options {
        let mut current = child.write().unwrap();
        if let Some(scale) = options.scale {
            current.scale = scale;
        }
        if let Some(paused) = options.paused {
            current.paused = paused;
        }
    }
    add_clock_child(parent, &child);
    return child;
}

/// Allocates a root clock (no parent), realtime and running. Assign `scale` / `paused` after create
/// to start scaled or paused. Drive it each frame with `advance_clock(&clock, dt_ms)`.
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 21f7557f, foreman-a8ca6cf2): assign scale and paused after create
pub fn create_clock() -> Ref<Clock> {
    let mut out: Clock = allocate_entity();
    initialize_clock(&mut out);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_clock`: scale 1, not paused, zeroed times, no parent, no
/// children, no `on_tick`.
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 21f7557f, foreman-a8ca6cf2)
pub fn initialize_clock(out: &mut Clock) {
    out.scale = 1.0;
    out.paused = false;
    out.delta_time = 0.0;
    out.elapsed = 0.0;
    out.parent = None;
    out.children = Vec::new();
    out.on_tick = None;
}

/// Attaches `child` under `parent`, detaching it from any previous parent first (reparent-safe).
/// After this, advancing `parent` cascades into `child`. A no-op if `child` is already parented here.
/// Locks are taken one at a time, never nested, so a clock may be attached under itself as in TS.
pub fn add_clock_child(parent: &Ref<Clock>, child: &Ref<Clock>) {
    let current = child.read().unwrap().parent.clone();
    if let Some(current) = current {
        if Arc::ptr_eq(&current, parent) {
            return;
        }
        remove_clock_child(&current, child);
    }
    child.write().unwrap().parent = Some(parent.clone());
    parent.write().unwrap().children.push(child.clone());
}

/// Advances a clock tree by one step. `delta_time` is the real elapsed milliseconds for a root clock
/// (the value the frame loop supplies); the cascade feeds each child its parent's already-scaled
/// delta. Each clock's scaled delta is `paused ? 0 : delta_time * scale`; that becomes its
/// `delta_time`, accumulates into `elapsed`, emits its (opt-in) `on_tick`, and drives its children.
/// Pre-order: a clock's `on_tick` fires before its children advance. No lock is held while `on_tick`
/// runs or a child advances, and children are read by index on each step, so a slot may re-enter
/// any clock operation and attach or detach children mid-pass, as in TS.
// flight-lint: allow(f64) the caller-supplied millisecond delta (see `Clock`)
pub fn advance_clock(clock: &Ref<Clock>, delta_time: f64) {
    let (scaled_delta, on_tick) = {
        let mut current = clock.write().unwrap();
        let scaled_delta = if current.paused {
            0.0
        } else {
            delta_time * current.scale
        };
        current.delta_time = scaled_delta;
        current.elapsed += scaled_delta;
        (scaled_delta, current.on_tick.clone())
    };
    if let Some(on_tick) = on_tick {
        emit_signal(
            &on_tick,
            &FrameTick {
                delta_time: scaled_delta,
            },
        );
    }
    let mut index = 0;
    loop {
        let child = {
            let current = clock.read().unwrap();
            if index >= current.children.len() {
                break;
            }
            current.children[index].clone()
        };
        advance_clock(&child, scaled_delta);
        index += 1;
    }
}

/// Detaches a clock from its parent, releases its children, and drops any `on_tick` listeners, so
/// nothing keeps the subtree (or the clock's subscribers) reachable through it: the parent no longer
/// references this clock, each child becomes a root, and the `on_tick` slot list is cleared. The
/// public children collection is cleared in place so its identity is preserved in the target. This
/// breaks the strong parent/child cycle (A2); the memory frees when the last `Ref` drops.
pub fn dispose_clock(clock: &Ref<Clock>) {
    let parent = clock.read().unwrap().parent.clone();
    if let Some(parent) = parent {
        remove_clock_child(&parent, clock);
    }
    let (children, on_tick) = {
        let mut current = clock.write().unwrap();
        let children = current.children.to_vec();
        current.children.clear();
        (children, current.on_tick.clone())
    };
    for child in &children {
        child.write().unwrap().parent = None;
    }
    if let Some(on_tick) = on_tick {
        clear_signal(&on_tick);
    }
}

/// The clock's realtime rate accounting for the hierarchy: the product of its own scale and every
/// ancestor's scale. A root clock's effective scale is just its own.
// flight-lint: allow(f64) the clock's f64 scale (see `Clock`)
pub fn get_clock_effective_scale(clock: &Clock) -> f64 {
    let mut scale = clock.scale;
    let mut current = clock.parent.clone();
    while let Some(parent) = current {
        let parent = parent.read().unwrap();
        scale *= parent.scale;
        current = parent.parent.clone();
    }
    return scale;
}

/// The clock's parent, or None if it is a root. Hierarchy is changed through `add_clock_child` /
/// `remove_clock_child`, not by assigning the field.
pub fn get_clock_parent(clock: &Clock) -> Option<Ref<Clock>> {
    return clock.parent.clone();
}

/// Whether this clock receives a zero delta on the next advance: true if the clock itself or any
/// ancestor is paused. A clock can be locally running yet effectively paused.
pub fn is_clock_effectively_paused(clock: &Clock) -> bool {
    if clock.paused {
        return true;
    }
    let mut current = clock.parent.clone();
    while let Some(parent) = current {
        let parent = parent.read().unwrap();
        if parent.paused {
            return true;
        }
        current = parent.parent.clone();
    }
    return false;
}

/// Pauses the clock: it and its whole subtree receive a zero delta on subsequent advances. Local
/// state: a child paused this way stays paused even if its parent resumes.
pub fn pause_clock(clock: &mut Clock) {
    clock.paused = true;
}

/// Detaches `child` from `parent`, making it a root clock again. A no-op if `child` is not a child of
/// `parent`. Locks are taken one at a time, never nested.
pub fn remove_clock_child(parent: &Ref<Clock>, child: &Ref<Clock>) {
    {
        let mut current = parent.write().unwrap();
        let Some(index) = current.children.iter().position(|c| Arc::ptr_eq(c, child)) else {
            return;
        };
        current.children.remove(index);
    }
    child.write().unwrap().parent = None;
}

/// Clears the clock's accumulated time back to the start: `elapsed` and `delta_time` become 0. Does
/// not touch scale, pause, the hierarchy, or children.
pub fn reset_clock(clock: &mut Clock) {
    clock.elapsed = 0.0;
    clock.delta_time = 0.0;
}

/// Resumes a locally-paused clock. It still receives a zero delta while any ancestor stays paused.
pub fn resume_clock(clock: &mut Clock) {
    clock.paused = false;
}

/// Sets the clock's local time scale (1 = realtime, 0.5 = half speed, 2 = double, 0 = frozen without
/// the paused flag). Composes with ancestors on the next advance.
// flight-lint: allow(f64) the clock's f64 scale (see `Clock`)
pub fn set_clock_scale(clock: &mut Clock, scale: f64) {
    clock.scale = scale;
}
