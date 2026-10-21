use std::sync::{Arc, RwLock};

use flight_skeleton2d::contract::*;

use crate::support::*;

fn weighted() -> Skin2D {
    return create_skin_2d(vec![2], vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5]);
}

fn rig() -> Skeleton2D {
    let mut a = bone();
    a.x = 0.0;
    let mut b = bone();
    b.x = 10.0;
    let mut value = skeleton(vec![a, b], None);
    compute_skeleton_2d_world_transforms(&mut value);
    return value;
}

mod skin_skeleton_2d_attachment_points {
    use super::*;

    #[test]
    fn blends_a_weighted_point_by_weight() {
        let skin = Arc::new(RwLock::new(weighted()));
        let mut out = [0.0f32; 2];
        skin_skeleton_2d_attachment_points(
            &mut out,
            Some(&skin),
            None,
            &rig(),
            -1,
            None,
            "Test",
            &empty_guards(),
        );
        assert!(close(out[0], 5.0));
    }

    #[test]
    fn still_skins_a_weighted_attachment_with_bone_index_minus_one() {
        let skin = Arc::new(RwLock::new(weighted()));
        let mut out = [0.0f32; 2];
        skin_skeleton_2d_attachment_points(
            &mut out,
            Some(&skin),
            None,
            &rig(),
            -1,
            None,
            "Test",
            &empty_guards(),
        );
        assert!(close(out[0], 5.0));
    }

    #[test]
    fn ignores_a_deform_stream_longer_than_the_influences_and_reports_it() {
        let skin = Arc::new(RwLock::new(weighted()));
        let (guards, reports) = recording_guards();
        let mut out = [0.0f32; 2];
        skin_skeleton_2d_attachment_points(
            &mut out,
            Some(&skin),
            None,
            &rig(),
            -1,
            Some(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]),
            "Test",
            &guards,
        );
        assert!(close(out[0], 5.0));
        assert_eq!(reports.lock().unwrap().len(), 1);
    }

    #[test]
    fn ignores_a_rigid_deform_stream_longer_than_the_vertices() {
        let (guards, reports) = recording_guards();
        let mut out = [0.0f32; 2];
        skin_skeleton_2d_attachment_points(
            &mut out,
            None,
            Some(&[1.0, 2.0]),
            &rig(),
            0,
            Some(&[1.0, 0.0, 2.0, 0.0]),
            "Test",
            &guards,
        );
        assert_eq!(reports.lock().unwrap().len(), 1);
        assert!(close(out[0], 1.0));
    }

    #[test]
    fn writes_nothing_without_skin_or_vertices() {
        let mut out = [9.0f32; 2];
        skin_skeleton_2d_attachment_points(
            &mut out,
            None,
            None,
            &rig(),
            0,
            None,
            "Test",
            &empty_guards(),
        );
        assert_eq!(out, [9.0, 9.0]);
    }
}
