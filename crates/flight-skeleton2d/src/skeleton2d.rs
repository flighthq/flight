//! The skeleton rig: creation, cloning, world/bind/palette buffers, skins and validation
//! (TS `skeleton2d.ts`).

use flight_entity::allocate_entity;
use flight_geometry::{Matrix, create_matrix, inverse_matrix, multiply_matrix};
use flight_math::DEG_TO_RAD;

use crate::types::*;

/// Allocates a Skeleton2D from a parent-before-child ordered bone array (TS `createSkeleton2D`).
pub fn create_skeleton_2d(bones: Vec<Bone2D>, slots: Option<Vec<Slot2D>>) -> Skeleton2D {
    let count = bones.len();
    let mut out: Skeleton2D = allocate_entity();
    initialize_skeleton_2d(
        &mut out,
        vec![0.0; count * SKELETON_2D_MATRIX_STRIDE],
        bones,
        vec![0.0; count * SKELETON_2D_MATRIX_STRIDE],
        None,
        slots,
        vec![0.0; count * SKELETON_2D_MATRIX_STRIDE],
    );
    return out;
}

/// The construction initializer of `create_skeleton_2d` (TS `initializeSkeleton2D`).
// flight-lint: allow(conform-array) Rust adopts an owned Vec<f32> where TS passes a shared Float32Array reference
pub fn initialize_skeleton_2d(
    out: &mut Skeleton2D,
    bone_matrices: Vec<f32>,
    bones: Vec<Bone2D>,
    inverse_bind_matrices: Vec<f32>,
    skins: Option<Vec<AttachmentSkin2D>>,
    slots: Option<Vec<Slot2D>>,
    world_matrices: Vec<f32>,
) {
    out.bone_matrices = bone_matrices;
    out.bones = bones;
    out.inverse_bind_matrices = inverse_bind_matrices;
    out.skins = skins;
    out.slots = slots;
    out.world_matrices = world_matrices;
}

/// Deep-copies the bones and buffers into an independently posable skeleton (TS `cloneSkeleton2D`).
/// Slots and attachments keep their shared identities.
pub fn clone_skeleton_2d(skeleton: &Skeleton2D) -> Skeleton2D {
    let mut out: Skeleton2D = allocate_entity();
    initialize_skeleton_2d(
        &mut out,
        skeleton.bone_matrices.clone(),
        skeleton.bones.clone(),
        skeleton.inverse_bind_matrices.clone(),
        skeleton.skins.clone(),
        skeleton.slots.clone(),
        skeleton.world_matrices.clone(),
    );
    return out;
}

/// Fills the skin palette `boneMatrices[i] = worldMatrices[i] x inverseBindMatrices[i]` (TS
/// `computeSkeleton2DBoneMatrices`).
pub fn compute_skeleton_2d_bone_matrices(skeleton: &mut Skeleton2D) {
    let inverse_bind = &skeleton.inverse_bind_matrices;
    for i in 0..skeleton.bones.len() {
        let o = i * SKELETON_2D_MATRIX_STRIDE;
        let a = read_matrix(&skeleton.world_matrices, o);
        let b = read_matrix(inverse_bind, o);
        let mut product: Matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        multiply_matrix(&mut product, &a, &b);
        write_matrix(&mut skeleton.bone_matrices, o, &product);
    }
}

