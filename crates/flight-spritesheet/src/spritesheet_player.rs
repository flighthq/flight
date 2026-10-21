use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_signals::{clear_signal, create_signal, emit_signal};

use crate::types::*;

pub fn create_spritesheet_player(obj: Option<SpritesheetPlayerOptions>) -> Ref<SpritesheetPlayer> {
    let mut out: SpritesheetPlayer = allocate_entity();
    initialize_spritesheet_player(&mut out, obj);
    return Arc::new(RwLock::new(out));
}

/// The construction initializer of `create_spritesheet_player`: each field from `obj` (provided
/// signals and queue used directly), or an idle complete player at speed 1 with fresh signals.
// flight-lint: allow(f64) D1: elapsed time, speed and the display index are JS numbers
pub fn initialize_spritesheet_player(
    out: &mut SpritesheetPlayer,
    obj: Option<SpritesheetPlayerOptions>,
) {
    let obj = obj.unwrap_or_default();
    out.animation = obj.animation;
    out.complete = obj.complete.unwrap_or(true);
    out.elapsed = obj.elapsed.unwrap_or(0.0);
    out.frame_index = obj.frame_index.unwrap_or(0.0);
    out.on_complete = obj.on_complete.unwrap_or_else(create_signal);
    out.on_loop = obj.on_loop.unwrap_or_else(create_signal);
    out.paused = obj.paused.unwrap_or(false);
    out.queue = obj.queue.unwrap_or_default();
    out.speed = obj.speed.unwrap_or(1.0);
}

/// A pooled player reset to an idle, complete state (its signals were cleared on release), or a new
/// one when the pool is empty. Pair every acquire with one release.
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module pool
pub fn acquire_spritesheet_player(pool: &mut SpritesheetPlayerPool) -> Ref<SpritesheetPlayer> {
    let Some(player) = pool.players.pop() else {
        return create_spritesheet_player(None);
    };
    {
        let mut p = player.write().unwrap();
        p.animation = None;
        p.complete = true;
        p.elapsed = 0.0;
        p.frame_index = 0.0;
        p.paused = false;
        p.queue.clear();
        p.speed = 1.0;
    }
    return player;
}

/// A new player sharing the current animation, with the same head state, a copy of the queue (the
/// same animations) and fresh signals.
pub fn clone_spritesheet_player(player: &SpritesheetPlayer) -> Ref<SpritesheetPlayer> {
    let mut out: SpritesheetPlayer = allocate_entity();
    out.animation = player.animation.clone();
    out.complete = player.complete;
    out.elapsed = player.elapsed;
    out.frame_index = player.frame_index;
    out.on_complete = create_signal();
    out.on_loop = create_signal();
    out.paused = player.paused;
    out.queue = player.queue.clone();
    out.speed = player.speed;
    return Arc::new(RwLock::new(out));
}

/// Disconnects both signals and drops the animation and queue, leaving the player complete.
pub fn dispose_spritesheet_player(player: &mut SpritesheetPlayer) {
    clear_signal(&player.on_complete);
    clear_signal(&player.on_loop);
    player.animation = None;
    player.complete = true;
    player.queue.clear();
}

// The cumulative virtual-frame start times [0, d0, d0+d1, ..., total] of a variable-duration
// animation, computed once per animation and kept (the source's module WeakMap). The total falls back
// to 1 when it is 0 or NaN.
// flight-lint: allow(f64) D1: millisecond timings are JS numbers
fn get_cumulative_durations(animation: &SpritesheetAnimation) -> Arc<Vec<f64>> {
    let mut cache = animation.cumulative_durations.lock().unwrap();
    if let Some(cached) = cache.as_ref() {
        return cached.clone();
    }
    let virtual_count = resolve_virtual_frame_count(animation);
    let durations = animation.frame_durations.as_deref().unwrap_or(&[]);
    let mut out = vec![0.0; virtual_count + 1];
    let mut t = 0.0;
    for (vi, slot) in out.iter_mut().take(virtual_count).enumerate() {
        *slot = t;
        let display_index = resolve_virtual_index_to_display_index(animation, vi as f64);
        t += *js_index(durations, display_index).unwrap_or(&animation.frame_duration);
    }
    out[virtual_count] = js_or(t, 1.0);
    let out = Arc::new(out);
    *cache = Some(out.clone());
    return out;
}

