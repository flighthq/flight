//! Tileset creation and loading.
//!
//! A `Tileset` wraps a `TextureAtlas` and adds uniform tile dimensions. The
//! `build_tileset_regions` function derives the region grid from the image
//! size and tile dimensions, regenerating the atlas region list in place.

use flighthq_types::{ImageResource, TextureAtlas, Tileset};

use flighthq_image::{
    load_image_resource_from_bytes, load_image_resource_from_path, load_image_resource_from_url,
};
use flighthq_textureatlas::create_texture_atlas;
use flighthq_textureatlas::{create_texture_atlas_region, set_texture_atlas_region};

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/// Creates a `Tileset` with explicit field values.
///
/// Pass `None` for `atlas` to create an empty tileset that is populated
/// later. Call `build_tileset_regions` to derive the region grid after the
/// atlas image is set.
pub fn create_tileset(
    atlas: Option<TextureAtlas>,
    tile_width: f32,
    tile_height: f32,
    columns: u32,
    rows: u32,
    margin: f32,
    spacing: f32,
) -> Tileset {
    Tileset {
        atlas,
        columns,
        margin,
        rows,
        spacing,
        tile_height,
        tile_width,
    }
}

/// Creates a `Tileset` from an existing `TextureAtlas`.
///
/// Columns and rows are derived from the atlas image dimensions, honoring
/// `margin` (pixels of padding between the tile grid and the image edge) and
/// `spacing` (pixels between adjacent tiles). `build_tileset_regions` is called
/// automatically. Returns a fully-populated `Tileset`.
pub fn create_tileset_from_atlas(
    atlas: TextureAtlas,
    tile_width: f32,
    tile_height: f32,
    margin: f32,
    spacing: f32,
) -> Tileset {
    let (columns, rows) = match atlas.image.as_ref() {
        Some(image) => {
            let columns = if tile_width > 0.0 {
                ((image.width as f32 - margin * 2.0 + spacing) / (tile_width + spacing)).floor()
                    as u32
            } else {
                0
            };
            let rows = if tile_height > 0.0 {
                ((image.height as f32 - margin * 2.0 + spacing) / (tile_height + spacing)).floor()
                    as u32
            } else {
                0
            };
            (columns, rows)
        }
        None => (0, 0),
    };
    let mut tileset = create_tileset(
        Some(atlas),
        tile_width,
        tile_height,
        columns,
        rows,
        margin,
        spacing,
    );
    build_tileset_regions(&mut tileset);
    tileset
}

/// Creates a `Tileset` directly from an `ImageResource`.
///
/// Wraps the image in a `TextureAtlas` and delegates to
/// `create_tileset_from_atlas` with no margin or spacing.
pub fn create_tileset_from_image_resource(
    image: ImageResource,
    tile_width: f32,
    tile_height: f32,
) -> Tileset {
    create_tileset_from_atlas(
        create_texture_atlas(Some(image), Vec::new()),
        tile_width,
        tile_height,
        0.0,
        0.0,
    )
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

/// Rebuilds the region grid in `target.atlas.regions` from the current
/// image size and tile dimensions.
///
/// Existing regions are reused and mutated in place; new regions are appended
/// as needed. A no-op when `target.atlas` is `None`.
pub fn build_tileset_regions(target: &mut Tileset) {
    let columns = target.columns;
    let rows = target.rows;
    let tile_width = target.tile_width;
    let tile_height = target.tile_height;
    let margin = target.margin;
    let spacing = target.spacing;
    let atlas = match target.atlas.as_mut() {
        Some(atlas) => atlas,
        None => return,
    };
    let mut i: usize = 0;
    for row in 0..rows {
        for column in 0..columns {
            if i >= atlas.regions.len() {
                atlas.regions.push(create_texture_atlas_region(None));
            }
            let x = margin + column as f32 * (tile_width + spacing);
            let y = margin + row as f32 * (tile_height + spacing);
            set_texture_atlas_region(
                &mut atlas.regions[i],
                x,
                y,
                tile_width,
                tile_height,
                None,
                None,
            );
            i += 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/// Decodes the bytes of an array buffer and creates a fully-populated `Tileset`.
///
/// Alias of `load_tileset_from_bytes` matching the web port's
/// `loadTilesetFromArrayBuffer`. `mime_type` is optional; an undetectable
/// buffer is a hard error before any decode is attempted.
pub fn load_tileset_from_array_buffer(
    buffer: &[u8],
    tile_width: f32,
    tile_height: f32,
    mime_type: Option<&str>,
) -> Result<Tileset, Box<dyn std::error::Error + Send + Sync>> {
    load_tileset_from_bytes(buffer, tile_width, tile_height, mime_type)
}

/// Decodes `bytes` as an image and creates a fully-populated `Tileset`.
///
/// `mime_type` is optional. Returns an error if decoding fails.
pub fn load_tileset_from_bytes(
    bytes: &[u8],
    tile_width: f32,
    tile_height: f32,
    mime_type: Option<&str>,
) -> Result<Tileset, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_tileset_from_image_resource(
        load_image_resource_from_bytes(bytes, mime_type)?,
        tile_width,
        tile_height,
    ))
}

/// Reads a file at `path`, decodes it as an image, and creates a
/// fully-populated `Tileset`.
///
/// Returns an error if the file cannot be read or decoded.
pub fn load_tileset_from_path(
    path: &std::path::Path,
    tile_width: f32,
    tile_height: f32,
) -> Result<Tileset, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_tileset_from_image_resource(
        load_image_resource_from_path(path)?,
        tile_width,
        tile_height,
    ))
}

