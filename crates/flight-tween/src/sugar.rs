use std::collections::HashMap;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    fn linear_ease(t: f32) -> f32 {
        t
    }

    fn setup() -> (TweenManager, TweenTarget) {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        return (manager, target);
    }

    // TweenContext

    #[test]
    fn context_new_delegates() {
        let ctx = TweenContext::new();
        assert!(ctx.manager.lock().unwrap().is_none());
    }

    #[test]
    fn context_default_manager_delegates() {
        let ctx = create_tween_context();
        let m1 = ctx.default_manager();
        let m2 = default_manager(&ctx);
        assert!(std::sync::Arc::ptr_eq(&m1.data, &m2.data));
    }

    #[test]
    fn context_create_tween_default_delegates() {
        let ctx = create_tween_context();
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t1 = ctx.create_tween_default(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        let m = default_manager(&ctx);
        assert!(has_tweens_of(&m, &target));
        assert_eq!(t1.data.read().unwrap().duration, 1000.0);
    }

    // Tween

    #[test]
    fn tween_complete_delegates() {
        let (manager, target) = setup();
        let method_t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        method_t.complete_tween();
        assert!(method_t.data.read().unwrap().complete);
    }

    #[test]
    fn tween_equals_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        assert_eq!(t.equals(&t), equals_tween(&t, &t));
    }

    #[test]
    fn tween_pause_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        t.pause();
        assert!(t.data.read().unwrap().paused);
    }

    #[test]
    fn tween_progress_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.update(500.0);
        assert_eq!(t.progress(), get_tween_progress(&t));
    }

    #[test]
    fn tween_restart_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.update(500.0);
        t.restart(true);
        assert_eq!(t.data.read().unwrap().elapsed, 0.0);
    }

    #[test]
    fn tween_resume_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        t.pause();
        t.resume();
        assert!(!t.data.read().unwrap().paused);
    }

    #[test]
    fn tween_seek_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        t.seek(500.0);
        let prop = *target.props.read().unwrap().get("x").unwrap();
        assert!((prop - 50.0).abs() < 0.01);
    }

    #[test]
    fn tween_set_progress_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        t.set_progress(0.5);
        let prop = *target.props.read().unwrap().get("x").unwrap();
        assert!((prop - 50.0).abs() < 0.01);
    }

    #[test]
    fn tween_stop_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        t.stop(None);
        assert!(t.data.read().unwrap().complete);
    }

    // TweenManager

    #[test]
    fn manager_new_delegates() {
        let m = TweenManager::new(None);
        assert_eq!(m.data.read().unwrap().tweens.len(), 0);
    }

    #[test]
    fn manager_active_tween_count_delegates() {
        let (manager, target) = setup();
        manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        assert_eq!(manager.active_tween_count(), get_active_tween_count(&manager));
    }

    #[test]
    fn manager_apply_delegates() {
        let (manager, target) = setup();
        manager.apply(&target, &HashMap::from([("x".to_string(), 42.0)]));
        assert_eq!(*target.props.read().unwrap().get("x").unwrap(), 42.0);
    }

    #[test]
    fn manager_create_tween_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        assert_eq!(t.data.read().unwrap().duration, 1000.0);
    }

    #[test]
    fn manager_has_tweens_of_delegates() {
        let (manager, target) = setup();
        manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        assert_eq!(manager.has_tweens_of(&target), has_tweens_of(&manager, &target));
    }

    #[test]
    fn manager_kill_property_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.kill_property("x");
        assert!(t.data.read().unwrap().complete);
    }

    #[test]
    fn manager_pause_all_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.pause_all();
        assert!(t.data.read().unwrap().paused);
    }

    #[test]
    fn manager_pause_tweens_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.pause_tweens(&target);
        assert!(t.data.read().unwrap().paused);
    }

    #[test]
    fn manager_reset_all_delegates() {
        let (manager, target) = setup();
        manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.reset_all();
        assert_eq!(manager.data.read().unwrap().tweens.len(), 0);
    }

    #[test]
    fn manager_resume_all_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.pause_all();
        manager.resume_all();
        assert!(!t.data.read().unwrap().paused);
    }

    #[test]
    fn manager_resume_tweens_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.pause_tweens(&target);
        manager.resume_tweens(&target);
        assert!(!t.data.read().unwrap().paused);
    }

    #[test]
    fn manager_stop_all_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.stop_all(None);
        assert!(t.data.read().unwrap().complete);
    }

    #[test]
    fn manager_stop_tweens_delegates() {
        let (manager, target) = setup();
        let t = manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.stop_tweens(&target, None, None);
        assert!(t.data.read().unwrap().complete);
    }

    #[test]
    fn manager_tweens_of_delegates() {
        let (manager, target) = setup();
        manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        assert_eq!(manager.tweens_of(&target).len(), get_tweens_of(&manager, &target).len());
    }

    #[test]
    fn manager_update_delegates() {
        let (manager, target) = setup();
        manager.create_tween(&target, 1000.0, &HashMap::from([("x".to_string(), 100.0)]), None);
        manager.update(1000.0);
        assert!(((*target.props.read().unwrap().get("x").unwrap()) - 100.0).abs() < 0.01);
    }

    #[test]
    fn manager_create_color_tween_delegates() {
        let (manager, _) = setup();
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xff0000_u32 as f32)]));
        let t = manager.create_color_tween(&target, "color", 1000.0, 0x0000ff, None);
        assert_eq!(t.data.read().unwrap().duration, 1000.0);
    }

    #[test]
    fn manager_create_timer_delegates() {
        let (manager, _) = setup();
        let t = manager.create_timer(500.0, None);
        assert_eq!(t.data.read().unwrap().duration, 500.0);
    }

    #[test]
    fn manager_create_stagger_delegates() {
        let (manager, _) = setup();
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = manager.create_stagger(
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
            None,
        );
        assert_eq!(tweens.len(), 2);
    }
}

