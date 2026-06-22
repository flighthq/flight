/// Playback direction for a spritesheet animation clip.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SpritesheetAnimationDirection {
    #[default]
    Forward,
    Pingpong,
    PingpongReverse,
    Reverse,
}

/// Raw animation descriptor as parsed from a spritesheet file.
///
/// This is a plain data bag used by the format parsers
/// (`flighthq-spritesheet-formats`) to represent an animation before it is
/// converted into a [`flighthq_types::SpritesheetAnimation`].
#[derive(Clone, Debug)]
pub struct SpritesheetAnimationData {
    pub direction: SpritesheetAnimationDirection,
    /// Default duration (ms) per frame when `frame_durations` is `None`.
    pub frame_duration: f32,
    /// Per-frame durations (ms); `None` when all frames share `frame_duration`.
    pub frame_durations: Option<Vec<f32>>,
    pub frame_names: Vec<String>,
    pub loop_: bool,
    pub name: String,
    pub origin_x: f32,
    pub origin_y: f32,
}

impl Default for SpritesheetAnimationData {
    fn default() -> Self {
        Self {
            direction: SpritesheetAnimationDirection::Forward,
            frame_duration: 100.0,
            frame_durations: None,
            frame_names: Vec::new(),
            loop_: true,
            name: String::new(),
            origin_x: 0.0,
            origin_y: 0.0,
        }
    }
}

