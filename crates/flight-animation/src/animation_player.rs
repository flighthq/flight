use std::any::Any;
use std::rc::Rc;

use flight_signals::{create_signal, emit_signal};

use crate::types::*;

pub fn advance_animation_player(player: &mut AnimationPlayer, dt: f32) {
    if !player.playing {
        return;
    }
    let duration = player.clip.duration;
    if duration <= 0.0 {
        player.time = 0.0;
        return;
    }
    let from_time = player.time;
    let mut time = player.time + dt * player.speed;

    if !player.loop_enabled {
        if time >= duration {
            emit_animation_player_events(player, from_time, duration, false);
            player.time = duration;
            player.playing = false;
            emit_animation_player_finished(player);
        } else if time < 0.0 {
            emit_animation_player_events(player, from_time, 0.0, false);
            player.time = 0.0;
            player.playing = false;
            emit_animation_player_finished(player);
        } else {
            emit_animation_player_events(player, from_time, time, false);
            player.time = time;
        }
        return;
    }

    let mut looped = false;
    let mut segment_start = from_time;
    let mut include_segment_start = false;

    if player.loop_mode == AnimationLoopMode::PingPong {
        loop {
            if time > duration {
                emit_animation_player_events(player, segment_start, duration, include_segment_start);
                if !consume_animation_player_loop(player) {
                    finish_animation_player_at(player, duration);
                    return;
                }
                time = 2.0 * duration - time;
                player.speed = -player.speed;
                segment_start = duration;
                include_segment_start = false;
                looped = true;
            } else if time < 0.0 {
                emit_animation_player_events(player, segment_start, 0.0, include_segment_start);
                if !consume_animation_player_loop(player) {
                    finish_animation_player_at(player, 0.0);
                    return;
                }
                time = -time;
                player.speed = -player.speed;
                segment_start = 0.0;
                include_segment_start = false;
                looped = true;
            } else {
                break;
            }
        }
        emit_animation_player_events(player, segment_start, time, include_segment_start);
    } else {
        // Repeat mode
        while time >= duration {
            emit_animation_player_events(player, segment_start, duration, include_segment_start);
            if !consume_animation_player_loop(player) {
                finish_animation_player_at(player, duration);
                return;
            }
            time -= duration;
            segment_start = 0.0;
            include_segment_start = true;
            looped = true;
        }
        while time < 0.0 {
            emit_animation_player_events(player, segment_start, 0.0, include_segment_start);
            if !consume_animation_player_loop(player) {
                finish_animation_player_at(player, 0.0);
                return;
            }
            time += duration;
            segment_start = duration;
            include_segment_start = true;
            looped = true;
        }
        emit_animation_player_events(player, segment_start, time, include_segment_start);
    }

    player.time = time;
    if looped {
        emit_animation_player_looped(player);
    }
}

pub fn clone_animation_player(player: &AnimationPlayer) -> AnimationPlayer {
    return AnimationPlayer {
        clip: player.clip.clone(),
        loop_enabled: player.loop_enabled,
        loop_mode: player.loop_mode,
        on_event: None,
        on_finished: None,
        on_looped: None,
        playing: player.playing,
        repeat_count: player.repeat_count,
        speed: player.speed,
        time: player.time,
    };
}

pub fn create_animation_player(
    clip: AnimationClip,
    opts: Option<&AnimationPlayerOptions>,
) -> AnimationPlayer {
    let mut out = AnimationPlayer::default();
    initialize_animation_player(&mut out, clip, opts);
    return out;
}

pub fn enable_animation_player_signals(player: &mut AnimationPlayer) {
    if player.on_event.is_none() {
        player.on_event = Some(create_signal());
    }
    if player.on_finished.is_none() {
        player.on_finished = Some(create_signal());
    }
    if player.on_looped.is_none() {
        player.on_looped = Some(create_signal());
    }
}

pub fn get_animation_player_normalized_time(player: &AnimationPlayer) -> f32 {
    let duration = player.clip.duration;
    if duration <= 0.0 {
        return 0.0;
    }
    let n = player.time / duration;
    return if n < 0.0 {
        0.0
    } else if n > 1.0 {
        1.0
    } else {
        n
    };
}

pub fn initialize_animation_player(
    out: &mut AnimationPlayer,
    clip: AnimationClip,
    opts: Option<&AnimationPlayerOptions>,
) {
    out.clip = Rc::new(clip);
    out.loop_enabled = opts.and_then(|o| o.loop_enabled).unwrap_or(true);
    out.loop_mode = opts
        .and_then(|o| o.loop_mode)
        .unwrap_or(AnimationLoopMode::Repeat);
    out.on_event = None;
    out.on_finished = None;
    out.on_looped = None;
    out.playing = opts.and_then(|o| o.playing).unwrap_or(true);
    out.repeat_count = opts.and_then(|o| o.repeat_count).unwrap_or(-1);
    out.speed = opts.and_then(|o| o.speed).unwrap_or(1.0);
    out.time = opts.and_then(|o| o.time).unwrap_or(0.0);
}

pub fn play_animation_player(player: &mut AnimationPlayer) {
    player.playing = true;
}

pub fn seek_animation_player(player: &mut AnimationPlayer, time: f32) {
    let duration = player.clip.duration;
    player.time = if time < 0.0 {
        0.0
    } else if time > duration {
        duration
    } else {
        time
    };
}

pub fn stop_animation_player(player: &mut AnimationPlayer) {
    player.playing = false;
    player.time = 0.0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn consume_animation_player_loop(player: &mut AnimationPlayer) -> bool {
    let rc = player.repeat_count;
    if rc < 0 {
        return true;
    }
    if rc == 0 {
        return false;
    }
    player.repeat_count = rc - 1;
    return true;
}

fn emit_animation_player_finished(player: &AnimationPlayer) {
    if let Some(ref signal) = player.on_finished {
        emit_signal(signal, Rc::new(()) as Rc<dyn Any>);
    }
}

fn emit_animation_player_events(
    player: &AnimationPlayer,
    from_time: f32,
    to_time: f32,
    include_from: bool,
) {
    let signal = match &player.on_event {
        Some(s) => s,
        None => return,
    };
    let events = &player.clip.events;
    if events.is_empty() {
        return;
    }
    if to_time > from_time {
        for event in events.iter() {
            if event.time > to_time {
                break;
            }
            if event.time > from_time || (include_from && event.time == from_time) {
                emit_signal(signal, Rc::new(event.clone()) as Rc<dyn Any>);
            }
        }
        return;
    }
    if to_time < from_time {
        for index in (0..events.len()).rev() {
            let event = &events[index];
            if event.time < to_time {
                break;
            }
            if event.time < from_time || (include_from && event.time == from_time) {
                emit_signal(signal, Rc::new(event.clone()) as Rc<dyn Any>);
            }
        }
        return;
    }
    if !include_from {
        return;
    }
    for event in events.iter() {
        if event.time == from_time {
            emit_signal(signal, Rc::new(event.clone()) as Rc<dyn Any>);
        } else if event.time > from_time {
            break;
        }
    }
}

fn emit_animation_player_looped(player: &AnimationPlayer) {
    if let Some(ref signal) = player.on_looped {
        emit_signal(signal, Rc::new(()) as Rc<dyn Any>);
    }
}

fn finish_animation_player_at(player: &mut AnimationPlayer, time: f32) {
    player.time = time;
    player.playing = false;
    emit_animation_player_finished(player);
}
