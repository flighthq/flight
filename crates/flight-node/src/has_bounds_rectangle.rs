//! Bounds extent field group and runtime initialization (TS `hasBoundsRectangle.ts`).

use flight_geometry::Rectangle;

use crate::types::*;

/// Methods a bounds runtime owner may supply (TS `Partial<MethodsOf<HasBoundsRectangleRuntime>>`).
#[derive(Clone, Default)]
pub struct BoundsRectangleRuntimeMethods {
    pub compute_local_bounds_rectangle: Option<NodeLocalBoundsComputer>,
    pub is_local_bounds_rectangle_valid: Option<NodeLocalBoundsValidity>,
}

/// Options for `init_bounds_rectangle_trait` (TS `Partial<HasBoundsRectangle>`; empty today).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct HasBoundsRectangleOptions {}

/// The source's default local-bounds computation: no extent unless a kind overrides it
/// (TS `defaultComputeLocalBoundsRectangle`).
pub fn default_compute_local_bounds_rectangle(
    _out: &mut Rectangle,
    _source: &dyn crate::types::Node,
) {
}

/// Initializes the bounds runtime tier (TS `initBoundsRectangleRuntimeTrait`).
pub fn init_bounds_rectangle_runtime_trait(
    target: &mut HasBoundsRectangleRuntime,
    methods: Option<&BoundsRectangleRuntimeMethods>,
) {
    *target = init_bounds_rectangle_runtime_value(methods);
}

/// The bounds field group has no entity fields today; the initializer stays for composition parity
/// (TS `initBoundsRectangleTrait`).
pub fn init_bounds_rectangle_trait(
    _target: &mut HasBoundsRectangle,
    _obj: Option<&HasBoundsRectangleOptions>,
) {
}