/// Raw frame descriptor as parsed from a spritesheet file.
#[derive(Clone, Debug, Default)]
pub struct SpritesheetFrameData {
    pub height: f32,
    pub name: String,
    pub offset_x: f32,
    pub offset_y: f32,
    /// Normalized pivot X in `[0, 1]` relative to source width, or `None`.
    pub pivot_x: Option<f32>,
    /// Normalized pivot Y in `[0, 1]` relative to source height, or `None`.
    pub pivot_y: Option<f32>,
    pub rotated: bool,
    pub source_height: f32,
    pub source_width: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// Intermediate spritesheet representation produced by format parsers and
/// consumed by runtime loaders.
///
/// This type is format-neutral: it is emitted by all parsers in
/// `flighthq-spritesheet-formats` and consumed by the runtime that builds
/// [`flighthq_types::Spritesheet`] instances.
#[derive(Clone, Debug)]
pub struct SpritesheetData {
    pub animations: Vec<SpritesheetAnimationData>,
    pub frames: Vec<SpritesheetFrameData>,
    pub image_file: String,
    pub image_height: f32,
    pub image_width: f32,
    pub scale: f32,
}

impl Default for SpritesheetData {
    fn default() -> Self {
        Self {
            animations: Vec::new(),
            frames: Vec::new(),
            image_file: String::new(),
            image_height: 0.0,
            image_width: 0.0,
            scale: 1.0,
        }
    }
}

/// Creates a [`SpritesheetAnimationData`] with defaults, overriding any
/// supplied fields.
pub fn create_spritesheet_animation_data(
    options: SpritesheetAnimationData,
) -> SpritesheetAnimationData {
    options
}

/// Creates a [`SpritesheetData`] with defaults, overriding any supplied
/// fields.
pub fn create_spritesheet_data(options: SpritesheetData) -> SpritesheetData {
    options
}

/// Creates a [`SpritesheetFrameData`] with defaults, overriding any supplied
/// fields.
pub fn create_spritesheet_frame_data(options: SpritesheetFrameData) -> SpritesheetFrameData {
    options
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_spritesheet_animation_data_defaults() {
        let anim = create_spritesheet_animation_data(SpritesheetAnimationData::default());
        assert_eq!(anim.direction, SpritesheetAnimationDirection::Forward);
        assert_eq!(anim.frame_duration, 100.0);
        assert!(anim.frame_durations.is_none());
        assert!(anim.frame_names.is_empty());
        assert!(anim.loop_);
        assert_eq!(anim.name, "");
        assert_eq!(anim.origin_x, 0.0);
        assert_eq!(anim.origin_y, 0.0);
    }

    #[test]
    fn create_spritesheet_animation_data_overrides() {
        let anim = create_spritesheet_animation_data(SpritesheetAnimationData {
            direction: SpritesheetAnimationDirection::Pingpong,
            frame_duration: 80.0,
            frame_names: vec!["a".into(), "b".into(), "c".into()],
            loop_: false,
            name: "walk".into(),
            origin_x: 0.5,
            origin_y: 1.0,
            ..Default::default()
        });
        assert_eq!(anim.direction, SpritesheetAnimationDirection::Pingpong);
        assert_eq!(anim.frame_duration, 80.0);
        assert_eq!(anim.frame_names, vec!["a", "b", "c"]);
        assert!(!anim.loop_);
        assert_eq!(anim.name, "walk");
        assert_eq!(anim.origin_x, 0.5);
        assert_eq!(anim.origin_y, 1.0);
    }

    #[test]
    fn create_spritesheet_animation_data_per_frame_durations() {
        let anim = create_spritesheet_animation_data(SpritesheetAnimationData {
            frame_durations: Some(vec![100.0, 200.0, 150.0]),
            frame_names: vec!["a".into(), "b".into(), "c".into()],
            ..Default::default()
        });
        assert_eq!(anim.frame_durations, Some(vec![100.0, 200.0, 150.0]));
    }

    #[test]
    fn create_spritesheet_data_defaults() {
        let data = create_spritesheet_data(SpritesheetData::default());
        assert!(data.animations.is_empty());
        assert!(data.frames.is_empty());
        assert_eq!(data.image_file, "");
        assert_eq!(data.image_height, 0.0);
        assert_eq!(data.image_width, 0.0);
        assert_eq!(data.scale, 1.0);
    }

    #[test]
    fn create_spritesheet_data_overrides() {
        let data = create_spritesheet_data(SpritesheetData {
            image_file: "atlas.png".into(),
            image_height: 512.0,
            image_width: 256.0,
            scale: 2.0,
            ..Default::default()
        });
        assert_eq!(data.image_file, "atlas.png");
        assert_eq!(data.image_height, 512.0);
        assert_eq!(data.image_width, 256.0);
        assert_eq!(data.scale, 2.0);
    }

    #[test]
    fn create_spritesheet_frame_data_defaults() {
        let frame = create_spritesheet_frame_data(SpritesheetFrameData::default());
        assert_eq!(frame.height, 0.0);
        assert_eq!(frame.name, "");
        assert_eq!(frame.offset_x, 0.0);
        assert_eq!(frame.offset_y, 0.0);
        assert!(frame.pivot_x.is_none());
        assert!(frame.pivot_y.is_none());
        assert!(!frame.rotated);
        assert_eq!(frame.source_height, 0.0);
        assert_eq!(frame.source_width, 0.0);
        assert_eq!(frame.width, 0.0);
        assert_eq!(frame.x, 0.0);
        assert_eq!(frame.y, 0.0);
    }

    #[test]
    fn create_spritesheet_frame_data_overrides() {
        let frame = create_spritesheet_frame_data(SpritesheetFrameData {
            height: 64.0,
            name: "hero_idle".into(),
            offset_x: 2.0,
            offset_y: 4.0,
            pivot_x: Some(0.5),
            pivot_y: Some(1.0),
            rotated: true,
            source_height: 72.0,
            source_width: 68.0,
            width: 60.0,
            x: 128.0,
            y: 64.0,
        });
        assert_eq!(frame.height, 64.0);
        assert_eq!(frame.name, "hero_idle");
        assert_eq!(frame.offset_x, 2.0);
        assert_eq!(frame.offset_y, 4.0);
        assert_eq!(frame.pivot_x, Some(0.5));
        assert_eq!(frame.pivot_y, Some(1.0));
        assert!(frame.rotated);
        assert_eq!(frame.source_height, 72.0);
        assert_eq!(frame.source_width, 68.0);
        assert_eq!(frame.width, 60.0);
        assert_eq!(frame.x, 128.0);
        assert_eq!(frame.y, 64.0);
    }
}
