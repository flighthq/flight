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
