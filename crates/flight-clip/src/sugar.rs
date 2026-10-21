use std::sync::Arc;

use flight_entity::Ref;
use flight_geometry::{Matrix, Rectangle};
use flight_log::LogStateRef;
use flight_path::{Path, PathWinding};

use crate::clip_region::*;
use crate::enable_clip_guards::{disable_clip_guards, enable_clip_guards};
use crate::types::{ClipRegion, ClipRegionExplanation, ClipRegionState};

/// Rust-side sugar for the shared clip handle. Every method delegates to the free-function contract;
/// explicit state remains visible so a method call cannot hide the pool or diagnostics.
pub trait ClipRegionMethods {
    fn bounds(&self, state: &ClipRegionState, out: &mut Rectangle);
    fn clone_region(&self, state: &ClipRegionState) -> Ref<ClipRegion>;
    fn contains_clip_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool;
    // flight-lint: allow(f64) point queries compare against f64 Path.data contour coordinates
    fn contains_point(&self, state: &ClipRegionState, x: f64, y: f64) -> bool;
    fn contains_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle) -> bool;
    fn copy_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>);
    fn equals_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool;
    fn explain(&self, state: &ClipRegionState) -> ClipRegionExplanation;
    fn intersect_from(&self, state: &ClipRegionState, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>);
    fn intersects_clip_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool;
    fn intersects_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle) -> bool;
    fn invalidate(&self, state: &ClipRegionState);
    fn is_empty(&self, state: &ClipRegionState) -> bool;
    fn is_rectangular(&self, state: &ClipRegionState) -> bool;
    fn normalize_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>);
    fn release(&self, state: &mut ClipRegionState);
    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    fn set_contours(&self, state: &ClipRegionState, contours: &[Vec<f64>], winding: PathWinding);
    fn set_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle);
    fn transform_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>, matrix: &Matrix);
    fn union_from(&self, state: &ClipRegionState, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>);
}

/// Sugar for the explicit pool/guard owner. This is the only stateful surface outside a region.
pub trait ClipRegionStateMethods {
    fn acquire(&mut self) -> Ref<ClipRegion>;
    fn disable_guards(&mut self);
    // flight-lint: allow(f64) the injected clock reports millisecond operation timestamps
    fn enable_guards(&mut self, log_state: &LogStateRef, clock: Arc<dyn Fn() -> f64 + Send + Sync>);
}

impl ClipRegionMethods for Ref<ClipRegion> {
    fn bounds(&self, state: &ClipRegionState, out: &mut Rectangle) {
        get_clip_region_bounds(state, out, self);
    }

    fn clone_region(&self, state: &ClipRegionState) -> Ref<ClipRegion> {
        return clone_clip_region(state, self);
    }

    fn contains_clip_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool {
        return clip_region_contains_clip_region(state, self, other);
    }

    // flight-lint: allow(f64) point queries compare against f64 Path.data contour coordinates
    fn contains_point(&self, state: &ClipRegionState, x: f64, y: f64) -> bool {
        return clip_region_contains_point(state, self, x, y);
    }

    fn contains_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle) -> bool {
        return clip_region_contains_rectangle(state, self, rectangle);
    }

    fn copy_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>) {
        copy_clip_region(state, self, source);
    }

    fn equals_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool {
        return equals_clip_region(state, self, other);
    }

    fn explain(&self, state: &ClipRegionState) -> ClipRegionExplanation {
        return explain_clip_region(state, self);
    }

    fn intersect_from(&self, state: &ClipRegionState, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
        intersect_clip_regions(state, self, a, b);
    }

    fn intersects_clip_region(&self, state: &ClipRegionState, other: &Ref<ClipRegion>) -> bool {
        return clip_region_intersects_clip_region(state, self, other);
    }

    fn intersects_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle) -> bool {
        return clip_region_intersects_rectangle(state, self, rectangle);
    }

    fn invalidate(&self, state: &ClipRegionState) {
        invalidate_clip_region(state, self);
    }

    fn is_empty(&self, state: &ClipRegionState) -> bool {
        return is_clip_region_empty(state, self);
    }

    fn is_rectangular(&self, state: &ClipRegionState) -> bool {
        return is_clip_region_rectangular(state, self);
    }

    fn normalize_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>) {
        normalize_clip_region(state, self, source);
    }

    fn release(&self, state: &mut ClipRegionState) {
        release_clip_region(state, self);
    }

    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    fn set_contours(&self, state: &ClipRegionState, contours: &[Vec<f64>], winding: PathWinding) {
        set_clip_region_to_contours(state, self, contours, winding);
    }

    fn set_rectangle(&self, state: &ClipRegionState, rectangle: &Rectangle) {
        set_clip_region_to_rectangle(state, self, rectangle);
    }

    fn transform_from(&self, state: &ClipRegionState, source: &Ref<ClipRegion>, matrix: &Matrix) {
        transform_clip_region(state, self, source, matrix);
    }

    fn union_from(&self, state: &ClipRegionState, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
        union_clip_regions(state, self, a, b);
    }
}

