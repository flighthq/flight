//! Surface construction from other resource types.

use flighthq_types::{AlphaType, ColorSpace, ImageResource, PixelFormat, Surface};

/// Converts a `Surface` into an `ImageResource`. On native the pixel buffer
/// is copied; there is no canvas element.
pub fn create_image_resource_from_surface(surface: &Surface) -> ImageResource {
    ImageResource {
        alpha_type: surface.alpha_type,
        data: Some(surface.data.clone()),
        format: surface.format,
        height: surface.height,
        version: 0,
        width: surface.width,
    }
}

/// Constructs a `Surface` from an existing `ImageResource`. If the resource
/// has CPU pixel data (`data` is `Some`), it is copied; otherwise returns a
/// transparent surface of the same dimensions.
pub fn create_surface_from_image_resource(resource: &ImageResource) -> Surface {
    let data = match &resource.data {
        Some(d) => d.clone(),
        None => vec![0u8; (resource.width as usize) * (resource.height as usize) * 4],
    };
    Surface {
        alpha_type: resource.alpha_type,
        color_space: ColorSpace::Srgb,
        data,
        format: resource.format,
        height: resource.height,
        version: 0,
        width: resource.width,
    }
}

/// Constructs a `width`x`height` `Surface` by capturing an image byte source.
///
/// On the web, `createSurfaceFromImageSource` draws any `CanvasImageSource`
/// (including a WebGL/WebGPU canvas) into a scratch 2D canvas at `(0, 0)` and
/// reads back a `width`x`height` region — one readback path for every render
/// backend. There is no canvas on native, so the byte-source analogue copies
/// the `source` resource's pixels into the top-left of a fresh transparent
/// `width`x`height` surface, clipping anything past the requested size. This
/// mirrors the web path's `drawImage(source, 0, 0)` followed by a full-frame
/// `getImageData(0, 0, width, height)`.
///
/// The `source.data` must be RGBA8 (`PixelFormat::Rgba8Unorm`); an element-only
/// resource (`data` is `None`) yields a fully transparent surface.
pub fn create_surface_from_image_source(
    source: &ImageResource,
    width: u32,
    height: u32,
) -> Surface {
    let mut out = vec![0u8; (width as usize) * (height as usize) * 4];
    if let Some(src) = source.data.as_ref() {
        let copy_w = source.width.min(width);
        let copy_h = source.height.min(height);
        for y in 0..copy_h {
            let src_row = (y * source.width) as usize * 4;
            let dst_row = (y * width) as usize * 4;
            let row_bytes = copy_w as usize * 4;
            out[dst_row..dst_row + row_bytes].copy_from_slice(&src[src_row..src_row + row_bytes]);
        }
    }
    Surface {
        alpha_type: AlphaType::Straight,
        color_space: ColorSpace::Srgb,
        data: out,
        format: PixelFormat::Rgba8Unorm,
        height,
        version: 0,
        width,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::surface::create_surface;

    #[test]
    fn create_image_resource_from_surface_copies_pixels() {
        let surface = create_surface(2, 2, 0x11223344);
        let resource = create_image_resource_from_surface(&surface);
        assert_eq!(resource.width, 2);
        assert_eq!(resource.height, 2);
        assert_eq!(resource.data.as_ref().unwrap(), &surface.data);
        assert_eq!(resource.version, 0);
    }

    #[test]
    fn create_surface_from_image_resource_data_present() {
        let surface = create_surface(2, 1, 0x55667788);
        let resource = create_image_resource_from_surface(&surface);
        let back = create_surface_from_image_resource(&resource);
        assert_eq!(back.width, 2);
        assert_eq!(back.height, 1);
        assert_eq!(back.data, surface.data);
    }

    #[test]
    fn create_surface_from_image_resource_no_data() {
        let resource = ImageResource {
            data: None,
            height: 3,
            width: 4,
            ..ImageResource::default()
        };
        let surface = create_surface_from_image_resource(&resource);
        assert_eq!(surface.data.len(), 4 * 3 * 4);
        assert!(surface.data.iter().all(|&b| b == 0));
    }

    #[test]
    fn create_surface_from_image_source_captures_at_the_given_device_size() {
        let source = create_image_resource_from_surface(&create_surface(8, 4, 0x112233ff));
        let surface = create_surface_from_image_source(&source, 8, 4);
        assert_eq!(surface.width, 8);
        assert_eq!(surface.height, 4);
        assert_eq!(surface.data.len(), 8 * 4 * 4);
        // The captured pixels match the source resource.
        assert_eq!(surface.data, *source.data.as_ref().unwrap());
    }

    #[test]
    fn create_surface_from_image_source_clips_a_larger_source_to_the_top_left() {
        let source = create_image_resource_from_surface(&create_surface(4, 4, 0xaabbccff));
        let surface = create_surface_from_image_source(&source, 2, 2);
        assert_eq!(surface.width, 2);
        assert_eq!(surface.height, 2);
        // Every captured pixel is the opaque source color.
        for px in surface.data.chunks_exact(4) {
            assert_eq!(px, [0xaa, 0xbb, 0xcc, 0xff]);
        }
    }

    #[test]
    fn create_surface_from_image_source_leaves_uncovered_area_transparent() {
        let source = create_image_resource_from_surface(&create_surface(2, 2, 0xffffffff));
        let surface = create_surface_from_image_source(&source, 4, 4);
        // Top-left 2x2 is opaque white; the rest stays transparent black.
        assert_eq!(&surface.data[0..4], &[0xff, 0xff, 0xff, 0xff]);
        // Last pixel (bottom-right) is uncovered.
        let last = surface.data.len() - 4;
        assert_eq!(&surface.data[last..], &[0, 0, 0, 0]);
    }

    #[test]
    fn create_surface_from_image_source_element_only_is_transparent() {
        let source = ImageResource {
            data: None,
            width: 4,
            height: 4,
            ..ImageResource::default()
        };
        let surface = create_surface_from_image_source(&source, 3, 2);
        assert_eq!(surface.data.len(), 3 * 2 * 4);
        assert!(surface.data.iter().all(|&b| b == 0));
    }
}
