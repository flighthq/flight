use crate::{BillboardMode, Scene3DGuardStateRef, scene_node::as_node3d};
use flight_camera::Camera3D;
use flight_geometry::{
    Matrix4, Vector3, create_matrix4, create_quaternion, create_vector3, decompose_matrix4,
    inverse_matrix4, multiply_matrix4,
};
use flight_node::contract::{NodeRef, NodeRevisionState};
use flight_node::contract::{get_node_world_matrix4, set_node_local_matrix4};
use std::sync::Arc;

pub type BillboardCameraBasisGuard = Arc<dyn Fn(&Camera3D) + Send + Sync>;
struct CameraBasis {
    eye: [f32; 3],
    right: [f32; 3],
    up: [f32; 3],
    back: [f32; 3],
}

fn apply_billboard_facing(
    billboard: &NodeRef,
    mode: BillboardMode,
    basis: &CameraBasis,
    revisions: &mut NodeRevisionState,
) {
    let world = get_node_world_matrix4(billboard, revisions);
    let mut position = create_vector3(0.0, 0.0, 0.0);
    let mut rotation = create_quaternion(0.0, 0.0, 0.0, 1.0);
    let mut scale = create_vector3(1.0, 1.0, 1.0);
    decompose_matrix4(&mut position, &mut rotation, &mut scale, &world);
    let facing = write_billboard_facing_matrix(mode, basis, &position, &scale);
    let parent = billboard
        .read()
        .unwrap()
        .node_runtime()
        .parent
        .as_ref()
        .and_then(|p| p.upgrade());
    let mut local = facing.clone();
    if let Some(parent) = parent {
        let parent_world = get_node_world_matrix4(&parent, revisions);
        let mut inverse = create_matrix4();
        if inverse_matrix4(&mut inverse, &parent_world) {
            multiply_matrix4(&mut local, &inverse, &facing);
        }
    }
    set_node_local_matrix4(billboard, &local);
}

fn length(v: [f32; 3]) -> f32 {
    return v[0].hypot(v[1]).hypot(v[2]);
}

fn normalize_camera_axis(v: [f32; 3]) -> [f32; 3] {
    let len = length(v);
    let len = if len == 0.0 || len.is_nan() { 1.0 } else { len };
    return [v[0] / len, v[1] / len, v[2] / len];
}

fn orient_billboard_subtree(
    node: &NodeRef,
    basis: &CameraBasis,
    revisions: &mut NodeRevisionState,
) {
    let mode = as_node3d(&*node.read().unwrap()).and_then(|n| n.billboard_mode());
    if let Some(mode) = mode {
        apply_billboard_facing(node, mode, basis, revisions);
    }
    let children = node
        .read()
        .unwrap()
        .node_runtime()
        .children
        .clone()
        .unwrap_or_default();
    for child in children {
        orient_billboard_subtree(&child, basis, revisions);
    }
}

// flight-lint: allow(conform-params) D5 caller-owned hook and canonical transform revision source replace TS semantic globals
pub fn orient_billboard_to_camera(
    billboard: &NodeRef,
    camera: &Camera3D,
    guard_state: &Scene3DGuardStateRef,
    revisions: &mut NodeRevisionState,
) -> bool {
    let Some(basis) = set_billboard_camera_basis(camera, guard_state) else {
        return false;
    };
    let mode = as_node3d(&*billboard.read().unwrap())
        .and_then(|n| n.billboard_mode())
        .expect("Billboard.mode");
    apply_billboard_facing(billboard, mode, &basis, revisions);
    return true;
}

// flight-lint: allow(conform-params) D5 caller-owned hook and canonical transform revision source replace TS semantic globals
pub fn orient_scene3d_billboards_to_camera(
    scene: &NodeRef,
    camera: &Camera3D,
    guard_state: &Scene3DGuardStateRef,
    revisions: &mut NodeRevisionState,
) -> bool {
    let Some(basis) = set_billboard_camera_basis(camera, guard_state) else {
        return false;
    };
    orient_billboard_subtree(scene, &basis, revisions);
    return true;
}

