use flight_image_codec::*;

fn file_type_box(major_brand: &str, compatible_brands: &[&str]) -> Vec<u8> {
    let mut bytes = vec![0u8; 16 + compatible_brands.len() * 4];
    let size = bytes.len();
    bytes[0] = ((size >> 24) & 0xff) as u8;
    bytes[1] = ((size >> 16) & 0xff) as u8;
    bytes[2] = ((size >> 8) & 0xff) as u8;
    bytes[3] = (size & 0xff) as u8;
    write_ascii(&mut bytes, 4, "ftyp");
    write_ascii(&mut bytes, 8, major_brand);
    for (index, brand) in compatible_brands.iter().enumerate() {
        write_ascii(&mut bytes, 16 + index * 4, brand);
    }
    return bytes;
}

fn write_ascii(bytes: &mut [u8], offset: usize, value: &str) {
    for (index, byte) in value.bytes().enumerate() {
        bytes[offset + index] = byte;
    }
}

mod detect_image_mime_type {
    use super::*;

    #[test]
    fn returns_none_for_a_buffer_that_is_too_small() {
        assert_eq!(detect_image_mime_type(&[0u8; 2]), None);
    }

    #[test]
    fn returns_none_for_an_unrecognised_header() {
        assert_eq!(
            detect_image_mime_type(&[0x00, 0x01, 0x02, 0x03, 0, 0, 0, 0]),
            None
        );
    }

    #[test]
    fn detects_png() {
        let mut bytes = vec![0u8; 16];
        bytes[..8].copy_from_slice(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        assert_eq!(
            detect_image_mime_type(&bytes),
            Some("image/png".to_string())
        );
    }

    #[test]
    fn detects_jpeg() {
        let mut bytes = vec![0u8; 16];
        bytes[..4].copy_from_slice(&[0xff, 0xd8, 0xff, 0xe0]);
        assert_eq!(
            detect_image_mime_type(&bytes),
            Some("image/jpeg".to_string())
        );
    }

    #[test]
    fn detects_gif() {
        let mut bytes = vec![0u8; 16];
        bytes[..6].copy_from_slice(&[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
        assert_eq!(
            detect_image_mime_type(&bytes),
            Some("image/gif".to_string())
        );
    }

    #[test]
    fn detects_webp() {
        let mut bytes = vec![0u8; 16];
        bytes[..4].copy_from_slice(&[0x52, 0x49, 0x46, 0x46]);
        bytes[8..12].copy_from_slice(&[0x57, 0x45, 0x42, 0x50]);
        assert_eq!(
            detect_image_mime_type(&bytes),
            Some("image/webp".to_string())
        );
    }

    #[test]
    fn detects_avif_from_its_major_brand() {
        assert_eq!(
            detect_image_mime_type(&file_type_box("avif", &[])),
            Some("image/avif".to_string())
        );
    }

    #[test]
    fn detects_avif_sequences_from_a_compatible_brand() {
        assert_eq!(
            detect_image_mime_type(&file_type_box("mif1", &["avis"])),
            Some("image/avif".to_string())
        );
    }

    #[test]
    fn rejects_a_non_avif_or_truncated_file_type_box() {
        let mut brand_outside_box = vec![0u8; 20];
        let box_bytes = file_type_box("isom", &[]);
        brand_outside_box[..box_bytes.len()].copy_from_slice(&box_bytes);
        write_ascii(&mut brand_outside_box, 16, "avif");
        let truncated = &file_type_box("avif", &[])[..12];
        assert_eq!(
            detect_image_mime_type(&file_type_box("isom", &["mp42"])),
            None
        );
        assert_eq!(detect_image_mime_type(truncated), None);
        assert_eq!(detect_image_mime_type(&brand_outside_box), None);
    }

    #[test]
    fn detects_ico() {
        assert_eq!(
            detect_image_mime_type(&[0x00, 0x00, 0x01, 0x00]),
            Some("image/x-icon".to_string())
        );
    }

    #[test]
    fn detects_little_endian_and_big_endian_tiff() {
        assert_eq!(
            detect_image_mime_type(&[0x49, 0x49, 0x2a, 0x00]),
            Some("image/tiff".to_string())
        );
        assert_eq!(
            detect_image_mime_type(&[0x4d, 0x4d, 0x00, 0x2a]),
            Some("image/tiff".to_string())
        );
    }

    #[test]
    fn detects_bmp() {
        let mut bytes = vec![0u8; 16];
        bytes[..2].copy_from_slice(&[0x42, 0x4d]);
        assert_eq!(
            detect_image_mime_type(&bytes),
            Some("image/bmp".to_string())
        );
    }

    #[test]
    fn accepts_a_byte_slice_directly() {
        assert_eq!(
            detect_image_mime_type(&[0x89, 0x50, 0x4e, 0x47]),
            Some("image/png".to_string())
        );
    }
}