/// Computes one bone's world transform from its local setup transform and its parent's current world
/// matrix (TS `computeSkeleton2DBoneWorldTransform`).
pub fn compute_skeleton_2d_bone_world_transform(skeleton: &mut Skeleton2D, bone_index: i32) {
    if bone_index < 0 || bone_index as usize >= skeleton.bones.len() {
        return;
    }
    let i = bone_index as usize;
    let bone = &skeleton.bones[i];
    let rot_x = (bone.rotation + bone.shear_x) * DEG_TO_RAD;
    let rot_y = (bone.rotation + 90.0 + bone.shear_y) * DEG_TO_RAD;
    let la = rot_x.cos() * bone.scale_x;
    let lb = rot_x.sin() * bone.scale_x;
    let lc = rot_y.cos() * bone.scale_y;
    let ld = rot_y.sin() * bone.scale_y;
    let o = i * SKELETON_2D_MATRIX_STRIDE;
    if bone.parent_index < 0 {
        write_matrix_values(
            &mut skeleton.world_matrices,
            o,
            la,
            lb,
            lc,
            ld,
            bone.x,
            bone.y,
        );
        return;
    }
    let p = bone.parent_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let (pa, pb, pc, pd, ptx, pty) = {
        let world = &skeleton.world_matrices;
        (
            world[p],
            world[p + 1],
            world[p + 2],
            world[p + 3],
            world[p + 4],
            world[p + 5],
        )
    };
    let inherit = bone.transform_mode;
    let (tx, ty) = if inherit.translation {
        (
            pa * bone.x + pc * bone.y + ptx,
            pb * bone.x + pd * bone.y + pty,
        )
    } else {
        (bone.x, bone.y)
    };
    let (ea, eb, ec, ed) = if inherit.rotation && inherit.scale && inherit.reflection {
        (pa, pb, pc, pd)
    } else {
        let raw_sx = pa.hypot(pb);
        let raw_sy = pc.hypot(pd);
        let psx = if raw_sx == 0.0 { 1.0 } else { raw_sx };
        let psy = if raw_sy == 0.0 { 1.0 } else { raw_sy };
        let d0x = if inherit.rotation { pa / psx } else { 1.0 };
        let d0y = if inherit.rotation { pb / psx } else { 0.0 };
        let (d1x, d1y) = if inherit.rotation && inherit.reflection {
            (pc / psy, pd / psy)
        } else if inherit.rotation {
            (-d0y, d0x)
        } else {
            let y = if inherit.reflection && pa * pd - pb * pc < 0.0 {
                -1.0
            } else {
                1.0
            };
            (0.0, y)
        };
        let sx = if inherit.scale { psx } else { 1.0 };
        let sy = if inherit.scale { psy } else { 1.0 };
        (d0x * sx, d0y * sx, d1x * sy, d1y * sy)
    };
    write_matrix_values(
        &mut skeleton.world_matrices,
        o,
        ea * la + ec * lb,
        eb * la + ed * lb,
        ea * lc + ec * ld,
        eb * lc + ed * ld,
        tx,
        ty,
    );
}

/// Propagates every bone's world transform in parent-before-child order (TS
/// `computeSkeleton2DWorldTransforms`).
pub fn compute_skeleton_2d_world_transforms(skeleton: &mut Skeleton2D) {
    for i in 0..skeleton.bones.len() {
        compute_skeleton_2d_bone_world_transform(skeleton, i as i32);
    }
}

/// Detaches bones and slots (TS `disposeSkeleton2D`). The rig owns no native resource.
pub fn dispose_skeleton_2d(skeleton: &mut Skeleton2D) {
    skeleton.bones = Vec::new();
    skeleton.slots = None;
}

/// Compares bones field by field (TS `equalsSkeleton2D`); slots and buffers are not compared.
pub fn equals_skeleton_2d(a: &Skeleton2D, b: &Skeleton2D) -> bool {
    if std::ptr::eq(a, b) {
        return true;
    }
    if a.bones.len() != b.bones.len() {
        return false;
    }
    for i in 0..a.bones.len() {
        let x = &a.bones[i];
        let y = &b.bones[i];
        if x.parent_index != y.parent_index
            || x.x != y.x
            || x.y != y.y
            || x.rotation != y.rotation
            || x.scale_x != y.scale_x
            || x.scale_y != y.scale_y
            || x.shear_x != y.shear_x
            || x.shear_y != y.shear_y
            || x.length != y.length
            || x.transform_mode.rotation != y.transform_mode.rotation
            || x.transform_mode.scale != y.transform_mode.scale
            || x.transform_mode.reflection != y.transform_mode.reflection
            || x.transform_mode.translation != y.transform_mode.translation
        {
            return false;
        }
    }
    return true;
}

/// The index of the bone named `name`, or -1 (TS `getSkeleton2DBoneIndexByName`).
pub fn get_skeleton_2d_bone_index_by_name(skeleton: &Skeleton2D, name: &str) -> i32 {
    for (i, bone) in skeleton.bones.iter().enumerate() {
        if bone.name.as_deref() == Some(name) {
            return i as i32;
        }
    }
    return -1;
}

/// Writes a bone's world transform into `out`; false when `bone_index` is out of range (TS
/// `getSkeleton2DBoneWorldMatrix`).
pub fn get_skeleton_2d_bone_world_matrix(
    out: &mut Matrix,
    skeleton: &Skeleton2D,
    bone_index: i32,
) -> bool {
    if bone_index < 0 || bone_index as usize >= skeleton.bones.len() {
        return false;
    }
    let matrix = read_matrix(
        &skeleton.world_matrices,
        bone_index as usize * SKELETON_2D_MATRIX_STRIDE,
    );
    *out = matrix;
    return true;
}

