//! D18 sugar: thin receiver methods delegating to the free-function contract.

use flight_geometry::{Matrix, Vector2};
use flight_path::Path;

use crate::bounding_box_attachment2d::compute_skeleton_2d_bounding_box_attachment_vertices;
use crate::clipping_attachment2d::{
    Skeleton2DClippingAttachmentSlotRange, compute_skeleton_2d_clipping_attachment_vertices,
    get_skeleton_2d_clipping_attachment_slot_range,
};
use crate::deform_mesh_attachment2d::deform_skeleton_2d_mesh_attachment;
use crate::deform_path_attachment2d::deform_skeleton_2d_path_attachment;
use crate::point_attachment2d::{
    compute_skeleton_2d_point_attachment_position, compute_skeleton_2d_point_attachment_rotation,
};
use crate::region_attachment2d::compute_skeleton_2d_region_attachment_vertices;
use crate::skeleton2d::*;
use crate::skeleton2d_guards::Skeleton2DGuardState;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use flight_entity::allocate_entity;

    use super::*;

    fn bone() -> Bone2D {
        return Bone2D {
            length: 0.0,
            name: None,
            parent_index: -1,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            shear_x: 0.0,
            shear_y: 0.0,
            transform_mode: TRANSFORM_MODE_2D_NORMAL,
            x: 0.0,
            y: 0.0,
        };
    }

    fn skeleton() -> Skeleton2D {
        return create_skeleton_2d(vec![bone()]);
    }

    fn region() -> RegionAttachment2D {
        let mut out: RegionAttachment2D = allocate_entity();
        out.width = 2.0;
        out.height = 2.0;
        out.scale_x = 1.0;
        out.scale_y = 1.0;
        return out;
    }

    #[test]
    fn skeleton_methods_match_their_free_functions() {
        let mut a = skeleton();
        let mut b = skeleton();
        a.compute_world_transforms();
        compute_skeleton_2d_world_transforms(&mut b);
        assert!(a.equals(&b));
        assert_eq!(
            a.get_bone_index_by_name("none"),
            get_skeleton_2d_bone_index_by_name(&b, "none")
        );
        assert_eq!(a.validate(), validate_skeleton_2d(&b));
        a.set_bind_pose();
        set_skeleton_2d_bind_pose(&mut b);
        a.compute_bone_matrices();
        compute_skeleton_2d_bone_matrices(&mut b);
        assert_eq!(a.bone_matrices, b.bone_matrices);
        let mut c = clone_skeleton_2d(&b);
        assert!(c.equals(&b));
        c.dispose();
        assert!(c.bones.is_empty());
    }

    #[test]
    fn attachment_methods_match_their_free_functions() {
        let s = skeleton();
        let attachment = region();
        let mut method_out = [0.0f32; 8];
        let mut free_out = [0.0f32; 8];
        attachment.compute_vertices(&mut method_out, &s, 0);
        compute_skeleton_2d_region_attachment_vertices(&mut free_out, &attachment, &s, 0);
        assert_eq!(method_out, free_out);
        let mut clipping: ClippingAttachment2D = allocate_entity();
        clipping.end_slot_index = 3;
        assert_eq!(
            clipping.slot_range(1, 5),
            get_skeleton_2d_clipping_attachment_slot_range(&clipping, 1, 5)
        );
    }
}

/// Receiver sugar over the skeleton free functions.
pub trait Skeleton2DMethods {
    fn clone(&self) -> Skeleton2D;
    fn compute_bone_matrices(&mut self);
    fn compute_bone_world_transform(&mut self, bone_index: i32);
    fn compute_world_transforms(&mut self);
    fn dispose(&mut self);
    fn equals(&self, other: &Skeleton2D) -> bool;
    fn get_bone_index_by_name(&self, name: &str) -> i32;
    fn get_bone_world_matrix(&self, out: &mut Matrix, bone_index: i32) -> bool;
    fn get_skin(&self, name: &str) -> Option<&AttachmentSkin2D>;
    fn reset_to_setup(&mut self, setup: &Skeleton2D);
    fn set_bind_pose(&mut self);
    fn set_skin(&mut self, skin: &AttachmentSkin2D);
    fn validate(&self) -> Option<String>;
}

