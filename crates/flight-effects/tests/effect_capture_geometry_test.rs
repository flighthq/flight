use std::any::Any;

use super::*;
use flight_entity::{Entity, EntityRuntimeSlot, UnknownValue};
use flight_geometry::{Matrix, Rectangle, create_matrix, create_rectangle, set_rectangle};
use flight_node::contract::*;
use flight_render::{
    RenderTargetPadding, RenderTargetSize, compute_render_target_size,
    compute_scene_2d_render_target_transform,
};

#[derive(Default)]
struct TestNode2D {
    fields: NodeFields,
    appearance: HasAppearance,
    appearance_runtime: HasAppearanceRuntime,
    transform2d: HasTransform2D,
    transform2d_runtime: HasTransform2DRuntime,
    bounds_runtime: HasBoundsRectangleRuntime,
}

impl Entity for TestNode2D {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return self.fields.entity_runtime();
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return self.fields.entity_runtime_mut();
    }
}

impl Node for TestNode2D {
    fn node_fields(&self) -> &NodeFields {
        return &self.fields;
    }

    fn node_fields_mut(&mut self) -> &mut NodeFields {
        return &mut self.fields;
    }

    fn as_any(&self) -> &dyn Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        return self;
    }

    fn as_transform2d_node(&self) -> Option<&dyn Transform2DNode> {
        return Some(self);
    }

    fn as_transform2d_node_mut(&mut self) -> Option<&mut dyn Transform2DNode> {
        return Some(self);
    }

    fn as_bounds_node(&self) -> Option<&dyn BoundsNode> {
        return Some(self);
    }

    fn as_bounds_node_mut(&mut self) -> Option<&mut dyn BoundsNode> {
        return Some(self);
    }

    fn as_appearance_node(&self) -> Option<&dyn AppearanceNode> {
        return Some(self);
    }
}

impl Transform2DNode for TestNode2D {
    fn transform2d(&self) -> Transform2DRef<'_> {
        return self.transform2d.as_ref();
    }

    fn transform2d_mut(&mut self) -> Transform2DMut<'_> {
        return self.transform2d.as_mut();
    }

    fn transform2d_runtime(&self) -> &HasTransform2DRuntime {
        return &self.transform2d_runtime;
    }

    fn transform2d_runtime_mut(&mut self) -> &mut HasTransform2DRuntime {
        return &mut self.transform2d_runtime;
    }
}

impl BoundsNode for TestNode2D {
    fn bounds_runtime(&self) -> &HasBoundsRectangleRuntime {
        return &self.bounds_runtime;
    }

    fn bounds_runtime_mut(&mut self) -> &mut HasBoundsRectangleRuntime {
        return &mut self.bounds_runtime;
    }
}

impl AppearanceNode for TestNode2D {
    fn appearance(&self) -> AppearanceRef<'_> {
        return self.appearance.as_ref();
    }

    fn appearance_mut(&mut self) -> AppearanceMut<'_> {
        return self.appearance.as_mut();
    }

    fn appearance_runtime(&self) -> &HasAppearanceRuntime {
        return &self.appearance_runtime;
    }

    fn appearance_runtime_mut(&mut self) -> &mut HasAppearanceRuntime {
        return &mut self.appearance_runtime;
    }
}

fn asymmetric_resolver(_: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 7.0,
        left: 2.0,
        right: 5.0,
        top: 3.0,
    };
}

fn second_resolver(_: &UnknownValue) -> EffectPadding {
    return EffectPadding {
        bottom: 1.0,
        left: 2.0,
        right: 3.0,
        top: 4.0,
    };
}

fn create_capture_node(bounds: Rectangle, x: f32, y: f32, rotation: f32) -> NodeRef {
    let captured = bounds.clone();
    let mut node: TestNode2D = create_node("CaptureGeometryTest".to_string());
    node.bounds_runtime.compute_local_bounds_rectangle = Arc::new(move |out, _| {
        flight_geometry::copy_rectangle(out, &captured);
    });
    node.transform2d.x = x;
    node.transform2d.y = y;
    node.transform2d.rotation = rotation;
    let out: NodeRef = Arc::new(RwLock::new(node));
    invalidate_node_local_bounds(&out);
    invalidate_node_local_transform(&out);
    return out;
}

fn create_out() -> EffectCaptureGeometry {
    return EffectCaptureGeometry {
        bounds: create_rectangle(0.0, 0.0, 0.0, 0.0),
        capture_transform: create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0),
        padding: zero_padding(),
        target_height: 0.0,
        target_width: 0.0,
    };
}

fn capture_out_values(out: &EffectCaptureGeometry) -> [f32; 16] {
    return [
        out.bounds.x,
        out.bounds.y,
        out.bounds.width,
        out.bounds.height,
        out.padding.bottom,
        out.padding.left,
        out.padding.right,
        out.padding.top,
        out.capture_transform.a,
        out.capture_transform.b,
        out.capture_transform.c,
        out.capture_transform.d,
        out.capture_transform.tx,
        out.capture_transform.ty,
        out.target_width,
        out.target_height,
    ];
}

fn assert_matrix_close(actual: &Matrix, expected: &Matrix) {
    // D1 f32 bound (TS: toBeCloseTo default precision 2).
    for (actual, expected) in [
        (actual.a, expected.a),
        (actual.b, expected.b),
        (actual.c, expected.c),
        (actual.d, expected.d),
        (actual.tx, expected.tx),
        (actual.ty, expected.ty),
    ] {
        assert_close(actual, expected, 0.005);
    }
}

fn set_node_x(node: &NodeRef, x: f32) {
    let mut guard = node.write().unwrap();
    let concrete = guard.as_any_mut().downcast_mut::<TestNode2D>().unwrap();
    concrete.transform2d.x = x;
    drop(guard);
    invalidate_node_local_transform(node);
}

