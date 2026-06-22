use flighthq_types::SpritesheetAnimation;

/// Builder options for [`create_spritesheet_animation`].
#[derive(Clone, Debug, Default)]
pub struct CreateSpritesheetAnimationOptions {
    pub frame_duration: Option<f32>,
    pub frames: Option<Vec<u32>>,
    pub loop_: Option<bool>,
    pub origin_x: Option<f32>,
    pub origin_y: Option<f32>,
}

/// Creates a new [`SpritesheetAnimation`] with the given options, using
/// defaults for any fields that are not supplied.
///
/// Defaults:
/// - `frame_duration`: `0.0`
/// - `frames`: empty
/// - `loop_`: `false`
/// - `origin_x`: `0.0`
/// - `origin_y`: `0.0`
pub fn create_spritesheet_animation(
    options: CreateSpritesheetAnimationOptions,
) -> SpritesheetAnimation {
    SpritesheetAnimation {
        frame_duration: options.frame_duration.unwrap_or(0.0),
        frames: options.frames.unwrap_or_default(),
        loop_: options.loop_.unwrap_or(false),
        origin_x: options.origin_x.unwrap_or(0.0),
        origin_y: options.origin_y.unwrap_or(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_spritesheet_animation_defaults() {
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions::default());
        assert_eq!(anim.frame_duration, 0.0);
        assert!(anim.frames.is_empty());
        assert!(!anim.loop_);
        assert_eq!(anim.origin_x, 0.0);
        assert_eq!(anim.origin_y, 0.0);
    }

    #[test]
    fn create_spritesheet_animation_overrides() {
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            frame_duration: Some(100.0),
            loop_: Some(true),
            frames: Some(vec![0, 1, 2]),
            ..Default::default()
        });
        assert_eq!(anim.frame_duration, 100.0);
        assert!(anim.loop_);
        assert_eq!(anim.frames, vec![0, 1, 2]);
        assert_eq!(anim.origin_x, 0.0);
        assert_eq!(anim.origin_y, 0.0);
    }

    #[test]
    fn create_spritesheet_animation_origin_overrides() {
        let anim = create_spritesheet_animation(CreateSpritesheetAnimationOptions {
            origin_x: Some(16.0),
            origin_y: Some(32.0),
            ..Default::default()
        });
        assert_eq!(anim.origin_x, 16.0);
        assert_eq!(anim.origin_y, 32.0);
    }

    #[test]
    fn create_spritesheet_animation_does_not_share_frames() {
        let mut a = create_spritesheet_animation(CreateSpritesheetAnimationOptions::default());
        let b = create_spritesheet_animation(CreateSpritesheetAnimationOptions::default());
        a.frames.push(99);
        assert!(b.frames.is_empty());
    }
}
