use crate::types::*;

/// Creates a new Bitmap filled with a packed RGBA color (0xRRGGBBAA).
pub fn create_bitmap(width: u32, height: u32, color: u32) -> Bitmap {
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
    Bitmap {
        alpha_type: AlphaType::Straight,
        gamut: "srgb".into(),
        data,
        format: "rgba8unorm".into(),
        height,
        kind: BITMAP_TEXTURE_SOURCE_KIND,
        version: 0,
        width,
    }
}

/// Clones a bitmap, copying all pixel data.
pub fn clone_bitmap(source: &Bitmap) -> Bitmap {
    Bitmap {
        alpha_type: source.alpha_type,
        gamut: source.gamut.clone(),
        data: source.data.clone(),
        format: source.format.clone(),
        height: source.height,
        kind: source.kind,
        version: 0,
        width: source.width,
    }
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
