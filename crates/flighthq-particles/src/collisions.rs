//! Opt-in collision pass for both particle paths.
//!
//! Import this module only for emitters that collide; the core update path is
//! unaware of it.  Call these functions **after**
//! `update_particle_emitter` / `update_particle_objects` so collisions fix
//! up penetration produced by the frame's integration.

use flighthq_types::{
    CircleCollider, ColliderMode, ParticleCollider, ParticleEmitterData, ParticleEmitterState,
    ParticleObjectsState, PlaneCollider, RectangleCollider,
};

use crate::objects::ParticleObject;

const PARTICLE_TRANSFORM_STRIDE: usize = 4;

/// Resolve particle/collider collisions for a typed-array emitter, correcting
/// position and velocity in place.
pub fn apply_particle_collisions(
    data: &mut ParticleEmitterData,
    state: &mut ParticleEmitterState,
    colliders: &[ParticleCollider],
) {
    if colliders.is_empty() {
        return;
    }
    let count = data.particle_count as usize;
    for i in 0..count {
        let tt = i * PARTICLE_TRANSFORM_STRIDE;
        let vt = i * 2;
        let mut s = [
            data.transforms[tt],
            data.transforms[tt + 1],
            state.velocities[vt],
            state.velocities[vt + 1],
        ];
        if resolve_colliders(colliders, &mut s) {
            data.transforms[tt] = s[0];
            data.transforms[tt + 1] = s[1];
            state.velocities[vt] = s[2];
            state.velocities[vt + 1] = s[3];
        }
    }
}

/// Collision pass for the object-pool path.
pub fn apply_particle_object_collisions<T: ParticleObject>(
    objects: &mut [T],
    state: &mut ParticleObjectsState,
    colliders: &[ParticleCollider],
) {
    if colliders.is_empty() {
        return;
    }
    for (i, obj) in objects.iter_mut().enumerate() {
        if state.lifetimes[i * 2 + 1] <= 0.0 {
            continue; // dead slot
        }
        let vt = i * 2;
        let mut s = [obj.x(), obj.y(), state.velocities[vt], state.velocities[vt + 1]];
        if resolve_colliders(colliders, &mut s) {
            obj.set_x(s[0]);
            obj.set_y(s[1]);
            state.velocities[vt] = s[2];
            state.velocities[vt + 1] = s[3];
        }
    }
}

fn resolve_colliders(colliders: &[ParticleCollider], p: &mut [f32; 4]) -> bool {
    let mut hit = false;
    for collider in colliders {
        match collider {
            ParticleCollider::Plane(c) => hit = resolve_plane(c, p) || hit,
            ParticleCollider::Circle(c) => hit = resolve_circle(c, p) || hit,
            ParticleCollider::Rectangle(c) => hit = resolve_rect(c, p) || hit,
        }
    }
    hit
}

fn resolve_circle(c: &CircleCollider, p: &mut [f32; 4]) -> bool {
    let dx = p[0] - c.x;
    let dy = p[1] - c.y;
    let dist = (dx * dx + dy * dy).sqrt();
    let restitution = c.response.restitution.unwrap_or(0.0);
    let friction = c.response.friction.unwrap_or(0.0);
    match c.mode {
        ColliderMode::Exclude => {
            if dist >= c.radius || dist <= 1e-6 {
                return false;
            }
            let nx = dx / dist;
            let ny = dy / dist;
            p[0] = c.x + nx * c.radius;
            p[1] = c.y + ny * c.radius;
            reflect(p, nx, ny, restitution, friction);
            true
        }
        ColliderMode::Contain => {
            if dist <= c.radius {
                return false;
            }
            // inward normal
            let nx = if dist <= 1e-6 { 0.0 } else { -dx / dist };
            let ny = if dist <= 1e-6 { -1.0 } else { -dy / dist };
            p[0] = c.x - nx * c.radius;
            p[1] = c.y - ny * c.radius;
            reflect(p, nx, ny, restitution, friction);
            true
        }
    }
}

fn resolve_plane(c: &PlaneCollider, p: &mut [f32; 4]) -> bool {
    let depth = c.nx * p[0] + c.ny * p[1] - c.distance;
    if depth >= 0.0 {
        return false;
    }
    p[0] -= c.nx * depth; // push back onto the surface
    p[1] -= c.ny * depth;
    reflect(
        p,
        c.nx,
        c.ny,
        c.response.restitution.unwrap_or(0.0),
        c.response.friction.unwrap_or(0.0),
    );
    true
}