fn set_billboard_camera_basis(
    camera: &Camera3D,
    state: &Scene3DGuardStateRef,
) -> Option<CameraBasis> {
    let mut world = create_matrix4();
    if !inverse_matrix4(&mut world, &camera.view.read().unwrap()) {
        let guard = state.read().unwrap().billboard_camera_basis_guard.clone();
        if let Some(guard) = guard {
            guard(camera);
        }
        return None;
    }
    let m = world.m;
    return Some(CameraBasis {
        eye: [m[12], m[13], m[14]],
        right: normalize_camera_axis([m[0], m[1], m[2]]),
        up: normalize_camera_axis([m[4], m[5], m[6]]),
        back: normalize_camera_axis([m[8], m[9], m[10]]),
    });
}

// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the TS module-level callback slot
pub fn set_billboard_camera_basis_guard(
    guard_state: &Scene3DGuardStateRef,
    guard: Option<BillboardCameraBasisGuard>,
) {
    guard_state.write().unwrap().billboard_camera_basis_guard = guard;
}

fn write_billboard_facing_matrix(
    mode: BillboardMode,
    b: &CameraBasis,
    p: &Vector3,
    s: &Vector3,
) -> Matrix4 {
    let (r, u, n) = match mode {
        BillboardMode::ScreenAligned => (b.right, b.up, b.back),
        BillboardMode::AxisY => {
            let mut dx = b.eye[0] - p.x;
            let mut dz = b.eye[2] - p.z;
            let mut dl = dx.hypot(dz);
            if dl < 1e-6 {
                dx = b.back[0];
                dz = b.back[2];
                dl = dx.hypot(dz);
                if dl < 1e-6 {
                    dx = 0.0;
                    dz = 1.0;
                    dl = 1.0;
                }
            }
            let n = [dx / dl, 0.0, dz / dl];
            ([n[2], 0.0, -n[0]], [0.0, 1.0, 0.0], n)
        }
        BillboardMode::Full => {
            let mut n = [b.eye[0] - p.x, b.eye[1] - p.y, b.eye[2] - p.z];
            let mut len = length(n);
            if len < 1e-6 {
                n = b.back;
                len = length(n);
                if len == 0.0 || len.is_nan() {
                    len = 1.0;
                }
            }
            for v in &mut n {
                *v /= len;
            }
            let mut r = [
                b.up[1] * n[2] - b.up[2] * n[1],
                b.up[2] * n[0] - b.up[0] * n[2],
                b.up[0] * n[1] - b.up[1] * n[0],
            ];
            let mut rl = length(r);
            if rl < 1e-6 {
                let d = b.right[0] * n[0] + b.right[1] * n[1] + b.right[2] * n[2];
                r = [
                    b.right[0] - d * n[0],
                    b.right[1] - d * n[1],
                    b.right[2] - d * n[2],
                ];
                rl = length(r);
                if rl < 1e-6 {
                    r = [1.0, 0.0, 0.0];
                    rl = 1.0;
                }
            }
            for v in &mut r {
                *v /= rl;
            }
            let u = [
                n[1] * r[2] - n[2] * r[1],
                n[2] * r[0] - n[0] * r[2],
                n[0] * r[1] - n[1] * r[0],
            ];
            (r, u, n)
        }
    };
    let mut out = create_matrix4();
    out.m = [
        r[0] * s.x,
        r[1] * s.x,
        r[2] * s.x,
        0.0,
        u[0] * s.y,
        u[1] * s.y,
        u[2] * s.y,
        0.0,
        n[0] * s.z,
        n[1] * s.z,
        n[2] * s.z,
        0.0,
        p.x,
        p.y,
        p.z,
        1.0,
    ];
    return out;
}
