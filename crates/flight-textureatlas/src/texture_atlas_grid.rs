use flight_entity::Ref;
use flight_texture::Texture2D;

use crate::texture_atlas::create_texture_atlas;
use crate::texture_atlas_region::create_texture_atlas_region;
use crate::types::*;

/// Row-major regions for a regular grid, numbered from 0 and named `name_prefix` + id. Per-axis
/// margins and spacing stay explicit; an omitted frame size is the floor of the remaining extent per
/// cell. The optional page texture is attached as given.
pub fn create_texture_atlas_from_grid(
    options: &GridSliceOptions,
    texture: Option<Ref<Texture2D>>,
) -> Ref<TextureAtlas> {
    let columns = options.columns;
    let rows = options.rows;
    let margin_x = options.margin_x.unwrap_or(0.0);
    let margin_y = options.margin_y.unwrap_or(0.0);
    let spacing_x = options.spacing_x.unwrap_or(0.0);
    let spacing_y = options.spacing_y.unwrap_or(0.0);
    let name_prefix = options.name_prefix.as_deref().unwrap_or("frame_");
    let frame_width = options.frame_width.unwrap_or_else(|| {
        ((options.image_width - 2.0 * margin_x - spacing_x * (columns - 1) as f32) / columns as f32)
            .floor()
    });
    let frame_height = options.frame_height.unwrap_or_else(|| {
        ((options.image_height - 2.0 * margin_y - spacing_y * (rows - 1) as f32) / rows as f32)
            .floor()
    });
    let atlas = create_texture_atlas();
    {
        let mut atlas_value = atlas.write().unwrap();
        atlas_value.texture = texture;
        let mut id = 0;
        for row in 0..rows.max(0) {
            for column in 0..columns.max(0) {
                let region = create_texture_atlas_region();
                {
                    let mut region_value = region.write().unwrap();
                    region_value.height = frame_height;
                    region_value.id = id;
                    region_value.name = Some(format!("{name_prefix}{id}"));
                    region_value.width = frame_width;
                    region_value.x = margin_x + column as f32 * (frame_width + spacing_x);
                    region_value.y = margin_y + row as f32 * (frame_height + spacing_y);
                }
                atlas_value.regions.push(region);
                id += 1;
            }
        }
    }
    return atlas;
}
