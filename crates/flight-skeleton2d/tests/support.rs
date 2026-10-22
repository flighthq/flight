use std::any::Any;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{EntityRuntimeSlot, allocate_entity};
use flight_node::contract::{Node, NodeFields, NodeRef, create_node};
use flight_skeleton2d::contract::*;

pub fn bone() -> Bone2D {
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

pub fn skeleton(bones: Vec<Bone2D>, slots: Option<Vec<Slot2D>>) -> Skeleton2D {
    let mut out = create_skeleton_2d(bones);
    out.slots = slots;
    return out;
}

pub fn slot(bone_index: i32) -> Slot2D {
    return Slot2D {
        attachment: None,
        deform: None,
        bone_index,
        color: None,
        name: None,
    };
}

pub fn region(width: f32, height: f32) -> RegionAttachment2D {
    let mut out: RegionAttachment2D = allocate_entity();
    out.kind = String::from(REGION_ATTACHMENT_2D_KIND);
    out.width = width;
    out.height = height;
    out.scale_x = 1.0;
    out.scale_y = 1.0;
    return out;
}

pub fn vertex_at(out: &[f32], vertex: usize) -> (f32, f32) {
    return (out[vertex * 2], out[vertex * 2 + 1]);
}

pub fn close(a: f32, b: f32) -> bool {
    return (a - b).abs() <= 1e-4;
}

pub fn empty_guards() -> Skeleton2DGuardState {
    return Skeleton2DGuardState {
        coerced_interpolation: None,
        deform_length: None,
    };
}

pub fn recording_guards() -> (
    Skeleton2DGuardState,
    Arc<Mutex<Vec<(String, usize, usize)>>>,
) {
    let reports = Arc::new(Mutex::new(Vec::new()));
    let sink = reports.clone();
    let mut guards = empty_guards();
    guards.deform_length = Some(Arc::new(move |report: &Skeleton2DDeformLengthMismatch| {
        sink.lock()
            .unwrap()
            .push((report.subject.clone(), report.offsets, report.addressed));
    }));
    return (guards, reports);
}

pub fn region_ref(attachment: RegionAttachment2D) -> Attachment2DRef {
    return Arc::new(std::sync::RwLock::new(attachment));
}

/// Minimal node for draw-order tests: ordering is kind-agnostic and permutes children.
#[derive(Default)]
pub struct TestNode {
    runtime: EntityRuntimeSlot,
    node: NodeFields,
}

impl Node for TestNode {
    fn node_fields(&self) -> &NodeFields {
        return &self.node;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.node;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        return self;
    }
}

flight_entity::impl_entity!(TestNode);

pub fn test_node() -> NodeRef {
    return Arc::new(RwLock::new(create_node::<TestNode>(String::from(
        "test.SkeletonNode",
    ))));
}

/// A guard state that records coerced-interpolation reports as `subject:stated`.
pub fn recording_coerced_guards() -> (Skeleton2DGuardState, Arc<Mutex<Vec<String>>>) {
    let reports = Arc::new(Mutex::new(Vec::new()));
    let sink = reports.clone();
    let mut guards = empty_guards();
    guards.coerced_interpolation =
        Some(Arc::new(move |report: &Skeleton2DCoercedInterpolation| {
            sink.lock()
                .unwrap()
                .push(format!("{}:{}", report.subject, report.stated));
        }));
    return (guards, reports);
}
