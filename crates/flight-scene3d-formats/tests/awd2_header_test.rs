use flight_scene3d_formats::*;

mod parse_awd2_header {
    use super::*;

    #[test]
    fn validates_the_fixed_prefix_and_reads_every_header_field_without_entering_the_body() {
        assert!(parse_awd2_header(&[0x41, 0x57, 0x44], None, None).is_none());
        let mut bytes = [
            0x41, 0x57, 0x44, 2, 1, 0x34, 0x12, 2, 0xff, 0xff, 0xff, 0xff,
        ];
        let header = parse_awd2_header(&bytes, None, None).unwrap();
        assert_eq!(
            header,
            Awd2Header {
                body_length: u32::MAX,
                compression: 2,
                flags: 0x1234,
                version_major: 2,
                version_minor: 1
            }
        );
        bytes[0] = 0x42;
        assert!(parse_awd2_header(&bytes, None, None).is_none());
        bytes[0] = 0x41;
        bytes[3] = 3;
        assert!(parse_awd2_header(&bytes, None, None).is_none());
        bytes[3] = 2;
        let mut wrapped = vec![0x99; 5];
        wrapped.extend_from_slice(&bytes);
        wrapped.push(0x99);
        assert_eq!(parse_awd2_header(&wrapped[5..17], None, None), Some(header));
    }
}
