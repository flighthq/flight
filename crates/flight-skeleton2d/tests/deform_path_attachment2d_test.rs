use std::sync::{Arc, RwLock};

use flight_path::{Path, PathWinding, create_path};
use flight_skeleton2d::contract::*;

use crate::support::*;

fn weighted_path() -> PathAttachment2D {
    let mut out: PathAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(PATH_ATTACHMENT_2D_KIND);
    out.commands = vec![1, 2];
    out.point_count = 1;
    out.winding = PathWinding::NonZero;
    out.skin = Some(Arc::new(RwLock::new(create_skin_2d(
        vec![2],
        vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5],
    ))));
    return out;
}

fn rigid_path() -> PathAttachment2D {
    let mut out: PathAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(PATH_ATTACHMENT_2D_KIND);
    out.commands = vec![1];
    out.point_count = 1;
    out.vertices = Some(vec![1.0, 2.0]);
    out.winding = PathWinding::EvenOdd;
    return out;
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

mod deform_skeleton_2d_path_attachment {
    use super::*;

    #[test]
    fn carries_the_verb_stream_and_winding_through() {
        let mut out: Path = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &rigid_path(),
            &rig(),
            0,
            None,
            &empty_guards(),
        );
        assert_eq!(out.commands, vec![1]);
        assert_eq!(out.winding, PathWinding::EvenOdd);
        assert_eq!(out.data.len(), 2);
    }

    #[test]
    fn blends_a_weighted_point_across_two_bones() {
        let mut out: Path = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted_path(),
            &rig(),
            -1,
            None,
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 5.0));
    }

    #[test]
    fn adds_a_weighted_deform_offset_in_bone_local_space() {
        let mut out: Path = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &rigid_path(),
            &rig(),
            0,
            Some(&[2.0, 0.0]),
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 3.0));
    }

    #[test]
    fn writes_nothing_for_a_rigid_path_without_vertices() {
        let mut source = rigid_path();
        source.vertices = None;
        let mut out: Path = create_path(None);
        deform_skeleton_2d_path_attachment(&mut out, &source, &rig(), 0, None, &empty_guards());
        assert_eq!(out.data, vec![0.0, 0.0]);
    }
}

mod source_deform_path_parity {
    use super::*;

    fn weighted(
        counts: Vec<u16>,
        influences: Vec<f32>,
        point_count: usize,
        commands: Vec<u8>,
    ) -> PathAttachment2D {
        let mut out: PathAttachment2D = flight_entity::allocate_entity();
        out.kind = String::from(PATH_ATTACHMENT_2D_KIND);
        out.commands = commands;
        out.point_count = point_count;
        out.skin = Some(Arc::new(RwLock::new(create_skin_2d(counts, influences))));
        out.vertices = None;
        out.winding = PathWinding::EvenOdd;
        return out;
    }

    fn single_rig(x: f32, rotation: f32) -> Skeleton2D {
        let mut value = bone();
        value.x = x;
        value.rotation = rotation;
        let mut skeleton = skeleton(vec![value], None);
        compute_skeleton_2d_world_transforms(&mut skeleton);
        return skeleton;
    }

    #[test]
    fn carries_verbs_winding_and_skinned_values_through() {
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(vec![1], vec![0.0, 3.0, 4.0, 1.0], 1, vec![1]),
            &single_rig(0.0, 0.0),
            0,
            None,
            &empty_guards(),
        );
        assert_eq!(out.commands, vec![1]);
        assert_eq!(out.winding, PathWinding::EvenOdd);
        assert_eq!(out.data.len(), 2);
        assert!(close(out.data[0] as f32, 3.0));
        assert!(close(out.data[1] as f32, 4.0));
    }

    #[test]
    fn skins_cubic_handles_exactly_like_their_anchor() {
        let mut out = create_path(None);
        let mut rig = single_rig(0.0, 90.0);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(
                vec![1, 1, 1],
                vec![0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 2.0, 0.0, 1.0],
                3,
                vec![1, 4],
            ),
            &mut rig,
            0,
            None,
            &empty_guards(),
        );
        let expected = [0.0, 0.0, 0.0, 1.0, 0.0, 2.0];
        for (index, value) in expected.iter().enumerate() {
            assert!(close(out.data[index] as f32, *value), "index {index}");
        }
    }

    #[test]
    fn blends_a_weighted_point_across_two_bones_on_both_axes() {
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(
                vec![2],
                vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5],
                1,
                vec![1],
            ),
            &rig(),
            0,
            None,
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 5.0));
        assert!(close(out.data[1] as f32, 0.0));
    }

    #[test]
    fn adds_a_weighted_deform_offset_in_bone_local_space() {
        let mut out = create_path(None);
        let mut rig = single_rig(5.0, 90.0);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(vec![1], vec![0.0, 1.0, 0.0, 1.0], 1, vec![1]),
            &mut rig,
            0,
            Some(&[0.0, 2.0]),
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 3.0), "x {}", out.data[0]);
        assert!(close(out.data[1] as f32, 1.0), "y {}", out.data[1]);
    }

    #[test]
    fn ignores_a_deform_stream_too_short_for_its_influences() {
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(
                vec![2],
                vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5],
                1,
                vec![1],
            ),
            &rig(),
            0,
            Some(&[4.0, 4.0]),
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 5.0));
    }

    #[test]
    fn reports_the_path_attachment_subject_with_exact_lengths() {
        let (guards, reports) = recording_guards();
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &weighted(
                vec![2],
                vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5],
                1,
                vec![1],
            ),
            &rig(),
            0,
            Some(&[9.0, 9.0]),
            &guards,
        );
        let reports = reports.lock().unwrap();
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0], (String::from("PathAttachment2D"), 2, 4));
    }

    #[test]
    fn transforms_a_rigid_path_by_the_slot_bone_world_matrix() {
        let mut attachment: PathAttachment2D = flight_entity::allocate_entity();
        attachment.kind = String::from(PATH_ATTACHMENT_2D_KIND);
        attachment.commands = vec![1, 2];
        attachment.point_count = 2;
        attachment.vertices = Some(vec![2.0, 0.0, 0.0, 3.0]);
        attachment.winding = PathWinding::NonZero;
        let mut rig = single_rig(5.0, 90.0);
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &attachment,
            &mut rig,
            0,
            Some(&[0.0, 0.0, 0.0, 0.0]),
            &empty_guards(),
        );
        assert!(close(out.data[0] as f32, 5.0));
        assert!(close(out.data[1] as f32, 2.0));
        assert!(close(out.data[2] as f32, 2.0));
        assert!(close(out.data[3] as f32, 0.0));
    }

    #[test]
    fn writes_no_points_for_a_rigid_path_without_setup_vertices() {
        let mut attachment: PathAttachment2D = flight_entity::allocate_entity();
        attachment.kind = String::from(PATH_ATTACHMENT_2D_KIND);
        attachment.commands = Vec::new();
        attachment.point_count = 0;
        attachment.vertices = None;
        attachment.winding = PathWinding::NonZero;
        let mut rig = single_rig(0.0, 0.0);
        let mut out = create_path(None);
        deform_skeleton_2d_path_attachment(
            &mut out,
            &attachment,
            &mut rig,
            0,
            None,
            &empty_guards(),
        );
        assert!(out.data.is_empty());
    }
}
