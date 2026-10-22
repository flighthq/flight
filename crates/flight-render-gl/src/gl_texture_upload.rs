// flight-lint: allow-file(contract-vocabulary) D17 upload helpers intentionally accept glow Context and native Result diagnostics

use std::sync::Arc;

use flight_image::ImageResource;
use glow::{HasContext, PixelUnpackData};

#[derive(Clone, Debug)]
pub struct GlImageSourceToken {
    pub height: u32,
    pub pixels: Arc<Vec<u8>>,
    pub ready: bool,
    pub width: u32,
}

pub fn upload_gl_texture_data(
    gl: &glow::Context,
    target: u32,
    width: u32,
    height: u32,
    data: &[u8],
    internal_format: Option<u32>,
) {
    // SAFETY: the caller owns the active texture binding and the slice lives through the upload.
    unsafe {
        gl.tex_image_2d(
            target,
            0,
            internal_format.unwrap_or(glow::RGBA) as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            PixelUnpackData::Slice(Some(data)),
        );
    }
}

pub fn upload_gl_texture_element(
    gl: &glow::Context,
    target: u32,
    source: &GlImageSourceToken,
    internal_format: Option<u32>,
) {
    upload_gl_texture_data(
        gl,
        target,
        source.width,
        source.height,
        &source.pixels,
        internal_format,
    );
}

pub(crate) fn upload_gl_texture_element_premultiplied(
    gl: &glow::Context,
    target: u32,
    source: &GlImageSourceToken,
    internal_format: Option<u32>,
) {
    let mut pixels = source.pixels.as_ref().clone();
    for rgba in pixels.chunks_exact_mut(4) {
        let alpha = u16::from(rgba[3]);
        rgba[0] = ((u16::from(rgba[0]) * alpha + 127) / 255) as u8;
        rgba[1] = ((u16::from(rgba[1]) * alpha + 127) / 255) as u8;
        rgba[2] = ((u16::from(rgba[2]) * alpha + 127) / 255) as u8;
    }
    upload_gl_texture_data(
        gl,
        target,
        source.width,
        source.height,
        &pixels,
        internal_format,
    );
}

pub fn upload_gl_texture_image_resource(
    gl: &glow::Context,
    target: u32,
    image: &ImageResource,
    internal_format: Option<u32>,
) -> Result<(), String> {
    let Some(source) = image
        .source
        .handle
        .as_ref()
        .downcast_ref::<GlImageSourceToken>()
    else {
        return Err(
            "uploadGlTextureImageResource: host image is not a GlImageSourceToken".to_string(),
        );
    };
    upload_gl_texture_element(gl, target, source, internal_format);
    return Ok(());
}
