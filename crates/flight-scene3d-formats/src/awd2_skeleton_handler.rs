use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    Awd2StringRead, awd_transform_to_matrix4, has_non_unit_scale, read_awd_data_value,
    read_awd_string, read_awd_transform, skip_awd_attr_list,
};
use crate::awd2_schema::*;
use crate::awd2_types::*;
use crate::three_ds_read::{read_three_ds_u16, read_three_ds_u32};
use flight_animation::create_animation_track;
use flight_entity::{Ref, Uint8Array};
use flight_geometry::contract::{
    copy_matrix4, create_matrix4, create_transform3d, decompose_matrix4_to_transform3d,
    inverse_matrix4, multiply_matrix4, set_matrix4_identity,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d::{
    NODE3D_KIND, Scene3DAnimationPath, Scene3DDocument, Scene3DDocumentAnimation,
    Scene3DDocumentAnimationChannel, Scene3DDocumentNode, Scene3DDocumentSkin,
};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct AwdSkeletonDocumentBuild {
    joint_node_indices: Vec<i32>,
    skeleton_root_index: i32,
    skin: Scene3DDocumentSkin,
}

pub static AWD2_SKELETON_ANIMATION_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_SKELETON_ANIMATION],
        build_phase: Some(AWD2_BUILD_PHASE_SKELETON_ANIMATION as f32),
        deferred: Some(true),
        parse: Arc::new(|state, block| {
            if let Some(animation) =
                parse_skeleton_animation_block(block, state.diagnostics.as_ref())
            {
                if let Some(entry) = state
                    .skeleton_animations
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = animation;
                } else {
                    state.skeleton_animations.push(Awd2SkeletonAnimationEntry {
                        key: block.block_id,
                        value: animation,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            if state.skeleton_joint_node_indices.is_empty() {
                return;
            }
            let animations = build_awd2_document_animations(state);
            state
                .document
                .write()
                .unwrap()
                .animations
                .extend(animations);
        })),
    }))
});

pub static AWD2_SKELETON_BLOCK_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_SKELETON],
        build_phase: Some(AWD2_BUILD_PHASE_SKELETON as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(skeleton) = parse_skeleton_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .skeletons
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = skeleton;
                } else {
                    state.skeletons.push(Awd2SkeletonEntry {
                        key: block.block_id,
                        value: skeleton,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            build_awd2_skeleton_nodes(state);
        })),
    }))
});

pub static AWD2_SKELETON_POSE_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_SKELETON_POSE],
        build_phase: None,
        deferred: Some(true),
        parse: Arc::new(|state, block| {
            if let Some(pose) = parse_skeleton_pose_block(block, state.diagnostics.as_ref()) {
                if let Some(entry) = state
                    .skeleton_poses
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = pose;
                } else {
                    state.skeleton_poses.push(Awd2SkeletonPoseEntry {
                        key: block.block_id,
                        value: pose,
                    });
                }
            }
        }),
        build: None,
    }))
});

fn build_awd2_document_animations(state: &Awd2ParseState) -> Vec<Scene3DDocumentAnimation> {
    let Some(skeleton) = state.skeletons.first() else {
        return Vec::new();
    };
    let mut animations = Vec::new();
    for (index, entry) in state.skeleton_animations.iter().enumerate() {
        if let Some(mut built) = build_awd_document_animation(
            &entry.value,
            skeleton.value.joints.len(),
            &state.skeleton_poses,
            &state.skeleton_joint_node_indices,
            state.diagnostics.as_ref(),
        ) {
            built.name = Some(if entry.value.name.is_empty() {
                format!("animation{index}")
            } else {
                entry.value.name.clone()
            });
            animations.push(built);
        }
    }
    return animations;
}

fn build_awd2_skeleton_nodes(state: &mut Awd2ParseState) {
    let Some(skeleton) = state.skeletons.first() else {
        return;
    };
    let mut document = state.document.write().unwrap();
    let built =
        build_awd_skeleton_document(&skeleton.value, &mut document, state.diagnostics.as_ref());
    state.skeleton_joint_node_indices = built.joint_node_indices;
    state.skin_index = Some(document.skins.len() as i32);
    document.skins.push(built.skin);
    document.scenes[0]
        .root_nodes
        .push(built.skeleton_root_index);
    if state.skeletons.len() > 1 {
        report_awd_diagnostic(
            state.diagnostics.as_ref(),
            ImportDiagnosticSeverity::Drop,
            "awd2.multiple-skeletons",
            "parseAwd2",
            Some(HashMap::from([(
                "skeletons".to_string(),
                ImportDiagnosticDetailValue::Number(state.skeletons.len() as f32),
            )])),
        );
    }
}

