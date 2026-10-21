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
