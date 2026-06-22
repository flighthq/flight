/// Output file encoding format for image exports.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ImageFormat {
    Jpeg,
    Png,
}

/// Individual channel index within a pixel.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum ImageChannel {
    Red = 0,
    Green = 1,
    Blue = 2,
    Alpha = 3,
}

/// Numeric layout of an `ImageResource`'s raw pixel data.
///
/// Both variants are 8-bit unsigned-normalized RGBA, 4 bytes per pixel. They differ
/// only in channel order. Names follow WebGPU's `GPUTextureFormat`.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug, Default)]
pub enum PixelFormat {
    #[default]
    Rgba8Unorm,
    Bgra8Unorm,
}

/// Named channel order for pixel data conversion.
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub enum PixelOrder {
    Abgr,
    Argb,
    Bgra,
    Rgba,
}
