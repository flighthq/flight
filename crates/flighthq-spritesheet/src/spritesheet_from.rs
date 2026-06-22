use flighthq_types::Spritesheet;
use flighthq_types::Tileset;

use crate::spritesheet::CreateSpritesheetOptions;
use crate::spritesheet::create_spritesheet;
use crate::spritesheet_frame::CreateSpritesheetFrameOptions;
use crate::spritesheet_frame::create_spritesheet_frame;

/// Creates a [`Spritesheet`] from a [`Tileset`].
///
/// Each atlas region on `tileset.atlas` becomes a
/// [`flighthq_types::SpritesheetFrame`] whose `id` corresponds to the
/// region's index. When `tileset.atlas` is `None` the spritesheet has no
/// frames. The animations table starts empty; use the format parsers in
/// `flighthq-spritesheet-formats` to populate it from a descriptor file.
pub fn create_spritesheet_from_tileset(tileset: &Tileset) -> Spritesheet {
    let frames = match tileset.atlas.as_ref() {
        Some(atlas) => atlas
            .regions
            .iter()
            .map(|region| {
                create_spritesheet_frame(CreateSpritesheetFrameOptions {
                    id: Some(region.id),
                    ..Default::default()
                })
            })
            .collect(),
        None => Vec::new(),
    };
    create_spritesheet(CreateSpritesheetOptions {
        atlas: tileset.atlas.clone(),
        frames: Some(frames),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_resources::build_tileset_regions;
    use flighthq_resources::create_texture_atlas;
    use flighthq_resources::create_tileset;

    fn make_tileset(columns: u32, rows: u32) -> Tileset {
        let atlas = create_texture_atlas(None, Vec::new());
        let mut tileset = create_tileset(Some(atlas), 32.0, 32.0, columns, rows);
        build_tileset_regions(&mut tileset);
        tileset
    }

    #[test]
    fn create_spritesheet_from_tileset_with_regions() {
        let tileset = make_tileset(3, 2);
        let sheet = create_spritesheet_from_tileset(&tileset);
        assert_eq!(sheet.frames.len(), 6);

        let regions = &tileset.atlas.as_ref().unwrap().regions;
        assert_eq!(sheet.frames[0].id, regions[0].id);
        assert_eq!(sheet.frames[1].id, regions[1].id);
        assert_eq!(sheet.animations.len(), 0);
        assert!(sheet.atlas.is_some());
    }

    #[test]
    fn create_spritesheet_from_tileset_no_atlas() {
        let tileset = create_tileset(None, 32.0, 32.0, 0, 0);
        let sheet = create_spritesheet_from_tileset(&tileset);
        assert_eq!(sheet.frames.len(), 0);
        assert!(sheet.atlas.is_none());
    }
}
