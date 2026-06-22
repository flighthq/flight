use flighthq_types::SpritesheetFrame;

/// Builder options for [`create_spritesheet_frame`].
#[derive(Clone, Debug, Default)]
pub struct CreateSpritesheetFrameOptions {
    pub id: Option<u32>,
    pub offset_x: Option<f32>,
    pub offset_y: Option<f32>,
}

/// Creates a new [`SpritesheetFrame`] with the given options, using defaults
/// for any fields that are not supplied.
///
/// Defaults:
/// - `id`: `0`
/// - `offset_x`: `0.0`
/// - `offset_y`: `0.0`
pub fn create_spritesheet_frame(options: CreateSpritesheetFrameOptions) -> SpritesheetFrame {
    SpritesheetFrame {
        id: options.id.unwrap_or(0),
        offset_x: options.offset_x.unwrap_or(0.0),
        offset_y: options.offset_y.unwrap_or(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_spritesheet_frame_defaults() {
        let frame = create_spritesheet_frame(CreateSpritesheetFrameOptions::default());
        assert_eq!(frame.id, 0);
        assert_eq!(frame.offset_x, 0.0);
        assert_eq!(frame.offset_y, 0.0);
    }

    #[test]
    fn create_spritesheet_frame_overrides() {
        let frame = create_spritesheet_frame(CreateSpritesheetFrameOptions {
            id: Some(5),
            offset_x: Some(10.0),
            offset_y: Some(20.0),
        });
        assert_eq!(frame.id, 5);
        assert_eq!(frame.offset_x, 10.0);
        assert_eq!(frame.offset_y, 20.0);
    }

    #[test]
    fn create_spritesheet_frame_id_only() {
        let frame = create_spritesheet_frame(CreateSpritesheetFrameOptions {
            id: Some(3),
            ..Default::default()
        });
        assert_eq!(frame.id, 3);
        assert_eq!(frame.offset_x, 0.0);
        assert_eq!(frame.offset_y, 0.0);
    }
}