fn resolve_rect(c: &RectangleCollider, p: &mut [f32; 4]) -> bool {
    let hw = c.width / 2.0;
    let hh = c.height / 2.0;
    let min_x = c.x - hw;
    let max_x = c.x + hw;
    let min_y = c.y - hh;
    let max_y = c.y + hh;
    let restitution = c.response.restitution.unwrap_or(0.0);
    let friction = c.response.friction.unwrap_or(0.0);

    match c.mode {
        ColliderMode::Contain => {
            let mut hit = false;
            if p[0] < min_x {
                p[0] = min_x;
                reflect(p, 1.0, 0.0, restitution, friction);
                hit = true;
            } else if p[0] > max_x {
                p[0] = max_x;
                reflect(p, -1.0, 0.0, restitution, friction);
                hit = true;
            }
            if p[1] < min_y {
                p[1] = min_y;
                reflect(p, 0.0, 1.0, restitution, friction);
                hit = true;
            } else if p[1] > max_y {
                p[1] = max_y;
                reflect(p, 0.0, -1.0, restitution, friction);
                hit = true;
            }
            hit
        }
        ColliderMode::Exclude => {
            // Only if the point is inside the box, push out along the shallowest axis.
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
                reflect(p, -1.0, 0.0, restitution, friction);
            } else if min_pen == right {
                p[0] = max_x;
                reflect(p, 1.0, 0.0, restitution, friction);
            } else if min_pen == top {
                p[1] = min_y;
                reflect(p, 0.0, -1.0, restitution, friction);
            } else {
                p[1] = max_y;
                reflect(p, 0.0, 1.0, restitution, friction);
            }
            true
        }
    }
}

