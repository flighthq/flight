use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_skeleton2d::contract::*;

use crate::support::*;

fn weighted(counts: Vec<u16>, influences: Vec<f32>) -> MeshAttachment2D {
    let mut out: MeshAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(MESH_ATTACHMENT_2D_KIND);
    out.vertex_count = counts.len();
    out.skin = Some(Arc::new(RwLock::new(create_skin_2d(counts, influences))));
    return out;
}

fn rigid(vertices: Vec<f32>) -> MeshAttachment2D {
    let mut out: MeshAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(MESH_ATTACHMENT_2D_KIND);
    out.vertex_count = vertices.len() / 2;
    out.vertices = Some(vertices);
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

mod deform_skeleton_2d_mesh_attachment {
    use super::*;

    #[test]
    fn blends_two_bones_by_weight() {
        let attachment = weighted(vec![2], vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5]);
        let mut out = [0.0f32; 2];
        deform_skeleton_2d_mesh_attachment(
            &mut out,
            &attachment,
            &rig(),
            -1,
            None,
            &empty_guards(),
        );
        assert!(close(out[0], 5.0));
    }

    #[test]
    fn adds_a_weighted_deform_offset_in_bone_local_space() {
        let attachment = weighted(vec![1], vec![0.0, 0.0, 0.0, 1.0]);
        let mut out = [0.0f32; 2];
        deform_skeleton_2d_mesh_attachment(
            &mut out,
            &attachment,
            &rig(),
            -1,
            Some(&[3.0, 0.0]),
            &empty_guards(),
        );
        assert!(close(out[0], 3.0));
    }

    #[test]
    fn ignores_a_short_deform_stream_and_reports_it() {
        let attachment = weighted(vec![1], vec![0.0, 0.0, 0.0, 1.0]);
        let (guards, reports) = recording_guards();
        let mut out = [0.0f32; 2];
        deform_skeleton_2d_mesh_attachment(
            &mut out,
            &attachment,
            &rig(),
            -1,
            Some(&[1.0, 2.0, 3.0]),
            &guards,
        );
        assert!(close(out[0], 0.0));
        assert_eq!(reports.lock().unwrap()[0].0, "MeshAttachment2D");
    }

    #[test]
    fn transforms_a_rigid_mesh_by_the_slot_bone() {
        let attachment = rigid(vec![1.0, 2.0]);
        let mut out = [0.0f32; 2];
        deform_skeleton_2d_mesh_attachment(&mut out, &attachment, &rig(), 1, None, &empty_guards());
        assert!(close(out[0], 11.0) && close(out[1], 2.0));
    }
}
