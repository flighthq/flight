use std::sync::{Arc, RwLock};

use flight_skeleton2d::contract::*;

fn skin() -> Arc<RwLock<Skin2D>> {
    return Arc::new(RwLock::new(create_skin_2d(
        vec![2],
        vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5],
    )));
}

mod explain_skeleton_2d_deform_length {
    use super::*;

    #[test]
    fn addresses_a_weighted_attachment_per_influence() {
        let skin = skin();
        let guard = skin.read().unwrap();
        let report = explain_skeleton_2d_deform_length(Some(&guard), None, Some(&[0.0; 4]));
        assert_eq!(report.addressed, 4);
        assert_eq!(report.addressing, "weighted");
        assert!(report.accepted);
    }

    #[test]
    fn addresses_a_rigid_attachment_per_vertex() {
        let report =
            explain_skeleton_2d_deform_length(None, Some(&[0.0, 0.0, 1.0, 1.0]), Some(&[0.0; 4]));
        assert_eq!(report.addressed, 4);
        assert_eq!(report.addressing, "rigid");
        assert!(report.accepted);
    }

    #[test]
    fn reports_a_null_stream_as_the_undeformed_case() {
        let report = explain_skeleton_2d_deform_length(None, Some(&[0.0, 0.0]), None);
        assert_eq!(report.offsets, 0);
        assert!(!report.accepted);
    }

    #[test]
    fn rejects_a_stream_longer_than_the_exact_expected_length() {
        let report =
            explain_skeleton_2d_deform_length(None, Some(&[0.0, 0.0]), Some(&[0.0, 0.0, 0.0]));
        assert!(!report.accepted);
    }

    #[test]
    fn prefers_the_skin_when_both_are_present() {
        let skin = skin();
        let guard = skin.read().unwrap();
        let report =
            explain_skeleton_2d_deform_length(Some(&guard), Some(&[0.0; 99]), Some(&[0.0; 4]));
        assert_eq!(report.addressing, "weighted");
    }
}

mod source_explain_deform_parity {
    use super::*;

    #[test]
    fn rejects_a_two_float_stream_for_a_four_float_weighted_skin() {
        let skin = skin();
        let guard = skin.read().unwrap();
        let report = explain_skeleton_2d_deform_length(Some(&guard), None, Some(&[0.0; 2]));
        assert_eq!(report.addressed, 4);
        assert_eq!(report.offsets, 2);
        assert_eq!(report.addressing, "weighted");
        assert!(!report.accepted);
    }

    #[test]
    fn accepts_a_six_float_rigid_stream_for_six_vertices() {
        let report = explain_skeleton_2d_deform_length(None, Some(&[0.0; 6]), Some(&[0.0; 6]));
        assert_eq!(report.addressed, 6);
        assert_eq!(report.offsets, 6);
        assert_eq!(report.addressing, "rigid");
        assert!(report.accepted);
    }

    #[test]
    fn reports_a_null_stream_on_a_weighted_skin_as_undeformed() {
        let skin = skin();
        let guard = skin.read().unwrap();
        let report = explain_skeleton_2d_deform_length(Some(&guard), None, None);
        assert!(!report.accepted);
        assert_eq!(report.offsets, 0);
    }

    #[test]
    fn agrees_with_the_deformer_at_the_exact_boundary() {
        let skin = skin();
        let guard = skin.read().unwrap();
        assert!(!explain_skeleton_2d_deform_length(Some(&guard), None, Some(&[0.0; 3])).accepted);
        assert!(explain_skeleton_2d_deform_length(Some(&guard), None, Some(&[0.0; 4])).accepted);
    }

    #[test]
    fn rejects_oversized_streams_on_both_addressings() {
        let skin = skin();
        let guard = skin.read().unwrap();
        assert!(!explain_skeleton_2d_deform_length(Some(&guard), None, Some(&[0.0; 5])).accepted);
        assert!(
            !explain_skeleton_2d_deform_length(None, Some(&[0.0; 6]), Some(&[0.0; 8])).accepted
        );
    }
}