fn build_awd_document_animation(
    animation: &Awd2ParsedSkeletonAnimation,
    joint_count: usize,
    pose_blocks: &[Awd2SkeletonPoseEntry],
    joint_node_indices: &[i32],
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Scene3DDocumentAnimation> {
    if animation.poses.is_empty() {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "awd2.animation-no-poses",
            "buildAwdDocumentAnimation",
            None,
        );
        return None;
    }
    let mut times = Vec::new();
    let mut time_accumulator = 0.0;
    for pose in &animation.poses {
        times.push(time_accumulator);
        time_accumulator += pose.duration / 1000.0;
    }
    let mut pose_matrix = create_matrix4();
    let mut pose_transform = create_transform3d();
    let mut channels = Vec::new();
    let mut missing_pose_blocks = diagnostics.map(|_| Vec::<u32>::new());
    for joint in 0..joint_count.min(joint_node_indices.len()) {
        let mut translations = Vec::new();
        let mut rotations = Vec::new();
        let mut scales = Vec::new();
        let mut has_scale = false;
        for pose_entry in &animation.poses {
            let pose = pose_blocks
                .iter()
                .find(|entry| entry.key == pose_entry.pose_block_id)
                .map(|entry| &entry.value);
            if let Some(pose) = pose {
                if let Some(Some(transform)) = pose.joint_transforms.get(joint) {
                    translations.extend([
                        transform[9] as f32,
                        transform[10] as f32,
                        transform[11] as f32,
                    ]);
                    awd_transform_to_matrix4(&mut pose_matrix, transform);
                    decompose_matrix4_to_transform3d(&mut pose_transform, &pose_matrix);
                    rotations.extend([
                        pose_transform.rotation.x,
                        pose_transform.rotation.y,
                        pose_transform.rotation.z,
                        pose_transform.rotation.w,
                    ]);
                    scales.extend([
                        pose_transform.scale.x,
                        pose_transform.scale.y,
                        pose_transform.scale.z,
                    ]);
                    has_scale |= has_non_unit_scale(
                        pose_transform.scale.x,
                        pose_transform.scale.y,
                        pose_transform.scale.z,
                    );
                    continue;
                }
            } else if let Some(missing) = missing_pose_blocks.as_mut() {
                if !missing.contains(&pose_entry.pose_block_id) {
                    missing.push(pose_entry.pose_block_id);
                }
            }
            translations.extend([0.0; 3]);
            rotations.extend([0.0, 0.0, 0.0, 1.0]);
            scales.extend([1.0; 3]);
        }
        let mut translation_track = create_animation_track();
        translation_track.components = 3;
        translation_track.times = times.clone();
        translation_track.values = translations;
        channels.push(Scene3DDocumentAnimationChannel {
            node: joint_node_indices[joint],
            path: Scene3DAnimationPath::Translation,
            track: Arc::new(RwLock::new(translation_track)),
        });
        let mut rotation_track = create_animation_track();
        rotation_track.components = 4;
        rotation_track.quaternion = true;
        rotation_track.times = times.clone();
        rotation_track.values = rotations;
        channels.push(Scene3DDocumentAnimationChannel {
            node: joint_node_indices[joint],
            path: Scene3DAnimationPath::Rotation,
            track: Arc::new(RwLock::new(rotation_track)),
        });
        if has_scale {
            let mut scale_track = create_animation_track();
            scale_track.components = 3;
            scale_track.times = times.clone();
            scale_track.values = scales;
            channels.push(Scene3DDocumentAnimationChannel {
                node: joint_node_indices[joint],
                path: Scene3DAnimationPath::Scale,
                track: Arc::new(RwLock::new(scale_track)),
            });
        }
    }
    if let Some(missing) = missing_pose_blocks.filter(|missing| !missing.is_empty()) {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "awd2.pose-block-missing",
            "buildAwdDocumentAnimation",
            Some(HashMap::from([
                (
                    "distinctPoseBlocks".to_string(),
                    ImportDiagnosticDetailValue::Number(missing.len() as f32),
                ),
                (
                    "firstPoseBlock".to_string(),
                    ImportDiagnosticDetailValue::Number(*missing.iter().min().unwrap() as f32),
                ),
            ])),
        );
    }
    return Some(Scene3DDocumentAnimation {
        channels,
        duration: time_accumulator,
        name: Some(animation.name.clone()),
    });
}

