//! D18 sugar for the motion-path public lane: constructor and receiver methods that delegate to the
//! free functions. Sugar contains no logic.

use flight_entity::Ref;
use flight_geometry::{Vector2, create_vector2};
use flight_path::Path;

use crate::motion_path::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::RwLock;

    use flight_path::{append_path_line_to, append_path_move_to, create_path};

    use super::*;

    fn line() -> Ref<Path> {
        let mut path = create_path(flight_path::PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        return Ref::new(RwLock::new(path));
    }

    #[test]
    fn new_matches_create_motion_path() {
        let method_marker =
            MotionPath::new(line(), Some(30.0), Some(MotionPathLoopMode::Pingpong), None);
        let free_marker =
            create_motion_path(line(), Some(30.0), Some(MotionPathLoopMode::Pingpong), None);
        assert_eq!(method_marker.length, free_marker.length);
        assert_eq!(method_marker.speed, free_marker.speed);
        assert_eq!(method_marker.loop_mode, free_marker.loop_mode);
    }

    #[test]
    fn heading_method_matches_get_motion_path_heading() {
        let marker = create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        assert_eq!(marker.heading(), get_motion_path_heading(&marker));
    }

    #[test]
    fn is_at_end_method_matches_is_motion_path_at_end() {
        let mut marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        set_motion_path_distance(&mut marker, 100.0);
        assert_eq!(marker.is_at_end(), is_motion_path_at_end(&marker));
    }

    #[test]
    fn position_method_matches_get_motion_path_position() {
        let marker = create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        let (method_point, method_tangent, method_ok) = marker.position();
        let mut free_point = create_vector2(0.0, 0.0);
        let mut free_tangent = create_vector2(0.0, 0.0);
        let free_ok = get_motion_path_position(&marker, &mut free_point, &mut free_tangent);
        assert_eq!(method_ok, free_ok);
        assert_eq!(method_point.x, free_point.x);
        assert_eq!(method_point.y, free_point.y);
        assert_eq!(method_tangent.x, free_tangent.x);
        assert_eq!(method_tangent.y, free_tangent.y);
    }

    #[test]
    fn progress_method_matches_get_motion_path_progress() {
        let mut marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        set_motion_path_distance(&mut marker, 25.0);
        assert_eq!(marker.progress(), get_motion_path_progress(&marker));
    }

    #[test]
    fn set_direction_method_matches_set_motion_path_direction() {
        let mut method_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        let mut free_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        method_marker.set_direction(MotionPathDirection::Backward);
        set_motion_path_direction(&mut free_marker, MotionPathDirection::Backward);
        assert_eq!(method_marker.direction, free_marker.direction);
    }

    #[test]
    fn set_distance_method_matches_set_motion_path_distance() {
        let mut method_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        let mut free_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        method_marker.set_distance(150.0);
        set_motion_path_distance(&mut free_marker, 150.0);
        assert_eq!(method_marker.distance, free_marker.distance);
    }

    #[test]
    fn set_progress_method_matches_set_motion_path_progress() {
        let mut method_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        let mut free_marker =
            create_motion_path(line(), Some(0.0), Some(MotionPathLoopMode::Clamp), None);
        method_marker.set_progress(0.5);
        set_motion_path_progress(&mut free_marker, 0.5);
        assert_eq!(method_marker.distance, free_marker.distance);
    }

    #[test]
    fn update_method_matches_update_motion_path() {
        let mut method_marker =
            create_motion_path(line(), Some(30.0), Some(MotionPathLoopMode::Pingpong), None);
        let mut free_marker =
            create_motion_path(line(), Some(30.0), Some(MotionPathLoopMode::Pingpong), None);
        method_marker.set_distance(90.0);
        free_marker.set_distance(90.0);
        method_marker.update(1.0);
        update_motion_path(&mut free_marker, 1.0);
        assert_eq!(method_marker.distance, free_marker.distance);
        assert_eq!(method_marker.direction, free_marker.direction);
    }
}

impl MotionPath {
    /// The convenience constructor mirrors `create_motion_path` (D18).
    // flight-lint: allow(f64) D1: speed and tolerance flow through flight-path's f64 arc-length API
    pub fn new(
        path: Ref<Path>,
        speed: Option<f64>,
        loop_mode: Option<MotionPathLoopMode>,
        tolerance: Option<f64>,
    ) -> MotionPath {
        return create_motion_path(path, speed, loop_mode, tolerance);
    }

    // flight-lint: allow(f64) D1: the heading is a radian angle over flight-path's f64 sampling
    pub fn heading(&self) -> f64 {
        return get_motion_path_heading(self);
    }

    pub fn is_at_end(&self) -> bool {
        return is_motion_path_at_end(self);
    }

    pub fn position(&self) -> (Vector2, Vector2, bool) {
        let mut point = create_vector2(0.0, 0.0);
        let mut tangent = create_vector2(0.0, 0.0);
        let ok = get_motion_path_position(self, &mut point, &mut tangent);
        return (point, tangent, ok);
    }

    // flight-lint: allow(f64) D1: progress is a ratio of f64 arc lengths
    pub fn progress(&self) -> f64 {
        return get_motion_path_progress(self);
    }

    pub fn set_direction(&mut self, direction: MotionPathDirection) {
        return set_motion_path_direction(self, direction);
    }

    // flight-lint: allow(f64) D1: the seek distance is a f64 arc length
    pub fn set_distance(&mut self, distance: f64) {
        return set_motion_path_distance(self, distance);
    }

    // flight-lint: allow(f64) D1: progress times a f64 arc length
    pub fn set_progress(&mut self, t: f64) {
        return set_motion_path_progress(self, t);
    }

    // flight-lint: allow(f64) D1: delta time and speed produce a f64 path arc length
    pub fn update(&mut self, delta_time: f64) {
        return update_motion_path(self, delta_time);
    }
}
