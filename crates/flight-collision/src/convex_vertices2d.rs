use crate::types::*;

pub fn write_aabb_vertices(aabb: &CollisionAabb2D, out: &mut [f32; 8]) {
    let min_x = aabb.min_x;
    let min_y = aabb.min_y;
    let max_x = aabb.max_x;
    let max_y = aabb.max_y;
    out[0] = min_x;
    out[1] = min_y;
    out[2] = max_x;
    out[3] = min_y;
    out[4] = max_x;
    out[5] = max_y;
    out[6] = min_x;
    out[7] = max_y;
}

pub fn write_obb_vertices(obb: &CollisionObb2D, out: &mut [f32; 8]) {
    let cx = obb.x;
    let cy = obb.y;
    let half_w = obb.half_w;
    let half_h = obb.half_h;
    let cos = obb.rotation.cos();
    let sin = obb.rotation.sin();
    let wx = cos * half_w;
    let wy = sin * half_w;
    let hx = -sin * half_h;
    let hy = cos * half_h;
    out[0] = cx - wx - hx;
    out[1] = cy - wy - hy;
    out[2] = cx + wx - hx;
    out[3] = cy + wy - hy;
    out[4] = cx + wx + hx;
    out[5] = cy + wy + hy;
    out[6] = cx - wx + hx;
    out[7] = cy - wy + hy;
}