/// The sheet frame at the playhead, or `None` without frames or when the reference resolves no frame.
pub fn get_spritesheet_player_frame(
    player: &SpritesheetPlayer,
    spritesheet: &Spritesheet,
) -> Option<Ref<SpritesheetFrame>> {
    let animation = player.animation.as_ref()?.read().unwrap();
    if animation.frames.is_empty() {
        return None;
    }
    let sprite_frame_index = js_index(&animation.frames, player.frame_index)?;
    return js_index(&spritesheet.frames, *sprite_frame_index).cloned();
}

/// The sheet frame `frame_offset` frames from the playhead, wrapping within the animation, without
/// moving the playhead; `None` without frames.
// flight-lint: allow(f64) D1: the offset joins the JS-number display index
pub fn get_spritesheet_player_frame_at(
    player: &SpritesheetPlayer,
    spritesheet: &Spritesheet,
    frame_offset: f64,
) -> Option<Ref<SpritesheetFrame>> {
    let animation = player.animation.as_ref()?.read().unwrap();
    if animation.frames.is_empty() {
        return None;
    }
    let n = animation.frames.len() as f64;
    let target = (((player.frame_index + frame_offset) % n) + n) % n;
    let sprite_frame_index = js_index(&animation.frames, target)?;
    return js_index(&spritesheet.frames, *sprite_frame_index).cloned();
}

// JS `array[index]` with a number index: only an integral, in-range index resolves.
// flight-lint: allow(f64) D1: JS numbers index arrays
fn js_index<T>(values: &[T], index: f64) -> Option<&T> {
    if index.fract() != 0.0 || index < 0.0 || !index.is_finite() {
        return None;
    }
    return values.get(index as usize);
}

// JS `Math.max` of two numbers: NaN propagates.
// flight-lint: allow(f64) D1: JS Math semantics
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    return a.max(b);
}

// JS `Math.min` of two numbers: NaN propagates.
// flight-lint: allow(f64) D1: JS Math semantics
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    return a.min(b);
}

// JS `value || fallback` for a number: 0, -0 and NaN are falsy.
// flight-lint: allow(f64) D1: JS truthiness
fn js_or(value: f64, fallback: f64) -> f64 {
    if value == 0.0 || value.is_nan() {
        return fallback;
    }
    return value;
}

pub fn pause_spritesheet_player(player: &mut SpritesheetPlayer) {
    player.paused = true;
}

/// Starts `animation` from the beginning (clearing the queue); `None` leaves the player complete.
/// With `restart` false (default true), asking for the animation already playing is a no-op.
pub fn play_spritesheet_animation(
    player: &mut SpritesheetPlayer,
    animation: Option<&Ref<SpritesheetAnimation>>,
    restart: Option<bool>,
) {
    let same = match (animation, &player.animation) {
        (None, None) => true,
        (Some(a), Some(b)) => Arc::ptr_eq(a, b),
        _ => false,
    };
    if !restart.unwrap_or(true) && same {
        return;
    }
    player.animation = animation.cloned();
    player.complete = animation.is_none();
    player.elapsed = 0.0;
    player.frame_index = 0.0;
    player.queue.clear();
}

/// Appends `animation` to the queue.
pub fn queue_spritesheet_animation(
    player: &mut SpritesheetPlayer,
    animation: &Ref<SpritesheetAnimation>,
) {
    player.queue.push(animation.clone());
}

/// Disconnects both signals, resets the player to idle and returns it to the pool (a player released
/// twice is pooled twice, as in the source).
// flight-lint: allow(conform-params) D5: caller-owned pool replaces the source module pool
pub fn release_spritesheet_player(
    pool: &mut SpritesheetPlayerPool,
    player: &Ref<SpritesheetPlayer>,
) {
    {
        let mut p = player.write().unwrap();
        clear_signal(&p.on_complete);
        clear_signal(&p.on_loop);
        p.animation = None;
        p.complete = true;
        p.elapsed = 0.0;
        p.frame_index = 0.0;
        p.paused = false;
        p.queue.clear();
        p.speed = 1.0;
    }
    pool.players.push(player.clone());
}

