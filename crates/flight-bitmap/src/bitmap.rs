use flight_entity::allocate_entity;

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_bitmap() -> Bitmap {
        let mut out = create_bitmap(4, 4, Some(0x336699ff));
        set_bitmap_pixel(&mut out, 1, 1, 0x00000000);
        set_bitmap_pixel(&mut out, 2, 1, 0xff8000c0);
        return out;
    }

    #[test]
    fn bitmap_clone_bitmap_matches_clone_bitmap() {
        let s = test_bitmap();
        let ra = s.clone_bitmap();
        let rb = clone_bitmap(&s);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn bitmap_convert_alpha_type_matches_convert_bitmap_alpha_type() {
        let mut a = test_bitmap();
        let mut b = test_bitmap();
        let ra = a.convert_alpha_type(AlphaType::Premultiplied);
        let rb = convert_bitmap_alpha_type(&mut b, AlphaType::Premultiplied);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmap_invalidate_matches_invalidate_bitmap() {
        let mut a = test_bitmap();
        let mut b = test_bitmap();
        let ra = a.invalidate();
        let rb = invalidate_bitmap(&mut b);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmap_new_matches_create_bitmap() {
        let a = Bitmap::new(4, 4, Some(0xff0000ff));
        let b = create_bitmap(4, 4, Some(0xff0000ff));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Creates a new Bitmap filled with a packed RGBA color (0xRRGGBBAA). `color` defaults to 0
/// (transparent black).
// D23 (KEEP; Principal c0f9227c): dimensions and color derive the owned pixel buffer.
pub fn create_bitmap(width: u32, height: u32, color: Option<u32>) -> Bitmap {
    let mut out: Bitmap = allocate_entity();
    initialize_bitmap(&mut out, width, height, color.unwrap_or(0));
    return out;
}

// D23 (KEEP; Principal c0f9227c): construction allocates and fills storage from these inputs.
fn initialize_bitmap(out: &mut Bitmap, width: u32, height: u32, color: u32) {
    let len = (width as usize) * (height as usize) * 4;
    let mut data = vec![0u8; len];
    if color != 0 {
        let r = ((color >> 24) & 0xff) as u8;
        let g = ((color >> 16) & 0xff) as u8;
        let b = ((color >> 8) & 0xff) as u8;
        let a = (color & 0xff) as u8;
        let mut i = 0;
        while i < len {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
            i += 4;
        }
    }
    out.alpha_type = AlphaType::Straight;
    out.gamut = TextureGamut::Srgb;
    out.data = data.into_boxed_slice();
    out.format = PixelFormat::Rgba8Unorm;
    out.height = height;
    out.kind = BITMAP_TEXTURE_SOURCE_KIND.to_string();
    out.version = 0;
    out.width = width;
}

/// Clones a bitmap, copying all pixel data.
pub fn clone_bitmap(source: &Bitmap) -> Bitmap {
    let mut out: Bitmap = allocate_entity();
    out.alpha_type = source.alpha_type;
    out.gamut = source.gamut;
    out.data = source.data.clone();
    out.format = source.format;
    out.height = source.height;
    out.kind = source.kind.clone();
    out.version = 0;
    out.width = source.width;
    return out;
}

/// Converts the alpha representation of a bitmap in place.
pub fn convert_bitmap_alpha_type(out: &mut Bitmap, target: AlphaType) {
    if out.alpha_type == target {
        return;
    }
    let len = (out.width as usize) * (out.height as usize) * 4;
    if target == AlphaType::Premultiplied {
        let mut i = 0;
        while i < len {
            let a = out.data[i + 3] as f32 / 255.0;
            out.data[i] = (out.data[i] as f32 * a).round() as u8;
            out.data[i + 1] = (out.data[i + 1] as f32 * a).round() as u8;
            out.data[i + 2] = (out.data[i + 2] as f32 * a).round() as u8;
            i += 4;
        }
    } else {
        let mut i = 0;
        while i < len {
            let a = out.data[i + 3];
            if a == 0 {
                out.data[i] = 0;
                out.data[i + 1] = 0;
                out.data[i + 2] = 0;
            } else {
                let inv = 255.0 / a as f32;
                out.data[i] = (out.data[i] as f32 * inv).round().min(255.0) as u8;
                out.data[i + 1] = (out.data[i + 1] as f32 * inv).round().min(255.0) as u8;
                out.data[i + 2] = (out.data[i + 2] as f32 * inv).round().min(255.0) as u8;
            }
            i += 4;
        }
    }
    out.alpha_type = target;
    invalidate_bitmap(out);
}

/// Bumps the bitmap version with wrapping.
pub fn invalidate_bitmap(bitmap: &mut Bitmap) {
    bitmap.version = bitmap.version.wrapping_add(1);
}

impl Bitmap {
    pub fn new(width: u32, height: u32, color: Option<u32>) -> Self {
        return create_bitmap(width, height, color);
    }

    pub fn clone_bitmap(&self) -> Bitmap {
        return clone_bitmap(self);
    }

    pub fn convert_alpha_type(&mut self, target: AlphaType) {
        return convert_bitmap_alpha_type(self, target);
    }

    pub fn invalidate(&mut self) {
        return invalidate_bitmap(self);
    }
}