impl ClipRegionStateMethods for ClipRegionState {
    fn acquire(&mut self) -> Ref<ClipRegion> {
        return acquire_clip_region(self);
    }

    fn disable_guards(&mut self) {
        disable_clip_guards(self);
    }

    // flight-lint: allow(f64) the injected clock reports millisecond operation timestamps
    fn enable_guards(
        &mut self,
        log_state: &LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        enable_clip_guards(self, log_state, clock);
    }
}

impl ClipRegion {
    // flight-lint: allow(f64) circle geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_circle(x: f64, y: f64, radius: f64, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_circle(x, y, radius, tolerance);
    }

    // flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
    pub fn new_from_contours(
        state: &ClipRegionState,
        contours: &[Vec<f64>],
        winding: PathWinding,
    ) -> Ref<ClipRegion> {
        return create_clip_region_from_contours(state, contours, winding);
    }

    // flight-lint: allow(f64) ellipse geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_ellipse(rectangle: &Rectangle, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_ellipse(rectangle, tolerance);
    }

    // flight-lint: allow(f64) flatten tolerance belongs to the f64 Path.data geometry lane
    pub fn new_from_path(path: &Path, tolerance: Option<f64>) -> Ref<ClipRegion> {
        return create_clip_region_from_path(path, tolerance);
    }

    pub fn new_from_rectangle(rectangle: &Rectangle) -> Ref<ClipRegion> {
        return create_clip_region_from_rectangle(rectangle);
    }

    // flight-lint: allow(f64) rounded rectangle geometry feeds the f64 Path.data lane without truncation
    pub fn new_from_rounded_rectangle(
        rectangle: &Rectangle,
        radius: f64,
        tolerance: Option<f64>,
    ) -> Ref<ClipRegion> {
        return create_clip_region_from_rounded_rectangle(rectangle, radius, tolerance);
    }
}