impl TweenContext {
    pub fn create_tween_default(
        &self,
        target: &TweenTarget,
        duration: f32,
        property_map: &HashMap<String, f32>,
        options: Option<&TweenOptions>,
    ) -> Tween {
        return create_tween_default(self, target, duration, property_map, options);
    }

    pub fn new() -> Self {
        return create_tween_context();
    }

    pub fn default_manager(&self) -> TweenManager {
        return default_manager(self);
    }
}

impl Tween {
    pub fn complete_tween(&self) {
        complete_tween(self);
    }

    pub fn equals(&self, other: &Tween) -> bool {
        return equals_tween(self, other);
    }

    pub fn pause(&self) {
        pause_tween(self);
    }

    pub fn progress(&self) -> f32 {
        return get_tween_progress(self);
    }

    pub fn restart(&self, include_delay: bool) {
        restart_tween(self, include_delay);
    }

    pub fn resume(&self) {
        resume_tween(self);
    }

    pub fn seek(&self, time_seconds: f32) {
        seek_tween(self, time_seconds);
    }

    pub fn set_progress(&self, progress: f32) {
        set_tween_progress(self, progress);
    }

    pub fn stop(&self, options: Option<&StopTweenOptions>) {
        stop_tween(self, options);
    }
}

impl TweenManager {
    pub fn create_color_tween(
        &self,
        target: &TweenTarget,
        property: &str,
        duration: f32,
        to_color: u32,
        options: Option<&TweenOptions>,
    ) -> Tween {
        return create_color_tween(self, target, property, duration, to_color, options);
    }

    pub fn create_stagger(
        &self,
        targets: &[TweenTarget],
        duration: f32,
        property_map: &HashMap<String, f32>,
        stagger_options: Option<&TweenStaggerOptions>,
        options: Option<&TweenOptions>,
    ) -> Vec<Tween> {
        return create_tween_stagger(self, targets, duration, property_map, stagger_options, options);
    }

    pub fn create_timer(
        &self,
        duration: f32,
        options: Option<&TweenOptions>,
    ) -> Tween {
        return create_tween_timer(self, duration, options);
    }

    pub fn create_tween(
        &self,
        target: &TweenTarget,
        duration: f32,
        property_map: &HashMap<String, f32>,
        options: Option<&TweenOptions>,
    ) -> Tween {
        return create_tween(self, target, duration, property_map, options);
    }

    pub fn new(options: Option<&TweenManagerOptions>) -> Self {
        return create_tween_manager(options);
    }

    pub fn active_tween_count(&self) -> usize {
        return get_active_tween_count(self);
    }

    pub fn apply(
        &self,
        target: &TweenTarget,
        property_map: &HashMap<String, f32>,
    ) {
        apply_tween(self, target, property_map);
    }

    pub fn has_tweens_of(&self, target: &TweenTarget) -> bool {
        return has_tweens_of(self, target);
    }

    pub fn kill_property(&self, key: &str) {
        kill_tweens_of_property(self, key);
    }

    pub fn pause_all(&self) {
        pause_all_tweens(self);
    }

    pub fn pause_tweens(&self, target: &TweenTarget) {
        pause_tweens(self, target);
    }

    pub fn reset_all(&self) {
        reset_all_tweens(self);
    }

    pub fn resume_all(&self) {
        resume_all_tweens(self);
    }

    pub fn resume_tweens(&self, target: &TweenTarget) {
        resume_tweens(self, target);
    }

    pub fn stop_all(&self, options: Option<&StopTweenOptions>) {
        stop_all_tweens(self, options);
    }

    pub fn stop_tweens(
        &self,
        target: &TweenTarget,
        keys: Option<&HashMap<String, f32>>,
        options: Option<&StopTweenOptions>,
    ) {
        stop_tweens(self, target, keys, options);
    }

    pub fn tweens_of(&self, target: &TweenTarget) -> Vec<Tween> {
        return get_tweens_of(self, target);
    }

    pub fn update(&self, delta_time: f32) {
        update_tweens(self, delta_time);
    }
}
