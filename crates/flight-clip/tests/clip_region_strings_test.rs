//! flight-compiler: rust-only

use super::*;

mod get_clip_region_contours_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_typescript_strings() {
        assert_eq!(
            get_clip_region_contours_reason_string(ClipRegionContoursReason::OddCoordinateCount,),
            "odd-coordinate-count"
        );
        assert_eq!(
            get_clip_region_contours_reason_string(ClipRegionContoursReason::TooFewPoints),
            "too-few-points"
        );
    }
}

mod get_clip_region_status_string {
    use super::*;

    #[test]
    fn returns_the_exact_typescript_strings() {
        assert_eq!(
            get_clip_region_status_string(ClipRegionStatus::Active),
            "active"
        );
        assert_eq!(
            get_clip_region_status_string(ClipRegionStatus::Released),
            "released"
        );
    }
}

mod parse_clip_region_contours_reason {
    use super::*;

    #[test]
    fn parses_known_names_and_rejects_unknown_names() {
        assert_eq!(
            parse_clip_region_contours_reason("odd-coordinate-count"),
            Some(ClipRegionContoursReason::OddCoordinateCount)
        );
        assert_eq!(
            parse_clip_region_contours_reason("too-few-points"),
            Some(ClipRegionContoursReason::TooFewPoints)
        );
        assert_eq!(parse_clip_region_contours_reason("vendor"), None);
    }
}

mod parse_clip_region_status {
    use super::*;

    #[test]
    fn parses_known_names_and_rejects_unknown_names() {
        assert_eq!(
            parse_clip_region_status("active"),
            Some(ClipRegionStatus::Active)
        );
        assert_eq!(
            parse_clip_region_status("released"),
            Some(ClipRegionStatus::Released)
        );
        assert_eq!(parse_clip_region_status("vendor"), None);
    }
}
