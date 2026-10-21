use flight_skeleton2d_formats::contract::*;

use crate::support::spine_binary_header;

mod explain_spine_binary_version_failure {
    use super::*;

    #[test]
    fn explains_short_and_recognized_headers() {
        let short = explain_spine_binary_version_failure(&[]);
        assert_eq!(short.reason, SpineBinaryVersionFailureReason::TooShort);
        let recognized = explain_spine_binary_version_failure(&spine_binary_header("4.1.17"));
        assert_eq!(recognized.v3_candidate, None);
        assert_eq!(recognized.v4_candidate.as_deref(), Some("4.1.17"));
    }
}

mod get_spine_binary_version {
    use super::*;

    #[test]
    fn reads_only_version_shaped_complete_headers() {
        assert_eq!(
            get_spine_binary_version(&spine_binary_header("4.1.17")).as_deref(),
            Some("4.1.17"),
        );
        assert!(get_spine_binary_version(&spine_binary_header("not-a-version")).is_none());
        assert!(get_spine_binary_version(&[0; 9]).is_none());
    }
}
