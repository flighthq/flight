//! The shared attachment-skinning primitive (TS `skinAttachment2DPoints.ts`).

use flight_entity::Ref;

use crate::skeleton2d_guards::{Skeleton2DGuardState, report_skeleton_2d_deform_length_mismatch};
use crate::types::*;

/// Transforms an attachment's points into flat interleaved world coordinates (TS
/// `skinSkeleton2DAttachmentPoints`).
///
/// Weighted attachments sum each point's influences; rigid ones follow the slot bone. A deform stream
/// whose length does not exactly match what it addresses is ignored and reported through the
/// caller-owned guard state.
// flight-lint: allow(conform-params) D5: the caller-owned guard state is threaded explicitly instead of a module-global slot
#[allow(clippy::too_many_arguments)]
pub fn skin_skeleton_2d_attachment_points(
    out: &mut [f32],
    skin: Option<&Ref<Skin2D>>,
    vertices: Option<&[f32]>,
    skeleton: &Skeleton2D,
    bone_index: i32,
    deform: Option<&[f32]>,
    subject: &str,
    guards: &Skeleton2DGuardState,
) {
    let world = &skeleton.world_matrices;
    let skin_guard = skin.map(|skin| skin.read().unwrap());
    if let Some(skin) = skin_guard.as_deref() {
        let counts = &skin.influence_counts;
        let influences = &skin.influences;
        let offsets = match deform {
            Some(deform) if deform.len() * 2 == influences.len() => Some(deform),
            Some(deform) => {
                report_skeleton_2d_deform_length_mismatch(
                    guards,
                    subject,
                    deform.len(),
                    influences.len() / 2,
                );
                None
            }
            None => None,
        };
        let mut vi = 0usize;
        let mut di = 0usize;
        let mut oi = 0usize;
        for v in 0..counts.len() {
            let mut wx = 0.0f32;
            let mut wy = 0.0f32;
            let n = counts[v] as usize;
            for _ in 0..n {
                let b = influences[vi] as usize * SKELETON_2D_MATRIX_STRIDE;
                let lx = match offsets {
                    Some(offsets) => influences[vi + 1] + offsets[di],
                    None => influences[vi + 1],
                };
                let ly = match offsets {
                    Some(offsets) => influences[vi + 2] + offsets[di + 1],
                    None => influences[vi + 2],
                };
                let weight = influences[vi + 3];
                wx += weight * (world[b] * lx + world[b + 2] * ly + world[b + 4]);
                wy += weight * (world[b + 1] * lx + world[b + 3] * ly + world[b + 5]);
                vi += 4;
                di += 2;
            }
            out[oi] = wx;
            out[oi + 1] = wy;
            oi += 2;
        }
        return;
    }
    let Some(vertices) = vertices else {
        return;
    };
    if bone_index < 0 || bone_index as usize * SKELETON_2D_MATRIX_STRIDE >= world.len() {
        return;
    }
    let offsets = match deform {
        Some(deform) if deform.len() == vertices.len() => Some(deform),
        Some(deform) => {
            report_skeleton_2d_deform_length_mismatch(
                guards,
                subject,
                deform.len(),
                vertices.len(),
            );
            None
        }
        None => None,
    };
    let b = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let (a, bb, c, d, tx, ty) = (
        world[b],
        world[b + 1],
        world[b + 2],
        world[b + 3],
        world[b + 4],
        world[b + 5],
    );
    for i in (0..vertices.len()).step_by(2) {
        let vx = match offsets {
            Some(offsets) => vertices[i] + offsets[i],
            None => vertices[i],
        };
        let vy = match offsets {
            Some(offsets) => vertices[i + 1] + offsets[i + 1],
            None => vertices[i + 1],
        };
        out[i] = a * vx + c * vy + tx;
        out[i + 1] = bb * vx + d * vy + ty;
    }
}