// One full virtual loop's duration (ms), falling back to 1 when it is 0 or NaN.
// flight-lint: allow(f64) D1: millisecond timings are JS numbers
fn resolve_animation_total_time(animation: &SpritesheetAnimation) -> f64 {
    if animation.frame_durations.is_some() {
        let cumulative = get_cumulative_durations(animation);
        return cumulative[cumulative.len() - 1];
    }
    return js_or(
        resolve_virtual_frame_count(animation) as f64 * animation.frame_duration,
        1.0,
    );
}

// The first virtual index whose direction-aware mapping shows `display_index`.
// flight-lint: allow(f64) D1: virtual and display indices are JS numbers
fn resolve_display_index_to_first_virtual_index(
    animation: &SpritesheetAnimation,
    display_index: f64,
) -> f64 {
    return match animation.direction {
        SpritesheetAnimationDirection::Forward | SpritesheetAnimationDirection::Pingpong => {
            display_index
        }
        SpritesheetAnimationDirection::Reverse | SpritesheetAnimationDirection::PingpongReverse => {
            animation.frames.len() as f64 - 1.0 - display_index
        }
    };
}

// flight-lint: allow(f64) D1: elapsed time and the display index are JS numbers
fn resolve_frame_index_from_elapsed(animation: &SpritesheetAnimation, elapsed: f64) -> f64 {
    let time_in_loop = elapsed % resolve_animation_total_time(animation);
    let virtual_index = resolve_virtual_index_from_time(animation, time_in_loop);
    return resolve_virtual_index_to_display_index(animation, virtual_index);
}

// Pingpong directions visit the endpoints once per loop: n frames give 2n - 2 virtual frames.
fn resolve_virtual_frame_count(animation: &SpritesheetAnimation) -> usize {
    let n = animation.frames.len();
    let pingpong = matches!(
        animation.direction,
        SpritesheetAnimationDirection::Pingpong | SpritesheetAnimationDirection::PingpongReverse
    );
    if pingpong && n > 1 {
        return 2 * n - 2;
    }
    return n;
}

