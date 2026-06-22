use std::collections::HashMap;

use flighthq_types::Spritesheet;
use flighthq_types::SpritesheetAnimation;

/// Builder options for [`create_spritesheet`].
#[derive(Clone, Debug, Default)]
pub struct CreateSpritesheetOptions {
    pub atlas: Option<flighthq_types::TextureAtlas>,
    pub animations: Option<HashMap<String, SpritesheetAnimation>>,
    pub frames: Option<Vec<flighthq_types::SpritesheetFrame>>,
}

/// Creates a new [`Spritesheet`] with the given options, using defaults for
/// any fields that are not supplied.
pub fn create_spritesheet(options: CreateSpritesheetOptions) -> Spritesheet {
    Spritesheet {
        atlas: options.atlas,
        animations: options.animations.unwrap_or_default(),
        frames: options.frames.unwrap_or_default(),
    }
}

/// Returns the [`SpritesheetAnimation`] registered under `label`, or `None`
/// if no animation with that name exists in the sheet.
pub fn get_spritesheet_animation<'a>(
    spritesheet: &'a Spritesheet,
    label: &str,
) -> Option<&'a SpritesheetAnimation> {
    spritesheet.animations.get(label)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spritesheet_animation::CreateSpritesheetAnimationOptions;
    use crate::spritesheet_animation::create_spritesheet_animation;

    #[test]
    fn create_spritesheet_defaults() {
        let sheet = create_spritesheet(CreateSpritesheetOptions::default());
        assert!(sheet.atlas.is_none());
        assert_eq!(sheet.frames.len(), 0);
        assert_eq!(sheet.animations.len(), 0);
    }

    #[test]
    fn get_spritesheet_animation_missing() {
        let sheet = create_spritesheet(CreateSpritesheetOptions::default());
        assert!(get_spritesheet_animation(&sheet, "walk").is_none());
    }

    #[test]
    fn get_spritesheet_animation_present() {
        let mut sheet = create_spritesheet(CreateSpritesheetOptions::default());
        sheet.animations.insert(
            "idle".to_string(),
            create_spritesheet_animation(CreateSpritesheetAnimationOptions::default()),
        );
        sheet.animations.insert(
            "walk".to_string(),
            create_spritesheet_animation(CreateSpritesheetAnimationOptions {
                frame_duration: Some(100.0),
                ..Default::default()
            }),
        );
        let walk = get_spritesheet_animation(&sheet, "walk");
        assert!(walk.is_some());
        assert_eq!(walk.unwrap().frame_duration, 100.0);
    }
}
