// flight-lint: allow-file(contract-vocabulary) D17 video uploads intentionally accept glow Context on the owning GL thread

use flight_image::ImageResource;

use crate::{GlImageSourceToken, upload_gl_texture_element};

pub fn upload_gl_texture_video_frame(
    gl: &glow::Context,
    image: &ImageResource,
    uploaded_version: u32,
    internal_format: Option<u32>,
) -> u32 {
    if image.version == uploaded_version {
        return uploaded_version;
    }
    let Some(source) = image
        .source
        .handle
        .as_ref()
        .downcast_ref::<GlImageSourceToken>()
    else {
        return uploaded_version;
    };
    if !source.ready || source.width == 0 || source.height == 0 {
        return uploaded_version;
    }
    upload_gl_texture_element(gl, glow::TEXTURE_2D, source, internal_format);
    return image.version;
}