// The virtual frame at `time_in_loop`: a binary search of the cumulative start times for variable
// durations, else the uniform step clamped to the last virtual frame.
// flight-lint: allow(f64) D1: millisecond timings and indices are JS numbers
fn resolve_virtual_index_from_time(animation: &SpritesheetAnimation, time_in_loop: f64) -> f64 {
    let virtual_count = resolve_virtual_frame_count(animation) as i64;
    if animation.frame_durations.is_some() {
        let cumulative = get_cumulative_durations(animation);
        let mut lo: i64 = 0;
        let mut hi: i64 = virtual_count - 1;
        while lo < hi {
            let mid = (lo + hi + 1) >> 1;
            if cumulative[mid as usize] <= time_in_loop {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        return lo as f64;
    }
    return js_min(
        (time_in_loop / animation.frame_duration).floor(),
        virtual_count as f64 - 1.0,
    );
}

// The start time of a virtual frame (an index the cumulative table lacks reads as NaN, the source's
// `undefined`).
// flight-lint: allow(f64) D1: millisecond timings and indices are JS numbers
fn resolve_virtual_index_start_time(animation: &SpritesheetAnimation, virtual_index: f64) -> f64 {
    if animation.frame_durations.is_some() {
        let cumulative = get_cumulative_durations(animation);
        return js_index(&cumulative, virtual_index)
            .copied()
            .unwrap_or(f64::NAN);
    }
    return virtual_index * animation.frame_duration;
}

// The display frame of a virtual index under the animation's direction.
// flight-lint: allow(f64) D1: virtual and display indices are JS numbers
fn resolve_virtual_index_to_display_index(
    animation: &SpritesheetAnimation,
    virtual_index: f64,
) -> f64 {
    let last = animation.frames.len() as f64 - 1.0;
    return match animation.direction {
        SpritesheetAnimationDirection::Forward => virtual_index,
        SpritesheetAnimationDirection::Reverse => last - virtual_index,
        SpritesheetAnimationDirection::Pingpong => {
            if virtual_index <= last {
                virtual_index
            } else {
                2.0 * last - virtual_index
            }
        }
        SpritesheetAnimationDirection::PingpongReverse => {
            if virtual_index <= last {
                last - virtual_index
            } else {
                virtual_index - last
            }
        }
    };
}

pub fn resume_spritesheet_player(player: &mut SpritesheetPlayer) {
    player.paused = false;
}

/// Moves the playhead to display frame `frame_index` (clamped to the frames) at the start of its
/// first occurrence in the direction sequence; a no-op without frames.
// flight-lint: allow(f64) D1: the display index is a JS number
pub fn seek_spritesheet_player_to_frame(player: &mut SpritesheetPlayer, frame_index: f64) {
    let Some(animation) = player.animation.clone() else {
        return;
    };
    let animation = animation.read().unwrap();
    if animation.frames.is_empty() {
        return;
    }
    let clamped = js_max(
        0.0,
        js_min(frame_index, animation.frames.len() as f64 - 1.0),
    );
    player.frame_index = clamped;
    let virtual_index = resolve_display_index_to_first_virtual_index(&animation, clamped);
    player.elapsed = resolve_virtual_index_start_time(&animation, virtual_index);
}

/// Moves the playhead to `time` ms (clamped to one loop) and its frame; a no-op without frames.
// flight-lint: allow(f64) D1: elapsed time is a JS number
pub fn seek_spritesheet_player_to_time(player: &mut SpritesheetPlayer, time: f64) {
    let Some(animation) = player.animation.clone() else {
        return;
    };
    let animation = animation.read().unwrap();
    if animation.frames.is_empty() {
        return;
    }
    let total_time = resolve_animation_total_time(&animation);
    player.elapsed = js_max(0.0, js_min(time, total_time));
    player.frame_index = resolve_frame_index_from_elapsed(&animation, player.elapsed);
}

/// Rewinds to the start, marks the player complete and clears the queue (the animation stays).
pub fn stop_spritesheet_player(player: &mut SpritesheetPlayer) {
    player.elapsed = 0.0;
    player.frame_index = 0.0;
    player.complete = true;
    player.queue.clear();
}

/// Advances the playhead by `delta_time * speed` ms. Returns `false` (doing nothing) without an
/// animation or frames, or when complete or paused. Past the repeat budget it switches to the next
/// queued animation from its start, or clamps to the last frame of the direction sequence, completes
/// and emits `on_complete`; otherwise it emits `on_loop` when a loop boundary was crossed and resolves
/// the frame.
// flight-lint: allow(f64) D1: frame time is a JS number of milliseconds
pub fn update_spritesheet_player(player: &mut SpritesheetPlayer, delta_time: f64) -> bool {
    let Some(animation_ref) = player.animation.clone() else {
        return false;
    };
    let animation = animation_ref.read().unwrap();
    if player.complete || player.paused || animation.frames.is_empty() {
        return false;
    }
    let total_time = resolve_animation_total_time(&animation);
    let prev_loop_count = (player.elapsed / total_time).floor();
    player.elapsed += delta_time * player.speed;
    let playback_time = if animation.repeat_count < 0 {
        f64::INFINITY
    } else {
        total_time * f64::from(animation.repeat_count + 1)
    };
    if player.elapsed >= playback_time {
        if !player.queue.is_empty() {
            let next = player.queue.remove(0);
            player.animation = Some(next);
            player.elapsed = 0.0;
            player.frame_index = 0.0;
            return true;
        }
        player.elapsed = playback_time;
        let last_virtual_index = resolve_virtual_frame_count(&animation) as f64 - 1.0;
        player.frame_index = resolve_virtual_index_to_display_index(&animation, last_virtual_index);
        player.complete = true;
        emit_signal(&player.on_complete, &());
        return true;
    }
    if (player.elapsed / total_time).floor() > prev_loop_count {
        emit_signal(&player.on_loop, &());
    }
    let time_in_loop = player.elapsed % total_time;
    let virtual_index = resolve_virtual_index_from_time(&animation, time_in_loop);
    player.frame_index = resolve_virtual_index_to_display_index(&animation, virtual_index);
    return true;
}
