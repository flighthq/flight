use crate::md5_parse::tally_md5_drop;
use crate::md5_types::{MD5_SKELETON_FEATURE, Md5DropTallyEntry, Md5Joint, Md5SectionHandler};
use crate::shared::{convert_positions_z_up_to_y_up, convert_quaternions_z_up_to_y_up};
use flight_entity::Ref;
use flight_geometry::{
    compose_matrix4, conjugate_quaternion, create_matrix4, create_quaternion, create_transform3d,
    create_vector3, inverse_matrix4, multiply_quaternion, rotate_vector3_by_quaternion,
    set_quaternion, set_vector3,
};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d::{NODE3D_KIND, Scene3DDocument, Scene3DDocumentNode, Scene3DDocumentSkin};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

pub static MD5_SKELETON_HANDLER: LazyLock<Ref<Md5SectionHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Md5SectionHandler {
        feature: MD5_SKELETON_FEATURE.to_string(),
        collect: Arc::new(|context| {
            if context.joints.is_empty() {
                return;
            }
            context.skin = Some(context.document.skins.len() as i32);
            let skin = build_md5_skeleton_document(
                context.document,
                context.joints,
                context.drops.as_deref_mut(),
            );
            context.document.skins.push(skin);
        }),
    }))
});
pub static MD5_SKELETON_FAMILY: LazyLock<Vec<Ref<Md5SectionHandler>>> =
    LazyLock::new(|| vec![MD5_SKELETON_HANDLER.clone()]);

// flight-lint: allow(conform-params) D9 required mutable document destination precedes joint input; source order is joints,document,md5Drops
pub fn build_md5_skeleton_document(
    out: &mut Scene3DDocument,
    joints: &[Md5Joint],
    mut md5_drops: Option<&mut Vec<Md5DropTallyEntry>>,
) -> Scene3DDocumentSkin {
    let skeleton_root_index = out.nodes.len() as i32;
    out.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: NODE3D_KIND.to_string(),
        mesh: None,
        name: Some("skeleton".to_string()),
        transform: create_transform3d(),
    });
    out.scenes[0].root_nodes.push(skeleton_root_index);
    let mut joint_positions = Vec::new();
    let mut joint_orientations = Vec::new();
    for joint in joints {
        joint_positions.extend_from_slice(&[joint.position_x, joint.position_y, joint.position_z]);
        joint_orientations.extend_from_slice(&[
            joint.orientation_x,
            joint.orientation_y,
            joint.orientation_z,
            joint.orientation_w,
        ]);
    }
    convert_positions_z_up_to_y_up(&mut joint_positions, None, None);
    convert_quaternions_z_up_to_y_up(&mut joint_orientations, None, None);
    let mut joint_node_indices = Vec::new();
    for joint in joints {
        joint_node_indices.push(out.nodes.len() as i32);
        out.nodes.push(Scene3DDocumentNode {
            children: Vec::new(),
            kind: NODE3D_KIND.to_string(),
            mesh: None,
            name: Some(joint.name.clone()),
            transform: create_transform3d(),
        });
    }
    let mut parent_conj = create_quaternion(0.0, 0.0, 0.0, 1.0);
    let mut rel_pos = create_vector3(0.0, 0.0, 0.0);
    let mut rel_quat = create_quaternion(0.0, 0.0, 0.0, 1.0);
    for (j, joint) in joints.iter().enumerate() {
        let pi = j * 3;
        let qi = j * 4;
        let parent_index = joint.parent_index;
        let mut local_position = create_vector3(
            joint_positions[pi],
            joint_positions[pi + 1],
            joint_positions[pi + 2],
        );
        let mut local_orientation = create_quaternion(
            joint_orientations[qi],
            joint_orientations[qi + 1],
            joint_orientations[qi + 2],
            joint_orientations[qi + 3],
        );
        if parent_index >= 0
            && (parent_index as usize) < joints.len()
            && parent_index as usize != j
            && !is_md5_joint_cycle(joints, j)
        {
            let ppi = parent_index as usize * 3;
            let pqi = parent_index as usize * 4;
            conjugate_quaternion(
                &mut parent_conj,
                &create_quaternion(
                    joint_orientations[pqi],
                    joint_orientations[pqi + 1],
                    joint_orientations[pqi + 2],
                    joint_orientations[pqi + 3],
                ),
            );
            rotate_vector3_by_quaternion(
                &mut rel_pos,
                &create_vector3(
                    local_position.x - joint_positions[ppi],
                    local_position.y - joint_positions[ppi + 1],
                    local_position.z - joint_positions[ppi + 2],
                ),
                &parent_conj,
            );
            multiply_quaternion(&mut rel_quat, &parent_conj, &local_orientation);
            set_vector3(&mut local_position, rel_pos.x, rel_pos.y, rel_pos.z);
            set_quaternion(
                &mut local_orientation,
                rel_quat.x,
                rel_quat.y,
                rel_quat.z,
                rel_quat.w,
            );
        } else if parent_index != -1 {
            tally_md5_drop(
                md5_drops.as_deref_mut(),
                ImportDiagnosticSeverity::Recover,
                "md5mesh.joint-parent-out-of-range",
                "",
                HashMap::from([
                    (
                        "firstJoint".to_string(),
                        ImportDiagnosticDetailValue::Number(j as f32),
                    ),
                    (
                        "firstParent".to_string(),
                        ImportDiagnosticDetailValue::Number(parent_index as f32),
                    ),
                ]),
            );
        }
        let transform = &mut out.nodes[joint_node_indices[j] as usize].transform;
        set_vector3(
            &mut transform.position,
            local_position.x,
            local_position.y,
            local_position.z,
        );
        set_quaternion(
            &mut transform.rotation,
            local_orientation.x,
            local_orientation.y,
            local_orientation.z,
            local_orientation.w,
        );
    }
    for (j, joint) in joints.iter().enumerate() {
        let parent_index = joint.parent_index;
        let parent_node = if parent_index >= 0
            && (parent_index as usize) < joints.len()
            && parent_index as usize != j
            && !is_md5_joint_cycle(joints, j)
        {
            joint_node_indices[parent_index as usize]
        } else {
            skeleton_root_index
        };
        out.nodes[parent_node as usize]
            .children
            .push(joint_node_indices[j]);
    }
    let mut inverse_bind = Vec::new();
    let mut bind_world = create_matrix4();
    for j in 0..joints.len() {
        let pi = j * 3;
        let qi = j * 4;
        compose_matrix4(
            &mut bind_world,
            &create_vector3(
                joint_positions[pi],
                joint_positions[pi + 1],
                joint_positions[pi + 2],
            ),
            &create_quaternion(
                joint_orientations[qi],
                joint_orientations[qi + 1],
                joint_orientations[qi + 2],
                joint_orientations[qi + 3],
            ),
            &create_vector3(1.0, 1.0, 1.0),
        );
        let mut inverse = create_matrix4();
        inverse_matrix4(&mut inverse, &bind_world);
        inverse_bind.push(inverse);
    }
    return Scene3DDocumentSkin {
        inverse_bind,
        joints: joint_node_indices,
    };
}

fn is_md5_joint_cycle(joints: &[Md5Joint], start: usize) -> bool {
    let mut cursor = joints[start].parent_index;
    for _ in 0..joints.len() {
        if cursor < 0 || cursor as usize >= joints.len() {
            return false;
        }
        if cursor as usize == start {
            return true;
        }
        cursor = joints[cursor as usize].parent_index;
    }
    return true;
}