/// Reads the file at `url` (treated as a local path on native), decodes it, and
/// creates a fully-populated `Tileset`.
///
/// Native has no `fetch`; a URL is resolved as a filesystem path. Returns an
/// error if the file cannot be read or decoded.
pub fn load_tileset_from_url(
    url: &str,
    tile_width: f32,
    tile_height: f32,
) -> Result<Tileset, Box<dyn std::error::Error + Send + Sync>> {
    Ok(create_tileset_from_image_resource(
        load_image_resource_from_url(url)?,
        tile_width,
        tile_height,
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_tileset_regions_noop_when_no_atlas() {
        let mut ts = create_tileset(None, 16.0, 16.0, 0, 0, 0.0, 0.0);
        build_tileset_regions(&mut ts); // must not panic
    }

    #[test]
    fn create_tileset_empty() {
        let ts = create_tileset(None, 16.0, 16.0, 0, 0, 0.0, 0.0);
        assert!(ts.atlas.is_none());
        assert_eq!(ts.tile_width, 16.0);
        assert_eq!(ts.tile_height, 16.0);
        assert_eq!(ts.columns, 0);
        assert_eq!(ts.rows, 0);
        assert_eq!(ts.margin, 0.0);
        assert_eq!(ts.spacing, 0.0);
    }

    #[test]
    fn create_tileset_from_atlas_builds_regions() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            32,
            32,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let ts = create_tileset_from_atlas(atlas, 16.0, 16.0, 0.0, 0.0);
        // 32×32 image with 16×16 tiles → 2 columns × 2 rows = 4 regions.
        assert_eq!(ts.columns, 2);
        assert_eq!(ts.rows, 2);
        assert_eq!(ts.atlas.as_ref().unwrap().regions.len(), 4);
    }

    #[test]
    fn create_tileset_from_atlas_accounts_for_margin_and_spacing() {
        use flighthq_types::{AlphaType, PixelFormat};
        // 2px margin each side, 2px spacing: (70 - 4 + 2) / (32 + 2) = 68/34 = 2.
        let img = flighthq_image::create_image_resource(
            70,
            70,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let ts = create_tileset_from_atlas(atlas, 32.0, 32.0, 2.0, 2.0);
        assert_eq!(ts.columns, 2);
        assert_eq!(ts.rows, 2);
        assert_eq!(ts.margin, 2.0);
        assert_eq!(ts.spacing, 2.0);
    }

    #[test]
    fn build_tileset_regions_positions_by_column_and_row() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            64,
            32,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let mut ts = create_tileset(Some(atlas), 32.0, 32.0, 2, 1, 0.0, 0.0);
        build_tileset_regions(&mut ts);
        let regions = &ts.atlas.as_ref().unwrap().regions;
        assert_eq!(regions[0].x, 0.0);
        assert_eq!(regions[0].y, 0.0);
        assert_eq!(regions[1].x, 32.0);
        assert_eq!(regions[1].y, 0.0);
    }

    #[test]
    fn build_tileset_regions_advances_y_by_row() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            32,
            64,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let mut ts = create_tileset(Some(atlas), 32.0, 32.0, 1, 2, 0.0, 0.0);
        build_tileset_regions(&mut ts);
        let regions = &ts.atlas.as_ref().unwrap().regions;
        assert_eq!(regions[0].y, 0.0);
        assert_eq!(regions[1].y, 32.0);
    }

    #[test]
    fn build_tileset_regions_honors_margin_offset() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            68,
            34,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let mut ts = create_tileset(Some(atlas), 32.0, 32.0, 2, 1, 2.0, 0.0);
        build_tileset_regions(&mut ts);
        let regions = &ts.atlas.as_ref().unwrap().regions;
        // margin=2: first tile at x=2, second at x=2+32=34.
        assert_eq!(regions[0].x, 2.0);
        assert_eq!(regions[0].y, 2.0);
        assert_eq!(regions[1].x, 34.0);
        assert_eq!(regions[1].y, 2.0);
    }

    #[test]
    fn build_tileset_regions_honors_spacing_gap() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            66,
            32,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        let mut ts = create_tileset(Some(atlas), 32.0, 32.0, 2, 1, 0.0, 2.0);
        build_tileset_regions(&mut ts);
        let regions = &ts.atlas.as_ref().unwrap().regions;
        // spacing=2: region 0 at x=0, region 1 at x=32+2=34.
        assert_eq!(regions[0].x, 0.0);
        assert_eq!(regions[1].x, 34.0);
    }

    #[test]
    fn build_tileset_regions_reuses_existing_regions() {
        use flighthq_textureatlas::create_texture_atlas_region;
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            64,
            32,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let mut atlas = flighthq_textureatlas::create_texture_atlas_from_image_resource(img);
        atlas.regions.push(create_texture_atlas_region(None));
        atlas.regions.push(create_texture_atlas_region(None));
        let mut ts = create_tileset(Some(atlas), 32.0, 32.0, 2, 1, 0.0, 0.0);
        build_tileset_regions(&mut ts);
        let regions = &ts.atlas.as_ref().unwrap().regions;
        // No new regions are appended; the two existing ones are positioned.
        assert_eq!(regions.len(), 2);
        assert_eq!(regions[0].x, 0.0);
        assert_eq!(regions[1].x, 32.0);
    }

    #[test]
    fn create_tileset_from_atlas_zero_when_no_image() {
        let atlas = flighthq_textureatlas::create_texture_atlas(None, vec![]);
        let ts = create_tileset_from_atlas(atlas, 32.0, 32.0, 0.0, 0.0);
        assert_eq!(ts.columns, 0);
        assert_eq!(ts.rows, 0);
        assert_eq!(ts.atlas.as_ref().unwrap().regions.len(), 0);
    }

    #[test]
    fn create_tileset_from_image_resource_derives_grid() {
        use flighthq_types::{AlphaType, PixelFormat};
        let img = flighthq_image::create_image_resource(
            128,
            64,
            None,
            PixelFormat::Rgba8Unorm,
            AlphaType::Straight,
        );
        let ts = create_tileset_from_image_resource(img, 32.0, 32.0);
        assert_eq!(ts.columns, 4);
        assert_eq!(ts.rows, 2);
        assert_eq!(ts.atlas.as_ref().unwrap().regions.len(), 8);
    }

    #[test]
    fn load_tileset_from_array_buffer_errors_without_type() {
        // Mirrors TS: undetectable mime type throws before decode.
        let buffer: &[u8] = &[0x00, 0x00, 0x00, 0x00];
        let result = load_tileset_from_array_buffer(buffer, 32.0, 32.0, None);
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unable to determine image type"));
    }

    #[test]
    fn load_tileset_from_url_errors_when_missing() {
        let result = load_tileset_from_url("does-not-exist-flighthq-tileset.png", 32.0, 32.0);
        assert!(result.is_err());
    }
}
