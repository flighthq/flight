use crate::support::create_rectangle_record;
use flight_swf::contract::*;

mod read_swf_header_rectangle {
    use super::*;

    #[test]
    fn clamps_an_inverted_extent_to_zero() {
        let result =
            read_swf_header_rectangle(&create_rectangle_record(2000, 0, 1000, 0), 0).unwrap();
        assert_eq!(
            result.rect,
            SwfTagRectangle {
                height: 0.0,
                width: 0.0,
                x: 100.0,
                y: 50.0
            }
        );
    }

    #[test]
    fn decodes_a_rectangle_and_reports_the_next_field_position() {
        let bytes = create_rectangle_record(0, 2000, 0, 1000);
        let result = read_swf_header_rectangle(&bytes, 0).unwrap();
        assert_eq!(
            result.rect,
            SwfTagRectangle {
                height: 50.0,
                width: 100.0,
                x: 0.0,
                y: 0.0
            }
        );
        assert_eq!(result.next_pos, bytes.len());
    }

    #[test]
    fn returns_none_when_the_record_runs_past_the_data() {
        assert!(read_swf_header_rectangle(&[], 0).is_none());
        let bytes = create_rectangle_record(0, 2000, 0, 1000);
        assert!(read_swf_header_rectangle(&bytes[..1], 0).is_none());
    }

    #[test]
    fn sign_extends_negative_extents() {
        let result =
            read_swf_header_rectangle(&create_rectangle_record(-400, 400, -200, 200), 0).unwrap();
        assert_eq!(
            result.rect,
            SwfTagRectangle {
                height: 20.0,
                width: 40.0,
                x: -20.0,
                y: -10.0
            }
        );
    }
}

mod read_swf_header_uint32 {
    use super::*;

    #[test]
    fn reads_four_bytes_little_endian() {
        assert_eq!(
            read_swf_header_uint32(&[0x78, 0x56, 0x34, 0x12], 0),
            0x12345678
        );
    }

    #[test]
    fn reads_from_the_given_offset() {
        assert_eq!(read_swf_header_uint32(&[0, 0, 1, 0, 0, 0], 2), 1);
    }
}

mod swf_header_prefix_length {
    use super::*;

    #[test]
    fn is_the_signature_version_and_file_length_prefix() {
        assert_eq!(SWF_HEADER_PREFIX_LENGTH, 8);
    }
}