fn build_awd_skeleton_document(
    skeleton: &Awd2ParsedSkeleton,
    document: &mut Scene3DDocument,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> AwdSkeletonDocumentBuild {
    let root = document.nodes.len();
    document.nodes.push(Scene3DDocumentNode {
        children: Vec::new(),
        kind: NODE3D_KIND.to_string(),
        mesh: None,
        name: Some("skeleton".to_string()),
        transform: create_transform3d(),
    });
    let mut joints = Vec::new();
    for joint in &skeleton.joints {
        joints.push(document.nodes.len() as i32);
        document.nodes.push(Scene3DDocumentNode {
            children: Vec::new(),
            kind: NODE3D_KIND.to_string(),
            mesh: None,
            name: (!joint.name.is_empty()).then(|| joint.name.clone()),
            transform: create_transform3d(),
        });
    }
    for (index, joint) in skeleton.joints.iter().enumerate() {
        let parent = if joint.parent_index > 0 && (joint.parent_index as usize) <= joints.len() {
            joints[joint.parent_index as usize - 1] as usize
        } else {
            root
        };
        document.nodes[parent].children.push(joints[index]);
    }
    let mut inverse_bind = Vec::new();
    let mut bind_world = Vec::new();
    for (index, joint) in skeleton.joints.iter().enumerate() {
        let mut inv_bind = create_matrix4();
        awd_transform_to_matrix4(&mut inv_bind, &joint.transform);
        let mut world = create_matrix4();
        if !inverse_matrix4(&mut world, &inv_bind) {
            set_matrix4_identity(&mut world);
            report_awd_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "awd2.joint-matrix-singular",
                "parseAwd2",
                Some(HashMap::from([
                    (
                        "joint".to_string(),
                        ImportDiagnosticDetailValue::String(if joint.name.is_empty() {
                            index.to_string()
                        } else {
                            joint.name.clone()
                        }),
                    ),
                    (
                        "jointIndex".to_string(),
                        ImportDiagnosticDetailValue::Number(index as f32),
                    ),
                ])),
            );
        }
        inverse_bind.push(inv_bind);
        bind_world.push(world);
    }
    let mut inv_parent = create_matrix4();
    let mut local = create_matrix4();
    for (index, joint) in skeleton.joints.iter().enumerate() {
        if joint.parent_index > 0 && (joint.parent_index as usize) <= joints.len() {
            if !inverse_matrix4(
                &mut inv_parent,
                &bind_world[joint.parent_index as usize - 1],
            ) {
                set_matrix4_identity(&mut inv_parent);
            }
            multiply_matrix4(&mut local, &inv_parent, &bind_world[index]);
        } else {
            copy_matrix4(&mut local, &bind_world[index]);
        }
        decompose_matrix4_to_transform3d(
            &mut document.nodes[joints[index] as usize].transform,
            &local,
        );
    }
    return AwdSkeletonDocumentBuild {
        joint_node_indices: joints.clone(),
        skeleton_root_index: root as i32,
        skin: Scene3DDocumentSkin {
            inverse_bind,
            joints,
        },
    };
}

fn parse_skeleton_animation_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedSkeletonAnimation> {
    let view = block.view.read().unwrap();
    let mut offset = block.data_start;
    let end = block.data_end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "animation", "name");
        return None;
    }
    let name = read_skeleton_string(block, &view, offset);
    offset = name.end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "animation", "frameCount");
        return None;
    }
    let count = read_three_ds_u16(&view, offset) as usize;
    offset = skip_awd_attr_list(&view, offset + 2, end);
    let mut poses = Vec::new();
    for _ in 0..count {
        if offset + 4 > end {
            skeleton_truncated(diagnostics, "animation", "poseBlockId");
            return None;
        }
        let pose_block_id = read_three_ds_u32(&view, offset);
        offset += 4;
        if offset + 2 > end {
            skeleton_truncated(diagnostics, "animation", "poseDuration");
            return None;
        }
        let duration = read_three_ds_u16(&view, offset) as f32;
        offset += 2;
        poses.push(Awd2SkeletonAnimationPose {
            duration,
            pose_block_id,
        });
    }
    return Some(Awd2ParsedSkeletonAnimation {
        name: name.value,
        poses,
    });
}