#[derive(Default)]
struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

fn test_effect(kind: &str) -> EffectRef {
    let mut effect: TestEffect = flight_entity::allocate_entity();
    initialize_effect(&mut effect, kind);
    return owned_effect(effect);
}

mod compute_effect_capture_geometry {
    use super::*;

    #[test]
    fn matches_existing_geometry_primitives() {
        let mut state = fresh_render_state();
        register_effect_padding_resolver(&mut state, "acme.First", Some(asymmetric_resolver));
        register_effect_padding_resolver(&mut state, "acme.Second", Some(second_resolver));
        let source = create_capture_node(create_rectangle(-2.0, -3.0, 10.25, 20.75), 0.0, 0.0, 0.0);
        let child = create_capture_node(create_rectangle(0.0, 0.0, 4.0, 6.0), 30.0, 12.0, 0.0);
        add_node_child(&source, &child);
        let effects = [test_effect("acme.First"), test_effect("acme.Second")];
        let mut out = create_out();
        assert!(compute_effect_capture_geometry(
            &mut out, &mut state, &source, &effects
        ));

        let mut bounds = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_node_root_local_bounds_rectangle(&mut bounds, &source);
        let mut padding = zero_padding();
        compute_effect_padding(&mut padding, &mut state, &effects);
        let mut target_size = RenderTargetSize {
            height: 0.0,
            width: 0.0,
        };
        compute_render_target_size(
            &mut target_size,
            &bounds,
            Some(RenderTargetPadding::Edges(padding)),
            None,
            None,
        );
        let mut capture_transform = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene_2d_render_target_transform(
            &mut capture_transform,
            &source,
            &bounds,
            Some(padding.left),
            Some(padding.top),
        );
        assert_eq!(out.bounds, bounds);
        assert_eq!(out.padding, padding);
        assert_matrix_close(&out.capture_transform, &capture_transform);
        assert_eq!(out.target_height, target_size.height);
        assert_eq!(out.target_width, target_size.width);
    }

    #[test]
    fn preserves_output_for_zero_area_bounds() {
        let mut state = fresh_render_state();
        let source = create_capture_node(create_rectangle(5.0, 10.0, 0.0, 0.0), 0.0, 0.0, 0.0);
        let mut out = create_out();
        set_rectangle(&mut out.bounds, 1.0, 2.0, 3.0, 4.0);
        out.target_width = 99.0;
        out.target_height = 88.0;
        let before = capture_out_values(&out);
        assert!(!compute_effect_capture_geometry(
            &mut out,
            &mut state,
            &source,
            &[]
        ));
        assert_eq!(capture_out_values(&out), before);
    }

    #[test]
    fn preserves_every_output_field_for_empty_root_local_bounds() {
        let mut state = fresh_render_state();
        let source = create_capture_node(create_rectangle(3.0, 4.0, 0.0, 9.0), 0.0, 0.0, 0.0);
        let mut out = create_out();
        set_rectangle(&mut out.bounds, 10.0, 20.0, 30.0, 40.0);
        out.padding = EffectPadding {
            bottom: 1.0,
            left: 2.0,
            right: 3.0,
            top: 4.0,
        };
        out.capture_transform = create_matrix(5.0, 6.0, 7.0, 8.0, 9.0, 10.0);
        out.target_width = 11.0;
        out.target_height = 12.0;
        let before = capture_out_values(&out);
        assert!(!compute_effect_capture_geometry(
            &mut out,
            &mut state,
            &source,
            &[]
        ));
        assert_eq!(capture_out_values(&out), before);
    }

    #[test]
    fn reuses_the_caller_owned_output_fields_across_writes() {
        let mut state = fresh_render_state();
        let source = create_capture_node(create_rectangle(1.0, 2.0, 3.0, 4.0), 0.0, 0.0, 0.0);
        let mut out = create_out();
        let bounds = std::ptr::addr_of!(out.bounds);
        let padding = std::ptr::addr_of!(out.padding);
        let capture_transform = std::ptr::addr_of!(out.capture_transform);
        assert!(compute_effect_capture_geometry(
            &mut out,
            &mut state,
            &source,
            &[]
        ));
        set_node_x(&source, 17.0);
        assert!(compute_effect_capture_geometry(
            &mut out,
            &mut state,
            &source,
            &[]
        ));
        assert_eq!(std::ptr::addr_of!(out.bounds), bounds);
        assert_eq!(std::ptr::addr_of!(out.padding), padding);
        assert_eq!(std::ptr::addr_of!(out.capture_transform), capture_transform);
    }

    #[test]
    fn writes_asymmetric_padding_target_dimensions_and_matching_transform() {
        let mut state = fresh_render_state();
        register_effect_padding_resolver(&mut state, "acme.Asymmetric", Some(asymmetric_resolver));
        let source =
            create_capture_node(create_rectangle(-10.0, 6.0, 20.4, 11.2), 50.0, -30.0, 27.0);
        let mut out = create_out();
        assert!(compute_effect_capture_geometry(
            &mut out,
            &mut state,
            &source,
            &[test_effect("acme.Asymmetric")],
        ));
        assert_eq!(out.bounds, create_rectangle(-10.0, 6.0, 20.4, 11.2));
        assert_eq!(
            out.padding,
            EffectPadding {
                bottom: 7.0,
                left: 2.0,
                right: 5.0,
                top: 3.0
            }
        );
        assert_eq!(out.target_width, 28.0);
        assert_eq!(out.target_height, 22.0);
        let mut expected = create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
        compute_scene_2d_render_target_transform(
            &mut expected,
            &source,
            &out.bounds,
            Some(2.0),
            Some(3.0),
        );
        assert_matrix_close(&out.capture_transform, &expected);
    }
}
