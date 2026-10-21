use flight_geometry::{Vector3, create_matrix4};
use flight_node::contract::{NodeRef, set_node_local_matrix4};

pub fn set_node3d_look_at(node: &NodeRef, eye: &Vector3, target: &Vector3, up: &Vector3) {
    let mut zx = eye.x - target.x;
    let mut zy = eye.y - target.y;
    let mut zz = eye.z - target.z;
    let mut zl = (zx * zx + zy * zy + zz * zz).sqrt();
    if zl == 0.0 {
        zz = 1.0;
        zl = 1.0;
    }
    zx /= zl;
    zy /= zl;
    zz /= zl;
    let mut xx = up.y * zz - up.z * zy;
    let mut xy = up.z * zx - up.x * zz;
    let mut xz = up.x * zy - up.y * zx;
    let xl = (xx * xx + xy * xy + xz * xz).sqrt();
    if xl != 0.0 {
        xx /= xl;
        xy /= xl;
        xz /= xl;
    }
    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;
    let mut matrix = create_matrix4(
        None, None, None, None, None, None, None, None, None, None, None, None, None, None, None,
        None,
    );
    matrix.m = [
        xx, xy, xz, 0.0, yx, yy, yz, 0.0, zx, zy, zz, 0.0, eye.x, eye.y, eye.z, 1.0,
    ];
    set_node_local_matrix4(node, &matrix);
}
