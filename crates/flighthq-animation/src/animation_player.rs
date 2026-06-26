use flighthq_types::{AnimationClip, AnimationPlayer};

// Options for creating an AnimationPlayer. Defaults: looping, playing, speed 1, time 0.
pub struct AnimationPlayerOpts {
    pub loop_: Option<bool>,
    pub playing: Option<bool>,
    pub speed: Option<f32>,
    pub time: Option<f32>,
}

// Advances the playhead by `dt` seconds (scaled by `speed`; negative plays backward). When `loop_`,
// time wraps modulo the clip duration; otherwise it clamps to [0, duration] and clears `playing` when
// it reaches an end. No-op while paused or when the clip has zero duration. The app calls this each
// frame — nothing advances on its own.
pub fn advance_animation_player(player: &mut AnimationPlayer, dt: f32) {
    if !player.playing {
        return;
    }
    let duration = player.clip.duration;
    if duration <= 0.0 {
        player.time = 0.0;
        return;
    }
    let mut time = player.time + dt * player.speed;
    if player.loop_ {
        time %= duration;
        if time < 0.0 {
            time += duration;
        }
    } else if time >= duration {
        time = duration;
        player.playing = false;
    } else if time < 0.0 {
        time = 0.0;
        player.playing = false;
    }
    player.time = time;
}

// Allocates a player over `clip`. Defaults: looping, playing, speed 1, time 0.
pub fn create_animation_player(
    clip: AnimationClip,
    opts: Option<AnimationPlayerOpts>,
) -> AnimationPlayer {
    AnimationPlayer {
        clip,
        loop_: opts.as_ref().and_then(|o| o.loop_).unwrap_or(true),
        playing: opts.as_ref().and_then(|o| o.playing).unwrap_or(true),
        speed: opts.as_ref().and_then(|o| o.speed).unwrap_or(1.0),
        time: opts.as_ref().and_then(|o| o.time).unwrap_or(0.0),
    }
}

// Sets the playhead to `time`, clamped to [0, clip.duration]. Does not change `playing`.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::animation_clip::create_animation_clip;

    fn make_player(duration: f32, opts: Option<AnimationPlayerOpts>) -> AnimationPlayer {
        create_animation_player(create_animation_clip(vec![], Some(duration)), opts)
    }

    #[test]
    fn advance_animation_player_advances_playhead_by_dt_times_speed() {
        let mut p = make_player(
            10.0,
            Some(AnimationPlayerOpts {
                loop_: Some(false),
                playing: None,
                speed: Some(2.0),
                time: None,
            }),
        );
        advance_animation_player(&mut p, 1.0);
        assert!((p.time - 2.0).abs() < 1e-6);
    }

    #[test]
    fn advance_animation_player_clamps_and_stops_at_end_when_not_looping() {
        let mut p = make_player(
            10.0,
            Some(AnimationPlayerOpts {
                loop_: Some(false),
                playing: None,
                speed: None,
                time: Some(9.0),
            }),
        );
        advance_animation_player(&mut p, 5.0);
        assert!((p.time - 10.0).abs() < 1e-6);
        assert!(!p.playing);
    }

    #[test]
    fn advance_animation_player_is_no_op_while_paused() {
        let mut p = make_player(
            10.0,
            Some(AnimationPlayerOpts {
                loop_: None,
                playing: Some(false),
                speed: None,
                time: Some(3.0),
            }),
        );
        advance_animation_player(&mut p, 5.0);
        assert!((p.time - 3.0).abs() < 1e-6);
    }

    #[test]
    fn advance_animation_player_wraps_modulo_duration_when_looping() {
        let mut p = make_player(
            10.0,
            Some(AnimationPlayerOpts {
                loop_: Some(true),
                playing: None,
                speed: None,
                time: Some(9.0),
            }),
        );
        advance_animation_player(&mut p, 3.0);
        assert!((p.time - 2.0).abs() < 1e-5);
        assert!(p.playing);
    }

    #[test]
    fn create_animation_player_defaults_to_looping_playing_speed1_time0() {
        let p = make_player(5.0, None);
        assert!(p.loop_);
        assert!(p.playing);
        assert!((p.speed - 1.0).abs() < 1e-6);
        assert!((p.time - 0.0).abs() < 1e-6);
    }

    #[test]
    fn seek_animation_player_clamps_playhead_to_0_duration() {
        let mut p = make_player(10.0, None);
        seek_animation_player(&mut p, 4.0);
        assert!((p.time - 4.0).abs() < 1e-6);
        seek_animation_player(&mut p, -1.0);
        assert!((p.time - 0.0).abs() < 1e-6);
        seek_animation_player(&mut p, 99.0);
        assert!((p.time - 10.0).abs() < 1e-6);
    }
}
