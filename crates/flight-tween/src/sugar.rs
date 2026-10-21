use flight_entity::Ref;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::RwLock;

    use super::*;

    fn linear_ease(t: f32) -> f32 {
        t
    }

    struct Obj {
        x: f32,
    }

    fn prop_x(to: f32) -> TweenProp<Obj> {
        return TweenProp {
            get: |t: &mut Obj| &mut t.x,
            key: "x",
            to,
        };
    }

    fn setup() -> (TweenManager, Ref<Obj>) {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = Ref::new(RwLock::new(Obj { x: 0.0 }));
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
        let target = Ref::new(RwLock::new(Obj { x: 0.0 }));
        let t1 = ctx.create_tween_default(&target, 1000.0, &[prop_x(100.0)], None);
        let m = default_manager(&ctx);
        assert!(has_tweens_of(&m, &target));
        assert_eq!(t1.duration(), 1000.0);
    }

    // Tween

    #[test]
    fn tween_complete_delegates() {
        let (manager, target) = setup();
        let method_t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        method_t.complete_tween();
        assert!(method_t.is_complete());
    }

    #[test]
    fn tween_equals_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(t.equals(&t), equals_tween(&t, &t));
    }

    #[test]
    fn tween_pause_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        t.pause();
        assert!(t.is_paused());
    }

    #[test]
    fn tween_progress_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 500.0);
        assert_eq!(t.progress(), get_tween_progress(&t));
    }

    #[test]
    fn tween_restart_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 500.0);
        t.restart(true);
        assert_eq!(t.elapsed(), 0.0);
    }

    #[test]
    fn tween_resume_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        t.pause();
        t.resume();
        assert!(!t.is_paused());
    }

    #[test]
    fn tween_seek_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        t.seek(500.0);
        let val = target.read().unwrap().x;
        assert!((val - 50.0).abs() < 0.01);
    }

    #[test]
    fn tween_set_progress_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        t.set_progress(0.5);
        let val = target.read().unwrap().x;
        assert!((val - 50.0).abs() < 0.01);
    }

    #[test]
    fn tween_stop_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        t.stop(None);
        assert!(t.is_complete());
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
        create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(
            manager.active_tween_count(),
            get_active_tween_count(&manager)
        );
    }

    #[test]
    fn manager_apply_delegates() {
        let (manager, target) = setup();
        apply_tween(&manager, &target, &[prop_x(42.0)]);
        assert_eq!(target.read().unwrap().x, 42.0);
    }

    #[test]
    fn manager_create_tween_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(t.duration(), 1000.0);
    }

    #[test]
    fn manager_has_tweens_of_delegates() {
        let (manager, target) = setup();
        create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(
            manager.has_tweens_of(&target),
            has_tweens_of(&manager, &target)
        );
    }

    #[test]
    fn manager_kill_property_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        kill_tweens_of_property(&manager, "x");
        assert!(t.is_complete());
    }

    #[test]
    fn manager_pause_all_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        pause_all_tweens(&manager);
        assert!(t.is_paused());
    }

    #[test]
    fn manager_pause_tweens_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        pause_tweens(&manager, &target);
        assert!(t.is_paused());
    }

    #[test]
    fn manager_reset_all_delegates() {
        let (manager, target) = setup();
        create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        reset_all_tweens(&manager);
        assert_eq!(manager.data.read().unwrap().tweens.len(), 0);
    }

    #[test]
    fn manager_resume_all_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        pause_all_tweens(&manager);
        resume_all_tweens(&manager);
        assert!(!t.is_paused());
    }

    #[test]
    fn manager_resume_tweens_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        pause_tweens(&manager, &target);
        resume_tweens(&manager, &target);
        assert!(!t.is_paused());
    }

    #[test]
    fn manager_stop_all_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        stop_all_tweens(&manager, None);
        assert!(t.is_complete());
    }

    #[test]
    fn manager_stop_tweens_delegates() {
        let (manager, target) = setup();
        let t = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        stop_tweens(&manager, &target, None, None);
        assert!(t.is_complete());
    }

    #[test]
    fn manager_tweens_of_delegates() {
        let (manager, target) = setup();
        create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(
            manager.tweens_of(&target).len(),
            get_tweens_of(&manager, &target).len()
        );
    }

    #[test]
    fn manager_update_delegates() {
        let (manager, target) = setup();
        create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 1000.0);
        assert!((target.read().unwrap().x - 100.0).abs() < 0.01);
    }

    #[test]
    fn manager_create_color_tween_delegates() {
        struct ColorObj {
            color: f32,
        }
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = Ref::new(RwLock::new(ColorObj {
            color: 0xff0000_u32 as f32,
        }));
        let t = create_color_tween(
            &manager,
            &target,
            |o: &mut ColorObj| &mut o.color,
            "color",
            1000.0,
            0x0000ff,
            None,
        );
        assert_eq!(t.duration(), 1000.0);
    }

    #[test]
    fn manager_create_timer_delegates() {
        let (manager, _) = setup();
        let t = create_tween_timer(&manager, 500.0, None);
        assert_eq!(t.duration(), 500.0);
    }

    #[test]
    fn manager_create_stagger_delegates() {
        let (manager, _) = setup();
        let targets: Vec<Ref<Obj>> = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(&manager, &targets, 1000.0, &[prop_x(100.0)], None, None);
        assert_eq!(tweens.len(), 2);
    }
}

impl TweenContext {
    pub fn create_tween_default<T: Send + Sync + 'static>(
        &self,
        target: &Ref<T>,
        duration: f32,
        props: &[TweenProp<T>],
        options: Option<&TweenOptions>,
    ) -> Tween<T> {
        return create_tween_default(self, target, duration, props, options);
    }

    pub fn new() -> Self {
        return create_tween_context();
    }

    pub fn default_manager(&self) -> TweenManager {
        return default_manager(self);
    }
}