#[cfg(test)]
macro_rules! sugar_tests_module {
    () => {
mod sugar_tests {
    use std::sync::RwLock;

    use flight_geometry::{create_matrix, create_rectangle};
    use flight_log::create_log_state;
    use flight_path::{PathWinding, create_path};

    use super::*;

    fn same(a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) -> bool {
        let a = a.read().unwrap();
        let b = b.read().unwrap();
        return a.rect == b.rect
            && a.contours == b.contours
            && a.winding == b.winding
            && a.version == b.version;
    }

    fn triangle() -> Vec<Vec<f64>> {
        return vec![vec![0.0, 0.0, 10.0, 0.0, 5.0, 10.0]];
    }

    #[test]
    fn clip_region_bounds_matches_get_clip_region_bounds() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_rectangle(&create_rectangle(1.0, 2.0, 3.0, 4.0));
        let mut method = create_rectangle(0.0, 0.0, 0.0, 0.0);
        let mut function = create_rectangle(0.0, 0.0, 0.0, 0.0);
        clip.bounds(&state, &mut method);
        get_clip_region_bounds(&state, &mut function, &clip);
        assert_eq!(method, function);
    }

    #[test]
    fn clip_region_clone_matches_clone_clip_region() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        assert!(same(
            &clip.clone_region(&state),
            &clone_clip_region(&state, &clip)
        ));
    }

    #[test]
    fn clip_region_contains_clip_region_matches_free_function() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&create_rectangle(1.0, 1.0, 2.0, 2.0));
        assert_eq!(
            a.contains_clip_region(&state, &b),
            clip_region_contains_clip_region(&state, &a, &b)
        );
    }

    #[test]
    fn clip_region_contains_point_matches_free_function() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        assert_eq!(
            clip.contains_point(&state, 5.0, 5.0),
            clip_region_contains_point(&state, &clip, 5.0, 5.0)
        );
    }

    #[test]
    fn clip_region_contains_rectangle_matches_free_function() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let rectangle = create_rectangle(1.0, 1.0, 2.0, 2.0);
        assert_eq!(
            clip.contains_rectangle(&state, &rectangle),
            clip_region_contains_rectangle(&state, &clip, &rectangle)
        );
    }

    #[test]
    fn clip_region_copy_from_matches_copy_clip_region() {
        let state = create_clip_region_state();
        let source = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.copy_from(&state, &source);
        copy_clip_region(&state, &function, &source);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_equals_matches_equals_clip_region() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let b = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        assert_eq!(
            a.equals_region(&state, &b),
            equals_clip_region(&state, &a, &b)
        );
    }

    #[test]
    fn clip_region_explain_matches_explain_clip_region() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        assert_eq!(clip.explain(&state), explain_clip_region(&state, &clip));
    }

    #[test]
    fn clip_region_intersect_from_matches_intersect_clip_regions() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&create_rectangle(5.0, 5.0, 10.0, 10.0));
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.intersect_from(&state, &a, &b);
        intersect_clip_regions(&state, &function, &a, &b);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_intersects_clip_region_matches_free_function() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&create_rectangle(5.0, 5.0, 10.0, 10.0));
        assert_eq!(
            a.intersects_clip_region(&state, &b),
            clip_region_intersects_clip_region(&state, &a, &b)
        );
    }

    #[test]
    fn clip_region_intersects_rectangle_matches_free_function() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let rectangle = create_rectangle(5.0, 5.0, 10.0, 10.0);
        assert_eq!(
            clip.intersects_rectangle(&state, &rectangle),
            clip_region_intersects_rectangle(&state, &clip, &rectangle)
        );
    }

    #[test]
    fn clip_region_invalidate_matches_invalidate_clip_region() {
        let state = create_clip_region_state();
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.invalidate(&state);
        invalidate_clip_region(&state, &function);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_is_empty_matches_is_clip_region_empty() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 0.0, 1.0));
        assert_eq!(clip.is_empty(&state), is_clip_region_empty(&state, &clip));
    }

    #[test]
    fn clip_region_is_rectangular_matches_is_clip_region_rectangular() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        assert_eq!(
            clip.is_rectangular(&state),
            is_clip_region_rectangular(&state, &clip)
        );
    }

    #[test]
    fn clip_region_normalize_from_matches_normalize_clip_region() {
        let state = create_clip_region_state();
        let source = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.normalize_from(&state, &source);
        normalize_clip_region(&state, &function, &source);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_release_matches_release_clip_region() {
        let mut method_state = create_clip_region_state();
        let mut function_state = create_clip_region_state();
        let method = method_state.acquire();
        let function = acquire_clip_region(&mut function_state);
        method.release(&mut method_state);
        release_clip_region(&mut function_state, &function);
        assert!(Arc::ptr_eq(&method_state.acquire(), &method));
        assert!(Arc::ptr_eq(
            &acquire_clip_region(&mut function_state),
            &function
        ));
    }

    #[test]
    fn clip_region_set_contours_matches_set_clip_region_to_contours() {
        let state = create_clip_region_state();
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.set_contours(&state, &triangle(), PathWinding::EvenOdd);
        set_clip_region_to_contours(&state, &function, &triangle(), PathWinding::EvenOdd);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_set_rectangle_matches_set_clip_region_to_rectangle() {
        let state = create_clip_region_state();
        let method = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let function = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let rectangle = create_rectangle(1.0, 2.0, 3.0, 4.0);
        method.set_rectangle(&state, &rectangle);
        set_clip_region_to_rectangle(&state, &function, &rectangle);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_transform_from_matches_transform_clip_region() {
        let state = create_clip_region_state();
        let source = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, 2.0, 3.0);
        method.transform_from(&state, &source, &matrix);
        transform_clip_region(&state, &function, &source, &matrix);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_union_from_matches_union_clip_regions() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&create_rectangle(5.0, 5.0, 10.0, 10.0));
        let method = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        let function = create_clip_region_from_rectangle(&create_rectangle(0.0, 0.0, 1.0, 1.0));
        method.union_from(&state, &a, &b);
        union_clip_regions(&state, &function, &a, &b);
        assert!(same(&method, &function));
    }

    #[test]
    fn clip_region_constructors_match_their_free_functions() {
        let state = create_clip_region_state();
        let rectangle = create_rectangle(0.0, 0.0, 10.0, 10.0);
        assert!(same(
            &ClipRegion::new_from_circle(5.0, 5.0, 5.0, None),
            &create_clip_region_from_circle(5.0, 5.0, 5.0, None),
        ));
        assert!(same(
            &ClipRegion::new_from_contours(&state, &triangle(), PathWinding::EvenOdd),
            &create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd),
        ));
        assert!(same(
            &ClipRegion::new_from_ellipse(&rectangle, None),
            &create_clip_region_from_ellipse(&rectangle, None),
        ));
        let path = create_path(None);
        assert!(same(
            &ClipRegion::new_from_path(&path, None),
            &create_clip_region_from_path(&path, None),
        ));
        assert!(same(
            &ClipRegion::new_from_rectangle(&rectangle),
            &create_clip_region_from_rectangle(&rectangle),
        ));
        assert!(same(
            &ClipRegion::new_from_rounded_rectangle(&rectangle, 2.0, None),
            &create_clip_region_from_rounded_rectangle(&rectangle, 2.0, None),
        ));
    }

    #[test]
    fn clip_region_state_guard_methods_match_the_free_functions() {
        let log_state = Arc::new(RwLock::new(create_log_state()));
        let mut method = create_clip_region_state();
        let mut function = create_clip_region_state();
        method.enable_guards(&log_state, Arc::new(|| 0.0));
        enable_clip_guards(&mut function, &log_state, Arc::new(|| 0.0));
        let method_region = method.acquire();
        let function_region = acquire_clip_region(&mut function);
        method_region.release(&mut method);
        function_region.release(&mut function);
        method.disable_guards();
        disable_clip_guards(&mut function);
        method_region.release(&mut method);
        function_region.release(&mut function);
    }
}
    };
}

#[cfg(test)]
sugar_tests_module!();