/// The named wardrobe skin, or `None` (TS `getSkeleton2DSkin`).
pub fn get_skeleton_2d_skin<'a>(
    skeleton: &'a Skeleton2D,
    name: &str,
) -> Option<&'a AttachmentSkin2D> {
    let skins = skeleton.skins.as_ref()?;
    return skins.iter().find(|skin| skin.name == name);
}

fn read_matrix(buffer: &[f32], offset: usize) -> Matrix {
    return create_matrix(
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
        buffer[offset + 4],
        buffer[offset + 5],
    );
}

/// Restores animated local transform fields in `pose` from `setup` (TS `resetSkeleton2DToSetup`).
pub fn reset_skeleton_2d_to_setup(setup: &Skeleton2D, pose: &mut Skeleton2D) {
    if std::ptr::eq(setup, pose) {
        panic!("resetSkeleton2DToSetup: setup and pose must be distinct skeletons");
    }
    if setup.bones.len() != pose.bones.len() {
        panic!("resetSkeleton2DToSetup: setup and pose must contain the same number of bones");
    }
    for i in 0..setup.bones.len() {
        let source = &setup.bones[i];
        let target = &mut pose.bones[i];
        target.rotation = source.rotation;
        target.scale_x = source.scale_x;
        target.scale_y = source.scale_y;
        target.shear_x = source.shear_x;
        target.shear_y = source.shear_y;
        target.x = source.x;
        target.y = source.y;
    }
}

/// Captures inverse bind matrices from the current world transforms (TS `setSkeleton2DBindPose`).
/// A non-invertible bone gets identity.
pub fn set_skeleton_2d_bind_pose(skeleton: &mut Skeleton2D) {
    for i in 0..skeleton.bones.len() {
        let o = i * SKELETON_2D_MATRIX_STRIDE;
        let source = read_matrix(&skeleton.world_matrices, o);
        let mut inverse = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        if !inverse_matrix(&mut inverse, &source) {
            inverse = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        }
        write_matrix(&mut skeleton.inverse_bind_matrices, o, &inverse);
    }
}

/// Writes a wardrobe skin's attachments onto the slots it names (TS `setSkeleton2DSkin`). Out-of-range
/// entries are skipped.
pub fn set_skeleton_2d_skin(skeleton: &mut Skeleton2D, skin: &AttachmentSkin2D) {
    let Some(slots) = skeleton.slots.as_mut() else {
        return;
    };
    for entry in &skin.attachments {
        if entry.slot_index >= 0 && (entry.slot_index as usize) < slots.len() {
            slots[entry.slot_index as usize].attachment = Some(entry.attachment.clone());
        }
    }
}

/// Checks parent-before-child ordering and buffer sizes; `None` when valid (TS `validateSkeleton2D`).
pub fn validate_skeleton_2d(skeleton: &Skeleton2D) -> Option<String> {
    let count = skeleton.bones.len();
    let expected = count * SKELETON_2D_MATRIX_STRIDE;
    if skeleton.world_matrices.len() != expected {
        return Some(format!(
            "worldMatrices length {} != {}",
            skeleton.world_matrices.len(),
            expected
        ));
    }
    if skeleton.inverse_bind_matrices.len() != expected {
        return Some(format!(
            "inverseBindMatrices length {} != {}",
            skeleton.inverse_bind_matrices.len(),
            expected
        ));
    }
    if skeleton.bone_matrices.len() != expected {
        return Some(format!(
            "boneMatrices length {} != {}",
            skeleton.bone_matrices.len(),
            expected
        ));
    }
    for i in 0..count {
        let parent_index = skeleton.bones[i].parent_index;
        if parent_index >= i as i32 {
            return Some(format!(
                "bone {} parentIndex {} is not < its own index (bones must be parent-before-child ordered)",
                i, parent_index
            ));
        }
        if parent_index < -1 {
            return Some(format!("bone {} parentIndex {} < -1", i, parent_index));
        }
    }
    return None;
}

fn write_matrix(buffer: &mut [f32], offset: usize, source: &Matrix) {
    write_matrix_values(
        buffer, offset, source.a, source.b, source.c, source.d, source.tx, source.ty,
    );
}

fn write_matrix_values(
    buffer: &mut [f32],
    offset: usize,
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    tx: f32,
    ty: f32,
) {
    buffer[offset] = a;
    buffer[offset + 1] = b;
    buffer[offset + 2] = c;
    buffer[offset + 3] = d;
    buffer[offset + 4] = tx;
    buffer[offset + 5] = ty;
}
