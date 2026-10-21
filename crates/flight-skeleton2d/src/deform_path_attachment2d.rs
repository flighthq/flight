//! Path attachment deformation (TS `deformPathAttachment2D.ts`).

use flight_path::Path;

use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::skin_attachment2d_points::skin_skeleton_2d_attachment_points;
use crate::types::*;

/// Deforms a path attachment into `out`, writing its command/winding stream and world coordinates
/// (TS `deformSkeleton2DPathAttachment`). Control points need no special case: an importer gives a
/// handle its anchor's influence set, so it arrives as an ordinary influence entry.
// flight-lint: allow(f64) flight-path stores path data as f64; deformed f32 coordinates are widened into that lane (D1 path precedent)
// flight-lint: allow(conform-params) D5: the caller-owned guard state is threaded explicitly instead of a module-global slot
pub fn deform_skeleton_2d_path_attachment(
    out: &mut Path,
    attachment: &PathAttachment2D,
    skeleton: &Skeleton2D,
    bone_index: i32,
    deform: Option<&[f32]>,
    guards: &Skeleton2DGuardState,
) {
    out.commands.clear();
    out.commands.extend_from_slice(&attachment.commands);
    out.winding = attachment.winding;
    let mut points = vec![0.0f32; attachment.point_count * 2];
    skin_skeleton_2d_attachment_points(
        &mut points,
        attachment.skin.as_ref(),
        attachment.vertices.as_deref(),
        skeleton,
        bone_index,
        deform,
        "PathAttachment2D",
        guards,
    );
    out.data.clear();
    out.data.extend(points.iter().map(|value| *value as f64));
}