// Reflect the velocity in p[2],p[3] about a surface with unit normal (nx, ny):
// bounce the inward normal component by `restitution` and damp the tangential
// component by `friction`. Only acts when the particle is moving into the surface.
fn reflect(p: &mut [f32; 4], nx: f32, ny: f32, restitution: f32, friction: f32) {
    let vn = p[2] * nx + p[3] * ny;
    if vn >= 0.0 {
        return; // already separating
    }
    let tvx = p[2] - vn * nx;
    let tvy = p[3] - vn * ny;
    p[2] = tvx * (1.0 - friction) - restitution * vn * nx;
    p[3] = tvy * (1.0 - friction) - restitution * vn * ny;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::emitter::update_particle_emitter;
    use crate::state::{
        create_particle_emitter_config, create_particle_emitter_state,
        create_particle_objects_state,
    };
    use flighthq_types::{CollisionResponse, ParticleEmitterData};

    #[derive(Default)]
    struct TestObject {
        x: f32,
        y: f32,
        alpha: f32,
        rotation: f32,
        scale_x: f32,
        scale_y: f32,
        visible: bool,
    }

    impl ParticleObject for TestObject {
        fn x(&self) -> f32 {
            self.x
        }
        fn y(&self) -> f32 {
            self.y
        }
        fn alpha(&self) -> f32 {
            self.alpha
        }
        fn rotation(&self) -> f32 {
            self.rotation
        }
        fn scale_x(&self) -> f32 {
            self.scale_x
        }
        fn scale_y(&self) -> f32 {
            self.scale_y
        }
        fn visible(&self) -> bool {
            self.visible
        }
        fn set_x(&mut self, v: f32) {
            self.x = v;
        }
        fn set_y(&mut self, v: f32) {
            self.y = v;
        }
        fn set_alpha(&mut self, v: f32) {
            self.alpha = v;
        }
        fn set_rotation(&mut self, v: f32) {
            self.rotation = v;
        }
        fn set_scale_x(&mut self, v: f32) {
            self.scale_x = v;
        }
        fn set_scale_y(&mut self, v: f32) {
            self.scale_y = v;
        }
        fn set_visible(&mut self, v: bool) {
            self.visible = v;
        }
    }

    fn no_response() -> CollisionResponse {
        CollisionResponse::default()
    }

    // Spawn one particle, then place it at a known position/velocity.
    fn place(px: f32, py: f32, vx: f32, vy: f32) -> (ParticleEmitterData, ParticleEmitterState) {
        let mut data = ParticleEmitterData::default();
        let mut state = create_particle_emitter_state(1);
        let mut config = create_particle_emitter_config(None);
        config.spawn_rate = 1.0;
        config.lifetime_min = 100.0;
        config.lifetime_max = 100.0;
        config.speed_min = 0.0;
        config.speed_max = 0.0;
        update_particle_emitter(&mut data, &mut state, &config, 1.0, None, None);
        data.transforms[0] = px;
        data.transforms[1] = py;
        state.velocities[0] = vx;
        state.velocities[1] = vy;
        (data, state)
    }

    #[test]
    fn apply_particle_collisions_empty_colliders_noop() {
        let (mut data, mut state) = place(0.0, 520.0, 0.0, 100.0);
        apply_particle_collisions(&mut data, &mut state, &[]);
        assert_eq!(data.transforms[1], 520.0);
    }

    #[test]
    fn apply_particle_collisions_plane_reflects_velocity() {
        // Floor at y = 500, valid region y <= 500 (normal points up = -y).
        let (mut data, mut state) = place(0.0, 520.0, 0.0, 100.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Plane(PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                distance: -500.0,
                response: no_response(),
            })],
        );
        assert!((data.transforms[1] - 500.0).abs() < 1e-3); // snapped to surface
        assert!(state.velocities[1].abs() < 1e-3); // normal velocity killed
    }

    #[test]
    fn apply_particle_collisions_plane_restitution_bounces() {
        let (mut data, mut state) = place(0.0, 520.0, 0.0, 100.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Plane(PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                distance: -500.0,
                response: CollisionResponse {
                    restitution: Some(0.5),
                    friction: None,
                },
            })],
        );
        assert!((state.velocities[1] - (-50.0)).abs() < 1e-3); // 100 down -> 50 up
    }

    #[test]
    fn apply_particle_collisions_plane_friction() {
        let (mut data, mut state) = place(0.0, 520.0, 80.0, 100.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Plane(PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                distance: -500.0,
                response: CollisionResponse {
                    restitution: None,
                    friction: Some(0.25),
                },
            })],
        );
        assert!((state.velocities[0] - 60.0).abs() < 1e-3); // 80 * (1 - 0.25)
    }

    #[test]
    fn apply_particle_collisions_circle_exclude_pushes_out() {
        let (mut data, mut state) = place(5.0, 0.0, -10.0, 0.0); // inside disc, moving inward
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Circle(CircleCollider {
                x: 0.0,
                y: 0.0,
                radius: 10.0,
                mode: ColliderMode::Exclude,
                response: CollisionResponse {
                    restitution: Some(1.0),
                    friction: None,
                },
            })],
        );
        let d = (data.transforms[0] * data.transforms[0]
            + data.transforms[1] * data.transforms[1])
        .sqrt();
        assert!((d - 10.0).abs() < 1e-3); // pushed to surface
        assert!((state.velocities[0] - 10.0).abs() < 1e-3); // bounced outward
    }

    #[test]
    fn apply_particle_collisions_circle_contain_clamps() {
        let (mut data, mut state) = place(20.0, 0.0, 10.0, 0.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Circle(CircleCollider {
                x: 0.0,
                y: 0.0,
                radius: 10.0,
                mode: ColliderMode::Contain,
                response: no_response(),
            })],
        );
        let d = (data.transforms[0] * data.transforms[0]
            + data.transforms[1] * data.transforms[1])
        .sqrt();
        assert!((d - 10.0).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_collisions_rect_contain_clamps() {
        let (mut data, mut state) = place(80.0, 0.0, 30.0, 0.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Rectangle(RectangleCollider {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                mode: ColliderMode::Contain,
                response: CollisionResponse {
                    restitution: Some(1.0),
                    friction: None,
                },
            })],
        );
        assert!((data.transforms[0] - 50.0).abs() < 1e-3);
        assert!((state.velocities[0] - (-30.0)).abs() < 1e-3);
    }

    #[test]
    fn apply_particle_collisions_rect_exclude_pushes_out() {
        let (mut data, mut state) = place(40.0, 0.0, 0.0, 0.0);
        apply_particle_collisions(
            &mut data,
            &mut state,
            &[ParticleCollider::Rectangle(RectangleCollider {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                mode: ColliderMode::Exclude,
                response: no_response(),
            })],
        );
        assert!((data.transforms[0] - 50.0).abs() < 1e-3); // pushed out near (right) edge
    }

    #[test]
    fn apply_particle_object_collisions_empty_colliders_noop() {
        let mut objects: Vec<TestObject> = vec![TestObject {
            y: 520.0,
            visible: true,
            ..Default::default()
        }];
        let mut state = create_particle_objects_state(1, 1);
        state.lifetimes[1] = 100.0; // alive
        state.velocities[1] = 100.0;
        apply_particle_object_collisions(&mut objects, &mut state, &[]);
        assert_eq!(objects[0].y, 520.0);
        assert_eq!(state.velocities[1], 100.0);
    }

    #[test]
    fn apply_particle_object_collisions_plane_and_skips_dead() {
        let mut objects: Vec<TestObject> = vec![
            TestObject {
                y: 520.0,
                visible: true,
                ..Default::default()
            },
            TestObject {
                y: 520.0,
                visible: false,
                ..Default::default()
            },
        ];
        let mut state = create_particle_objects_state(2, 1);
        state.lifetimes[1] = 100.0; // slot 0 alive
        state.lifetimes[3] = 0.0; // slot 1 dead
        state.velocities[1] = 100.0; // slot 0 vy
        apply_particle_object_collisions(
            &mut objects,
            &mut state,
            &[ParticleCollider::Plane(PlaneCollider {
                nx: 0.0,
                ny: -1.0,
                distance: -500.0,
                response: no_response(),
            })],
        );
        assert!((objects[0].y - 500.0).abs() < 1e-3); // live slot snapped
        assert!(state.velocities[1].abs() < 1e-3);
        assert_eq!(objects[1].y, 520.0); // dead slot untouched
    }
}
