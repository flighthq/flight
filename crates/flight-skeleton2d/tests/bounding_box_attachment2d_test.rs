use std::sync::{Arc, RwLock};

use flight_skeleton2d::contract::*;

use crate::support::*;

fn box_attachment(
    vertices: Option<Vec<f32>>,
    skin: Option<flight_entity::Ref<Skin2D>>,
) -> BoundingBoxAttachment2D {
    let mut out: BoundingBoxAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(BOUNDING_BOX_ATTACHMENT_2D_KIND);
    out.point_count = vertices.as_ref().map(|v| v.len() / 2).unwrap_or(0);
    out.vertices = vertices;
    out.skin = skin;
    return out;
}

mod compute_skeleton_2d_bounding_box_attachment_vertices {
    use super::*;

    fn translated(x: f32, y: f32) -> Skeleton2D {
        let mut root = bone();
        root.x = x;
        root.y = y;
        let mut value = skeleton(vec![root], None);
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn carries_a_rigid_box_through_the_slot_bone() {
        let attachment = box_attachment(Some(vec![0.0, 0.0, 2.0, 1.0]), None);
        let mut out = [0.0f32; 4];
        compute_skeleton_2d_bounding_box_attachment_vertices(
            &mut out,
            &attachment,
            &translated(10.0, 20.0),
            0,
            None,
            &empty_guards(),
        );
        assert_eq!(out, [10.0, 20.0, 12.0, 21.0]);
    }

    #[test]
    fn blends_a_weighted_point_across_bones() {
        let mut skin = create_skin_2d(vec![2], vec![0.0, 0.0, 0.0, 0.5, 1.0, 0.0, 0.0, 0.5]);
        skin.influence_counts = vec![2];
        let skin = Arc::new(RwLock::new(skin));
        let attachment = box_attachment(None, Some(skin));
        let mut root_a = bone();
        root_a.x = 0.0;
        let mut root_b = bone();
        root_b.x = 10.0;
        let mut value = skeleton(vec![root_a, root_b], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = [0.0f32; 2];
        compute_skeleton_2d_bounding_box_attachment_vertices(
            &mut out,
            &attachment,
            &value,
            -1,
            None,
            &empty_guards(),
        );
        assert!(close(out[0], 5.0));
    }

    #[test]
    fn writes_nothing_without_skin_or_vertices() {
        let attachment = box_attachment(None, None);
        let mut out = [9.0f32; 4];
        compute_skeleton_2d_bounding_box_attachment_vertices(
            &mut out,
            &attachment,
            &translated(0.0, 0.0),
            0,
            None,
            &empty_guards(),
        );
        assert_eq!(out, [9.0f32; 4]);
    }
}
