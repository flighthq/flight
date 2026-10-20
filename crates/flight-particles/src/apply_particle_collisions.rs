use crate::{
    ColliderMode, ParticleCollider, ParticleEmitter2D, ParticleEmitterState, ParticleObject,
    ParticleObjectsState, PARTICLE_VELOCITY_STRIDE,
};

/// Resolve particle/collider collisions for a typed-array emitter, correcting
/// position and velocity in place.
pub fn apply_particle_collisions(
    emitter: &mut ParticleEmitter2D,
    state: &mut ParticleEmitterState,
    colliders: &[ParticleCollider],
) {
    if colliders.is_empty() {
        return;
    }
    let count = emitter.data.particle_count;
    for i in 0..count {
        let tt = i * 4;
        let vt = i * PARTICLE_VELOCITY_STRIDE;
        let mut s = [0.0f32; 6];
        s[0] = emitter.data.transforms[tt];
        s[1] = emitter.data.transforms[tt + 1];
        s[2] = if emitter.data.positions_z.len() > i {
            emitter.data.positions_z[i]
        } else {
            0.0
        };
        s[3] = state.velocities[vt];
        s[4] = state.velocities[vt + 1];
        s[5] = state.velocities[vt + 2];
        if resolve_colliders(colliders, &mut s) {
            emitter.data.transforms[tt] = s[0];
            emitter.data.transforms[tt + 1] = s[1];
            if emitter.data.positions_z.len() > i {
                emitter.data.positions_z[i] = s[2];
            }
            state.velocities[vt] = s[3];
            state.velocities[vt + 1] = s[4];
            state.velocities[vt + 2] = s[5];
        }
    }
}

/// Collision pass for the object-pool path.
pub fn apply_particle_object_collisions(
    objects: &mut [ParticleObject],
    state: &mut ParticleObjectsState,
    colliders: &[ParticleCollider],
) {
    if colliders.is_empty() {
        return;
    }
    for i in 0..objects.len() {
        if state.lifetimes[i * 2 + 1] <= 0.0 {
            continue; // dead slot
        }
        let vt = i * 2;
        let mut s = [0.0f32; 6];
        s[0] = objects[i].x;
        s[1] = objects[i].y;
        s[2] = 0.0;
        s[3] = state.velocities[vt];
        s[4] = state.velocities[vt + 1];
        s[5] = 0.0;
        if resolve_colliders(colliders, &mut s) {
            objects[i].x = s[0];
            objects[i].y = s[1];
            state.velocities[vt] = s[3];
            state.velocities[vt + 1] = s[4];
        }
    }
}

fn resolve_colliders(colliders: &[ParticleCollider], p: &mut [f32; 6]) -> bool {
    let mut hit = false;
    for collider in colliders {
        match collider {
            ParticleCollider::PlaneCollider {
                nx,
                ny,
                nz,
                distance,
                restitution,
                friction,
            } => {
                hit = resolve_plane(*nx, *ny, *nz, *distance, *restitution, *friction, p) || hit;
            }
            ParticleCollider::CircleCollider {
                x,
                y,
                radius,
                mode,
                restitution,
                friction,
            } => {
                hit = resolve_circle(*x, *y, *radius, *mode, *restitution, *friction, p) || hit;
            }
            ParticleCollider::RectangleCollider {
                x,
                y,
                width,
                height,
                mode,
                restitution,
                friction,
            } => {
                hit = resolve_rect(
                    *x,
                    *y,
                    *width,
                    *height,
                    *mode,
                    *restitution,
                    *friction,
                    p,
                ) || hit;
            }
            ParticleCollider::SphereCollider {
                x,
                y,
                z,
                radius,
                mode,
                restitution,
                friction,
            } => {
                hit = resolve_sphere(*x, *y, *z, *radius, *mode, *restitution, *friction, p)
                    || hit;
            }
        }
    }
    return hit;
}

fn resolve_plane(
    nx: f32,
    ny: f32,
    nz: f32,
    distance: f32,
    restitution: f32,
    friction: f32,
    p: &mut [f32; 6],
) -> bool {
    let depth = nx * p[0] + ny * p[1] + nz * p[2] - distance;
    if depth >= 0.0 {
        return false;
    }
    p[0] -= nx * depth;
    p[1] -= ny * depth;
    p[2] -= nz * depth;
    reflect3(p, nx, ny, nz, restitution, friction);
    return true;
}