impl Skeleton2DMethods for Skeleton2D {
    fn clone(&self) -> Skeleton2D {
        return clone_skeleton_2d(self);
    }

    fn compute_bone_matrices(&mut self) {
        compute_skeleton_2d_bone_matrices(self);
    }

    fn compute_bone_world_transform(&mut self, bone_index: i32) {
        compute_skeleton_2d_bone_world_transform(self, bone_index);
    }

    fn compute_world_transforms(&mut self) {
        compute_skeleton_2d_world_transforms(self);
    }

    fn dispose(&mut self) {
        dispose_skeleton_2d(self);
    }

    fn equals(&self, other: &Skeleton2D) -> bool {
        return equals_skeleton_2d(self, other);
    }

    fn get_bone_index_by_name(&self, name: &str) -> i32 {
        return get_skeleton_2d_bone_index_by_name(self, name);
    }

    fn get_bone_world_matrix(&self, out: &mut Matrix, bone_index: i32) -> bool {
        return get_skeleton_2d_bone_world_matrix(out, self, bone_index);
    }

    fn get_skin(&self, name: &str) -> Option<&AttachmentSkin2D> {
        return get_skeleton_2d_skin(self, name);
    }

    fn reset_to_setup(&mut self, setup: &Skeleton2D) {
        reset_skeleton_2d_to_setup(setup, self);
    }

    fn set_bind_pose(&mut self) {
        set_skeleton_2d_bind_pose(self);
    }

    fn set_skin(&mut self, skin: &AttachmentSkin2D) {
        set_skeleton_2d_skin(self, skin);
    }

    fn validate(&self) -> Option<String> {
        return validate_skeleton_2d(self);
    }
}

impl RegionAttachment2D {
    pub fn compute_vertices(&self, out: &mut [f32], skeleton: &Skeleton2D, bone_index: i32) {
        compute_skeleton_2d_region_attachment_vertices(out, self, skeleton, bone_index);
    }
}

impl MeshAttachment2D {
    pub fn deform(
        &self,
        out: &mut [f32],
        skeleton: &Skeleton2D,
        bone_index: i32,
        deform: Option<&[f32]>,
        guards: &Skeleton2DGuardState,
    ) {
        deform_skeleton_2d_mesh_attachment(out, self, skeleton, bone_index, deform, guards);
    }
}

impl PathAttachment2D {
    pub fn deform(
        &self,
        out: &mut Path,
        skeleton: &Skeleton2D,
        bone_index: i32,
        deform: Option<&[f32]>,
        guards: &Skeleton2DGuardState,
    ) {
        deform_skeleton_2d_path_attachment(out, self, skeleton, bone_index, deform, guards);
    }
}

impl PointAttachment2D {
    pub fn compute_position(&self, out: &mut Vector2, skeleton: &Skeleton2D, bone_index: i32) {
        compute_skeleton_2d_point_attachment_position(out, self, skeleton, bone_index);
    }

    pub fn compute_rotation(&self, skeleton: &Skeleton2D, bone_index: i32) -> f32 {
        return compute_skeleton_2d_point_attachment_rotation(self, skeleton, bone_index);
    }
}

impl BoundingBoxAttachment2D {
    pub fn compute_vertices(
        &self,
        out: &mut [f32],
        skeleton: &Skeleton2D,
        bone_index: i32,
        deform: Option<&[f32]>,
        guards: &Skeleton2DGuardState,
    ) {
        compute_skeleton_2d_bounding_box_attachment_vertices(
            out, self, skeleton, bone_index, deform, guards,
        );
    }
}

impl ClippingAttachment2D {
    pub fn compute_vertices(
        &self,
        out: &mut [f32],
        skeleton: &Skeleton2D,
        bone_index: i32,
        deform: Option<&[f32]>,
        guards: &Skeleton2DGuardState,
    ) {
        compute_skeleton_2d_clipping_attachment_vertices(
            out, self, skeleton, bone_index, deform, guards,
        );
    }

    pub fn slot_range(
        &self,
        slot_index: i32,
        slot_count: i32,
    ) -> Skeleton2DClippingAttachmentSlotRange {
        return get_skeleton_2d_clipping_attachment_slot_range(self, slot_index, slot_count);
    }
}