fn parse_skeleton_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedSkeleton> {
    let view = block.view.read().unwrap();
    let mut offset = block.data_start;
    let end = block.data_end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "", "name");
        return None;
    }
    let name = read_skeleton_string(block, &view, offset);
    offset = name.end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "", "jointCount");
        return None;
    }
    let count = read_three_ds_u16(&view, offset) as usize;
    offset = skip_awd_attr_list(&view, offset + 2, end);
    let mut joints = Vec::new();
    for _ in 0..count {
        if offset + 4 > end {
            skeleton_truncated(diagnostics, "", "jointFields");
            return None;
        }
        let parent_index = read_three_ds_u16(&view, offset + 2);
        offset += 4;
        if offset + 2 > end {
            skeleton_truncated(diagnostics, "", "jointName");
            return None;
        }
        let joint_name = read_skeleton_string(block, &view, offset);
        offset = joint_name.end;
        if offset + 12 * if block.matrix_wide { 8 } else { 4 } > end {
            skeleton_truncated(diagnostics, "", "jointTransform");
            return None;
        }
        let transform = read_awd_transform(&view, offset, block.matrix_wide);
        offset = skip_awd_attr_list(&view, transform.end, end);
        offset = skip_awd_attr_list(&view, offset, end);
        joints.push(Awd2ParsedJoint {
            name: joint_name.value,
            parent_index,
            transform: transform.transform,
        });
    }
    return Some(Awd2ParsedSkeleton {
        joints,
        name: name.value,
    });
}

fn parse_skeleton_pose_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedSkeletonPose> {
    let view = block.view.read().unwrap();
    let mut offset = block.data_start;
    let end = block.data_end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "pose", "name");
        return None;
    }
    let name = read_skeleton_string(block, &view, offset);
    offset = name.end;
    if offset + 2 > end {
        skeleton_truncated(diagnostics, "pose", "jointCount");
        return None;
    }
    let count = read_three_ds_u16(&view, offset) as usize;
    offset = skip_awd_attr_list(&view, offset + 2, end);
    let mut joint_transforms = Vec::new();
    for _ in 0..count {
        if offset + 1 > end {
            skeleton_truncated(diagnostics, "pose", "hasTransform");
            return None;
        }
        let present = read_awd_data_value(&view, offset, AWD2_DATA_UINT8) != 0.0;
        offset += 1;
        if present {
            if offset + 12 * if block.matrix_wide { 8 } else { 4 } > end {
                skeleton_truncated(diagnostics, "pose", "jointTransform");
                return None;
            }
            let transform = read_awd_transform(&view, offset, block.matrix_wide);
            offset = transform.end;
            joint_transforms.push(Some(transform.transform));
        } else {
            joint_transforms.push(None);
        }
    }
    return Some(Awd2ParsedSkeletonPose {
        name: name.value,
        joint_transforms,
    });
}

fn read_skeleton_string(block: &Awd2Block, view: &Uint8Array, offset: usize) -> Awd2StringRead {
    return if Arc::ptr_eq(&block.source, &block.view) {
        read_awd_string(view, view, offset)
    } else {
        read_awd_string(view, &block.source.read().unwrap(), offset)
    };
}

fn skeleton_truncated(diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>, family: &str, field: &str) {
    let (kind, origin) = match family {
        "animation" => (
            "awd2.skeleton-animation-truncated",
            "parseSkeletonAnimationBlock",
        ),
        "pose" => ("awd2.skeleton-pose-truncated", "parseSkeletonPoseBlock"),
        _ => ("awd2.skeleton-truncated", "parseSkeletonBlock"),
    };
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        kind,
        origin,
        Some(HashMap::from([(
            "field".to_string(),
            ImportDiagnosticDetailValue::String(field.to_string()),
        )])),
    );
}