fn resolve_circle(
    cx: f32,
    cy: f32,
    radius: f32,
    mode: ColliderMode,
    restitution: f32,
    friction: f32,
    p: &mut [f32; 6],
) -> bool {
    let dx = p[0] - cx;
    let dy = p[1] - cy;
    let dist = (dx * dx + dy * dy).sqrt();
    if mode == ColliderMode::Exclude {
        if dist >= radius || dist <= 1e-6 {
            return false;
        }
        let nx = dx / dist;
        let ny = dy / dist;
        p[0] = cx + nx * radius;
        p[1] = cy + ny * radius;
        reflect3(p, nx, ny, 0.0, restitution, friction);
        return true;
    }
    // contain
    if dist <= radius {
        return false;
    }
    let nx = if dist <= 1e-6 { 0.0 } else { -dx / dist };
    let ny = if dist <= 1e-6 { -1.0 } else { -dy / dist };
    p[0] = cx - nx * radius;
    p[1] = cy - ny * radius;
    reflect3(p, nx, ny, 0.0, restitution, friction);
    return true;
}

fn resolve_rect(
    cx: f32,
    cy: f32,
    width: f32,
    height: f32,
    mode: ColliderMode,
    restitution: f32,
    friction: f32,
    p: &mut [f32; 6],
) -> bool {
    let hw = width / 2.0;
    let hh = height / 2.0;
    let min_x = cx - hw;
    let max_x = cx + hw;
    let min_y = cy - hh;
    let max_y = cy + hh;

    if mode == ColliderMode::Contain {
        let mut hit = false;
        if p[0] < min_x {
            p[0] = min_x;
            reflect3(p, 1.0, 0.0, 0.0, restitution, friction);
            hit = true;
        } else if p[0] > max_x {
            p[0] = max_x;
            reflect3(p, -1.0, 0.0, 0.0, restitution, friction);
            hit = true;
        }
        if p[1] < min_y {
            p[1] = min_y;
            reflect3(p, 0.0, 1.0, 0.0, restitution, friction);
            hit = true;
        } else if p[1] > max_y {
            p[1] = max_y;
            reflect3(p, 0.0, -1.0, 0.0, restitution, friction);
            hit = true;
        }
        return hit;
    }

    // exclude
    if p[0] <= min_x || p[0] >= max_x || p[1] <= min_y || p[1] >= max_y {
        return false;
    }
    let left = p[0] - min_x;
    let right = max_x - p[0];
    let top = p[1] - min_y;
    let bottom = max_y - p[1];
    let min_pen = left.min(right).min(top).min(bottom);
    if min_pen == left {
        p[0] = min_x;
        reflect3(p, -1.0, 0.0, 0.0, restitution, friction);
    } else if min_pen == right {
        p[0] = max_x;
        reflect3(p, 1.0, 0.0, 0.0, restitution, friction);
    } else if min_pen == top {
        p[1] = min_y;
        reflect3(p, 0.0, -1.0, 0.0, restitution, friction);
    } else {
        p[1] = max_y;
        reflect3(p, 0.0, 1.0, 0.0, restitution, friction);
    }
    return true;
}

fn resolve_sphere(
    cx: f32,
    cy: f32,
    cz: f32,
    radius: f32,
    mode: ColliderMode,
    restitution: f32,
    friction: f32,
    p: &mut [f32; 6],
) -> bool {
    let dx = p[0] - cx;
    let dy = p[1] - cy;
    let dz = p[2] - cz;
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    if mode == ColliderMode::Exclude {
        if dist >= radius || dist <= 1e-6 {
            return false;
        }
        let nx = dx / dist;
        let ny = dy / dist;
        let nz = dz / dist;
        p[0] = cx + nx * radius;
        p[1] = cy + ny * radius;
        p[2] = cz + nz * radius;
        reflect3(p, nx, ny, nz, restitution, friction);
        return true;
    }
    // contain
    if dist <= radius {
        return false;
    }
    let nx = if dist <= 1e-6 { 0.0 } else { -dx / dist };
    let ny = if dist <= 1e-6 { 0.0 } else { -dy / dist };
    let nz = if dist <= 1e-6 { -1.0 } else { -dz / dist };
    p[0] = cx - nx * radius;
    p[1] = cy - ny * radius;
    p[2] = cz - nz * radius;
    reflect3(p, nx, ny, nz, restitution, friction);
    return true;
}

fn reflect3(
    p: &mut [f32; 6],
    nx: f32,
    ny: f32,
    nz: f32,
    restitution: f32,
    friction: f32,
) {
    let vn = p[3] * nx + p[4] * ny + p[5] * nz;
    if vn >= 0.0 {
        return; // already separating
    }
    let tvx = p[3] - vn * nx;
    let tvy = p[4] - vn * ny;
    let tvz = p[5] - vn * nz;
    p[3] = tvx * (1.0 - friction) - restitution * vn * nx;
    p[4] = tvy * (1.0 - friction) - restitution * vn * ny;
    p[5] = tvz * (1.0 - friction) - restitution * vn * nz;
}
