// Sniffs the MIME type of encoded image bytes from their magic-number header, or None when the
// header is too short or unrecognized.
pub fn detect_image_mime_type(data: &[u8]) -> Option<String> {
    if data.len() < 4 {
        return None;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4e && data[3] == 0x47 {
        return Some("image/png".to_string());
    }

    // JPEG: FF D8 FF
    if data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
        return Some("image/jpeg".to_string());
    }

    // GIF87a / GIF89a: 47 49 46 38
    if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x38 {
        return Some("image/gif".to_string());
    }

    // WebP: RIFF....WEBP (bytes 0-3 and 8-11)
    if data.len() >= 12
        && data[0] == 0x52
        && data[1] == 0x49
        && data[2] == 0x46
        && data[3] == 0x46
        && data[8] == 0x57
        && data[9] == 0x45
        && data[10] == 0x42
        && data[11] == 0x50
    {
        return Some("image/webp".to_string());
    }

    // AVIF: ISO-BMFF FileTypeBox whose major or compatible brands include avif/avis.
    if is_avif_file_type_box(data) {
        return Some("image/avif".to_string());
    }

    // ICO: 00 00 01 00
    if data[0] == 0x00 && data[1] == 0x00 && data[2] == 0x01 && data[3] == 0x00 {
        return Some("image/x-icon".to_string());
    }

    // TIFF: little-endian II*\0 or big-endian MM\0*
    if (data[0] == 0x49 && data[1] == 0x49 && data[2] == 0x2a && data[3] == 0x00)
        || (data[0] == 0x4d && data[1] == 0x4d && data[2] == 0x00 && data[3] == 0x2a)
    {
        return Some("image/tiff".to_string());
    }

    // BMP: 42 4D
    if data[0] == 0x42 && data[1] == 0x4d {
        return Some("image/bmp".to_string());
    }

    return None;
}

fn is_avif_brand(bytes: &[u8], offset: usize) -> bool {
    return bytes.get(offset) == Some(&0x61)
        && bytes.get(offset + 1) == Some(&0x76)
        && bytes.get(offset + 2) == Some(&0x69)
        && (bytes.get(offset + 3) == Some(&0x66) || bytes.get(offset + 3) == Some(&0x73));
}

fn is_avif_file_type_box(bytes: &[u8]) -> bool {
    if bytes.len() < 16
        || bytes[4] != 0x66
        || bytes[5] != 0x74
        || bytes[6] != 0x79
        || bytes[7] != 0x70
    {
        return false;
    }

    let box_size = (bytes[0] as usize) * 0x1000000
        + (bytes[1] as usize) * 0x10000
        + (bytes[2] as usize) * 0x100
        + (bytes[3] as usize);
    if box_size < 16 || box_size > bytes.len() || (box_size - 16) % 4 != 0 {
        return false;
    }
    if is_avif_brand(bytes, 8) {
        return true;
    }
    let mut offset = 16;
    while offset < box_size {
        if is_avif_brand(bytes, offset) {
            return true;
        }
        offset += 4;
    }
    return false;
}
