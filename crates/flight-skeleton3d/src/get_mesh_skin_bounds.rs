use crate::skin_vertices;
use crate::skin_vertices::{read_array, read_float_index};
use flight_geometry::{Aabb, set_aabb};
use flight_meshgeometry::MeshSkinBindPose;
use flight_scene3d::Skeleton3D;

fn empty_bounds(out: &mut Aabb) {
    set_aabb(
        out,
        f32::INFINITY,
        f32::INFINITY,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
    );
}
pub fn get_mesh_skin_conservative_bounds(
    out: &mut Aabb,
    bind_pose: &MeshSkinBindPose,
    skeleton: &Skeleton3D,
) {
    let count = bind_pose.positions.len() / 3;
    let mut minimum = [f32::INFINITY; 3];
    let mut maximum = [f32::NEG_INFINITY; 3];
    for v in 0..count {
        for row in 0..3 {
            let p = bind_pose.positions[v * 3 + row];
            if p < minimum[row] {
                minimum[row] = p;
            }
            if p > maximum[row] {
                maximum[row] = p;
            }
        }
    }
    empty_bounds(out);
    if count == 0 {
        return;
    }
    let center = [
        (minimum[0] + maximum[0]) * 0.5,
        (minimum[1] + maximum[1]) * 0.5,
        (minimum[2] + maximum[2]) * 0.5,
    ];
    let extent = [
        (maximum[0] - minimum[0]) * 0.5,
        (maximum[1] - minimum[1]) * 0.5,
        (maximum[2] - minimum[2]) * 0.5,
    ];
    let palette = &skeleton.joint_matrices;
    let joint_count = palette.len() / 16;
    let mut referenced = vec![false; joint_count];
    for (k, joint) in bind_pose.joints.iter().enumerate() {
        if read_array(&bind_pose.weights, k) == 0.0 {
            continue;
        }
        // JavaScript ToInt32 used by the source's bitwise coercion, including NaN/Infinity.
        let j = if joint.is_finite() {
            ((joint.trunc() % 4294967296.0) as i64 as u32) as i32
        } else {
            0
        };
        if j >= 0 && (j as usize) < joint_count {
            referenced[j as usize] = true;
        }
    }
    let mut lo = [f32::INFINITY; 3];
    let mut hi = [f32::NEG_INFINITY; 3];
    for j in 0..joint_count {
        if !referenced[j] {
            continue;
        }
        let m = j * 16;
        for row in 0..3 {
            let c = palette[m + row] * center[0]
                + palette[m + 4 + row] * center[1]
                + palette[m + 8 + row] * center[2]
                + palette[m + 12 + row];
            let e = palette[m + row].abs() * extent[0]
                + palette[m + 4 + row].abs() * extent[1]
                + palette[m + 8 + row].abs() * extent[2];
            if c - e < lo[row] {
                lo[row] = c - e;
            }
            if c + e > hi[row] {
                hi[row] = c + e;
            }
        }
    }
    set_aabb(out, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
}
pub fn get_mesh_skin_exact_bounds(
    out: &mut Aabb,
    bind_pose: &mut MeshSkinBindPose,
    skeleton: &Skeleton3D,
) {
    skin_vertices(
        &mut bind_pose.skinned_positions,
        &mut bind_pose.skinned_normals,
        &bind_pose.positions,
        &bind_pose.normals,
        &bind_pose.joints,
        &bind_pose.weights,
        &skeleton.joint_matrices,
        &skeleton.normal_matrices,
    );
    let mut lo = [f32::INFINITY; 3];
    let mut hi = [f32::NEG_INFINITY; 3];
    for v in 0..bind_pose.skinned_positions.len() / 3 {
        for row in 0..3 {
            let p = read_float_index(&bind_pose.skinned_positions, (v * 3 + row) as f32);
            if p < lo[row] {
                lo[row] = p;
            }
            if p > hi[row] {
                hi[row] = p;
            }
        }
    }
    set_aabb(out, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);
}
