//! Deform-length explanations (TS `explainSkeleton2DDeformLength.ts`).

use crate::types::*;

/// Answers, as plain data, why a deform offset stream was applied or ignored (TS
/// `explainSkeleton2DDeformLength`). Weighted streams are addressed per influence, rigid ones per
/// vertex.
// flight-lint: allow(conform-array) typed-array inputs map to slices; no allocation or identity change
pub fn explain_skeleton_2d_deform_length(
    skin: Option<&Skin2D>,
    vertices: Option<&[f32]>,
    deform: Option<&[f32]>,
) -> Skeleton2DDeformLengthExplanation {
    let weighted = skin.is_some();
    let addressed = match skin {
        Some(skin) => skin.influences.len() / 2,
        None => vertices.map(|vertices| vertices.len()).unwrap_or(0),
    };
    let offsets = deform.map(|deform| deform.len()).unwrap_or(0);
    return Skeleton2DDeformLengthExplanation {
        accepted: deform.is_some() && offsets == addressed,
        addressed,
        addressing: String::from(if weighted { "weighted" } else { "rigid" }),
        offsets,
    };
}