impl<T: Send + Sync + 'static> Tween<T> {
    pub fn complete_tween(&self) {
        complete_tween(self);
    }

    pub fn delay(&self) -> f32 {
        return get_tween_delay(self);
    }

    pub fn duration(&self) -> f32 {
        return get_tween_duration(self);
    }

    pub fn elapsed(&self) -> f32 {
        return get_tween_elapsed(self);
    }

    pub fn equals(&self, other: &Tween<T>) -> bool {
        return equals_tween(self, other);
    }

    pub fn is_complete(&self) -> bool {
        return is_tween_complete(self);
    }

    pub fn is_initialized(&self) -> bool {
        return is_tween_initialized(self);
    }

    pub fn is_paused(&self) -> bool {
        return is_tween_paused(self);
    }

    pub fn on_complete(&self) -> flight_signals::Signal<()> {
        return get_tween_on_complete(self);
    }

    pub fn on_repeat(&self) -> flight_signals::Signal<()> {
        return get_tween_on_repeat(self);
    }

    pub fn on_update(&self) -> flight_signals::Signal<()> {
        return get_tween_on_update(self);
    }

    pub fn on_yoyo(&self) -> flight_signals::Signal<()> {
        return get_tween_on_yoyo(self);
    }

    pub fn pause(&self) {
        pause_tween(self);
    }

    pub fn progress(&self) -> f32 {
        return get_tween_progress(self);
    }

    pub fn property_keys(&self) -> Vec<String> {
        return get_tween_property_keys(self);
    }

    pub fn reflect(&self) -> bool {
        return is_tween_reflect(self);
    }

    pub fn repeat(&self) -> i32 {
        return get_tween_repeat(self);
    }

    pub fn restart(&self, include_delay: bool) {
        restart_tween(self, include_delay);
    }

    pub fn resume(&self) {
        resume_tween(self);
    }

    pub fn reverse(&self) -> bool {
        return is_tween_reverse(self);
    }

    pub fn seek(&self, time_seconds: f32) {
        seek_tween(self, time_seconds);
    }

    pub fn set_progress(&self, progress: f32) {
        set_tween_progress(self, progress);
    }

    pub fn smart_rotation(&self) -> bool {
        return is_tween_smart_rotation(self);
    }

    pub fn snapping(&self) -> bool {
        return is_tween_snapping(self);
    }

    pub fn stop(&self, options: Option<&StopTweenOptions>) {
        stop_tween(self, options);
    }
}

impl TweenManager {
    pub fn create_color_tween<T: Send + Sync + 'static>(
        &self,
        target: &Ref<T>,
        get_color: fn(&mut T) -> &mut f32,
        color_key: &str,
        duration: f32,
        to_color: u32,
        options: Option<&TweenOptions>,
    ) -> Tween<ColorComponents> {
        return create_color_tween(self, target, get_color, color_key, duration, to_color, options);
    }

    pub fn create_stagger<T: Send + Sync + 'static>(
        &self,
        targets: &[Ref<T>],
        duration: f32,
        props: &[TweenProp<T>],
        stagger_options: Option<&TweenStaggerOptions>,
        options: Option<&TweenOptions>,
    ) -> Vec<Tween<T>> {
        return create_tween_stagger(self, targets, duration, props, stagger_options, options);
    }

    pub fn create_timer(
        &self,
        duration: f32,
        options: Option<&TweenOptions>,
    ) -> Tween<TimerTarget> {
        return create_tween_timer(self, duration, options);
    }

    pub fn create_tween<T: Send + Sync + 'static>(
        &self,
        target: &Ref<T>,
        duration: f32,
        props: &[TweenProp<T>],
        options: Option<&TweenOptions>,
    ) -> Tween<T> {
        return create_tween(self, target, duration, props, options);
    }

    pub fn new(options: Option<&TweenManagerOptions>) -> Self {
        return create_tween_manager(options);
    }

    pub fn active_tween_count(&self) -> usize {
        return get_active_tween_count(self);
    }

    pub fn apply<T: Send + Sync + 'static>(
        &self,
        target: &Ref<T>,
        props: &[TweenProp<T>],
    ) {
        apply_tween(self, target, props);
    }

    pub fn has_tweens_of<T: Send + Sync + 'static>(&self, target: &Ref<T>) -> bool {
        return has_tweens_of(self, target);
    }

    pub fn kill_property(&self, key: &str) {
        kill_tweens_of_property(self, key);
    }

    pub fn pause_all(&self) {
        pause_all_tweens(self);
    }

    pub fn pause_tweens<T: Send + Sync + 'static>(&self, target: &Ref<T>) {
        pause_tweens(self, target);
    }

    pub fn reset_all(&self) {
        reset_all_tweens(self);
    }

    pub fn resume_all(&self) {
        resume_all_tweens(self);
    }

    pub fn resume_tweens<T: Send + Sync + 'static>(&self, target: &Ref<T>) {
        resume_tweens(self, target);
    }

    pub fn stop_all(&self, options: Option<&StopTweenOptions>) {
        stop_all_tweens(self, options);
    }

    pub fn stop_tweens<T: Send + Sync + 'static>(
        &self,
        target: &Ref<T>,
        props: Option<&[TweenProp<T>]>,
        options: Option<&StopTweenOptions>,
    ) {
        stop_tweens(self, target, props, options);
    }

    pub fn tweens_of<T: Send + Sync + 'static>(&self, target: &Ref<T>) -> Vec<Tween<T>> {
        return get_tweens_of(self, target);
    }

    pub fn update(&self, delta_time: f32) {
        update_tweens(self, delta_time);
    }
}
