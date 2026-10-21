//! D18 Rust conveniences: each method delegates to one public free function.

use std::sync::Arc;

use flight_entity::Ref;
use flight_hostcapability::BackendOperationExplanation;
use flight_log::LogStateRef;
use flight_textformat::TextFormat;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_log::create_log_state;
    use flight_textformat::TextFormat;

    use crate::contract::*;

    fn format() -> TextFormat {
        let make: fn() -> TextFormat = TextFormat::default;
        return make();
    }

    fn glyphs() -> Vec<ShapedGlyph> {
        return vec![
            ShapedGlyph {
                cluster: 0,
                glyph_id: 10,
                x_advance: 8.0,
                x_offset: 0.0,
                y_advance: 0.0,
                y_offset: 0.0,
            },
            ShapedGlyph {
                cluster: 2,
                glyph_id: 20,
                x_advance: 7.0,
                x_offset: 1.0,
                y_advance: 0.0,
                y_offset: 0.0,
            },
        ];
    }

    fn shaped() -> ShapedRun {
        let make: fn() -> ShapedRun = ShapedRun::default;
        let mut out = make();
        out.advance_width = 15.0;
        out.glyph_count = 2;
        out.glyphs = glyphs();
        out.script = "Latn".to_string();
        return out;
    }

    fn host() -> HostTextShaperCapability {
        return HostTextShaperCapability {
            provider: Arc::new(()),
            get_code_point_for_glyph: Some(Arc::new(|id| id + 55)),
            get_font_metrics: Some(Arc::new(|format| {
                Some(FontMetrics {
                    ascent: format.size.unwrap_or(1.0),
                    cap_height: 8.0,
                    descent: 3.0,
                    line_gap: 1.0,
                    underline_position: -2.0,
                    underline_thickness: 1.0,
                    units_per_em: 1000.0,
                    x_height: 5.0,
                })
            })),
            get_glyph_extents: Some(Arc::new(|id| {
                if id == 10 {
                    Some(GlyphExtents {
                        height: 10.0,
                        width: 6.0,
                        x_bearing: 0.0,
                        y_bearing: -8.0,
                    })
                } else {
                    None
                }
            })),
            get_glyph_index_for_code_point: Some(Arc::new(|cp| cp - 55)),
            get_glyph_name: Some(Arc::new(|id| format!("g{id}"))),
            measure_text: Arc::new(|text, _format| text.len() as f32 * 3.0),
            shape_run: Some(Arc::new(|text, _format, options| {
                let mut run = shaped();
                run.script = options
                    .and_then(|o| o.script.clone())
                    .unwrap_or_else(|| text.to_string());
                Arc::new(RwLock::new(run))
            })),
        };
    }

    fn show<T: std::fmt::Debug>(value: &T) -> String {
        return format!("{:?}", value);
    }

    fn pool() -> ShapedRunPool {
        let make: fn() -> ShapedRunPool = ShapedRunPool::default;
        return make();
    }

    fn signals_state() -> TextShaperSignalsState {
        let make: fn() -> TextShaperSignalsState = TextShaperSignalsState::default;
        return make();
    }

    #[test]
    fn hosttextshapercapability_explain_text_shaper_operation_matches_explain_text_shaper_operation()
     {
        let s = host();
        assert_eq!(
            s.explain_text_shaper_operation(TextShaperOperation::ShapeRun),
            explain_text_shaper_operation(&s, TextShaperOperation::ShapeRun)
        );
    }

    #[test]
    fn hosttextshapercapability_has_text_shaper_operation_matches_has_text_shaper_operation() {
        let s = host();
        assert_eq!(
            s.has_text_shaper_operation(TextShaperOperation::GetGlyphName),
            has_text_shaper_operation(&s, TextShaperOperation::GetGlyphName)
        );
    }

    #[test]
    fn hosttextshapercapability_measure_text_matches_measure_text() {
        let s = host();
        assert_eq!(
            s.measure_text("abc", &format()),
            measure_text(&s, "abc", &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_code_point_for_glyph_matches_get_code_point_for_glyph() {
        let s = host();
        assert_eq!(
            s.get_code_point_for_glyph(10, &format()),
            get_code_point_for_glyph(&s, 10, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_font_metrics_matches_get_font_metrics() {
        let s = host();
        assert_eq!(
            s.get_font_metrics(&format()),
            get_font_metrics(&s, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_font_metrics_into_matches_get_font_metrics_into() {
        let s = host();
        let (mut a, mut b) = (FontMetrics::default(), FontMetrics::default());
        assert_eq!(
            s.get_font_metrics_into(&mut a, &format()),
            get_font_metrics_into(&mut b, &s, &format())
        );
        assert_eq!(a, b);
    }

    #[test]
    fn hosttextshapercapability_get_font_unit_scale_matches_get_font_unit_scale() {
        let s = host();
        assert_eq!(
            s.get_font_unit_scale(&format()),
            get_font_unit_scale(&s, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_glyph_extents_matches_get_glyph_extents() {
        let s = host();
        assert_eq!(
            s.get_glyph_extents(10, &format()),
            get_glyph_extents(&s, 10, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_glyph_extents_batch_matches_get_glyph_extents_batch() {
        let s = host();
        let (mut a, mut b) = (Vec::new(), Vec::new());
        assert_eq!(
            s.get_glyph_extents_batch(&mut a, &[10, 3], &format()),
            get_glyph_extents_batch(&mut b, &s, &[10, 3], &format())
        );
        assert_eq!(a, b);
    }

    #[test]
    fn hosttextshapercapability_get_glyph_extents_into_matches_get_glyph_extents_into() {
        let s = host();
        let (mut a, mut b) = (GlyphExtents::default(), GlyphExtents::default());
        assert_eq!(
            s.get_glyph_extents_into(&mut a, 10, &format()),
            get_glyph_extents_into(&mut b, &s, 10, &format())
        );
        assert_eq!(a, b);
    }

    #[test]
    fn hosttextshapercapability_get_glyph_index_for_code_point_matches_get_glyph_index_for_code_point()
     {
        let s = host();
        assert_eq!(
            s.get_glyph_index_for_code_point(65, &format()),
            get_glyph_index_for_code_point(&s, 65, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_get_glyph_name_matches_get_glyph_name() {
        let s = host();
        assert_eq!(
            s.get_glyph_name(10, &format()),
            get_glyph_name(&s, 10, &format())
        );
    }

    #[test]
    fn hosttextshapercapability_shape_text_run_matches_shape_text_run() {
        let s = host();
        assert_eq!(
            show(&s.shape_text_run("ab", &format(), None)),
            show(&shape_text_run(&s, "ab", &format(), None))
        );
    }

    #[test]
    fn hosttextshapercapability_shape_text_run_cached_matches_shape_text_run_cached() {
        let s = host();
        let (mut a, mut b) = (create_text_shaper_cache(), create_text_shaper_cache());
        let ra = s.shape_text_run_cached(&mut a, "ab", &format(), None);
        let rb = shape_text_run_cached(&s, &mut b, "ab", &format(), None);
        assert_eq!(show(&ra), show(&rb));
        assert!(Arc::ptr_eq(
            &ra.unwrap(),
            &s.shape_text_run_cached(&mut a, "ab", &format(), None)
                .unwrap()
        ));
    }

    #[test]
    fn hosttextshapercapability_shape_text_run_into_matches_shape_text_run_into() {
        let s = host();
        let (mut a, mut b) = (shaped(), shaped());
        assert_eq!(
            s.shape_text_run_into(&mut a, "x", &format(), None),
            shape_text_run_into(&mut b, &s, "x", &format(), None)
        );
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn hosttextshapercapability_shape_text_runs_matches_shape_text_runs() {
        let s = host();
        assert_eq!(
            show(&s.shape_text_runs("ab", &format(), None)),
            show(&shape_text_runs(&s, "ab", &format(), None))
        );
    }

    #[test]
    fn shapedrun_clear_shaped_run_matches_clear_shaped_run() {
        let (mut a, mut b) = (shaped(), shaped());
        a.clear_shaped_run();
        clear_shaped_run(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn shapedrun_get_caret_positions_for_run_matches_get_caret_positions_for_run() {
        let s = shaped();
        assert_eq!(
            s.get_caret_positions_for_run(),
            get_caret_positions_for_run(&s)
        );
    }

    #[test]
    fn shapedrun_get_cluster_for_index_matches_get_cluster_for_index() {
        let s = shaped();
        assert_eq!(s.get_cluster_for_index(3), get_cluster_for_index(&s, 3));
    }

    #[test]
    fn shapedrun_get_index_range_for_cluster_matches_get_index_range_for_cluster() {
        let s = shaped();
        assert_eq!(
            s.get_index_range_for_cluster(0, Some(4)),
            get_index_range_for_cluster(&s, 0, Some(4))
        );
    }

    #[test]
    fn shapedrun_initialize_shaped_run_matches_initialize_shaped_run() {
        let (mut a, mut b) = (shaped(), shaped());
        a.initialize_shaped_run();
        initialize_shaped_run(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn textshapercache_clear_text_shaper_cache_matches_clear_text_shaper_cache() {
        let s = host();
        let (mut a, mut b) = (create_text_shaper_cache(), create_text_shaper_cache());
        shape_text_run_cached(&s, &mut a, "x", &format(), None);
        shape_text_run_cached(&s, &mut b, "x", &format(), None);
        a.clear_text_shaper_cache();
        clear_text_shaper_cache(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn textshapercache_dispose_text_shaper_cache_matches_dispose_text_shaper_cache() {
        let (mut a, mut b) = (create_text_shaper_cache(), create_text_shaper_cache());
        a.dispose_text_shaper_cache();
        dispose_text_shaper_cache(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn textshapercache_initialize_text_shaper_cache_matches_initialize_text_shaper_cache() {
        let (mut a, mut b) = (create_text_shaper_cache(), create_text_shaper_cache());
        dispose_text_shaper_cache(&mut a);
        dispose_text_shaper_cache(&mut b);
        a.initialize_text_shaper_cache();
        initialize_text_shaper_cache(&mut b);
        assert_eq!(show(&a), show(&b));
    }

    #[test]
    fn shapedrunpool_acquire_shaped_run_matches_acquire_shaped_run() {
        let (mut a, mut b) = (pool(), pool());
        assert_eq!(
            show(&a.acquire_shaped_run()),
            show(&acquire_shaped_run(&mut b))
        );
    }

    #[test]
    fn shapedrunpool_release_shaped_run_matches_release_shaped_run() {
        let (mut a, mut b) = (pool(), pool());
        let (ra, rb) = (create_shaped_run(), create_shaped_run());
        a.release_shaped_run(&ra);
        release_shaped_run(&mut b, &rb);
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut a), &ra));
        assert!(Arc::ptr_eq(&acquire_shaped_run(&mut b), &rb));
    }

    #[test]
    fn shapedrunpool_set_shaped_run_release_guard_matches_set_shaped_run_release_guard() {
        let calls = Arc::new(RwLock::new(0));
        let (ca, cb) = (calls.clone(), calls.clone());
        let (mut a, mut b) = (pool(), pool());
        a.set_shaped_run_release_guard(Some(Arc::new(move |_| *ca.write().unwrap() += 1)));
        set_shaped_run_release_guard(&mut b, Some(Arc::new(move |_| *cb.write().unwrap() += 1)));
        for state in [&mut a, &mut b] {
            let run = create_shaped_run();
            release_shaped_run(state, &run);
            release_shaped_run(state, &run);
        }
        assert_eq!(*calls.read().unwrap(), 2);
    }

    #[test]
    fn shapedrunpool_disable_text_shaper_guards_matches_disable_text_shaper_guards() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (pool(), pool());
        enable_text_shaper_guards(&mut a, &logs, Arc::new(|| 0.0));
        enable_text_shaper_guards(&mut b, &logs, Arc::new(|| 0.0));
        a.disable_text_shaper_guards();
        disable_text_shaper_guards(&mut b);
        assert_eq!(a.release_guard.is_some(), b.release_guard.is_some());
    }

    #[test]
    fn shapedrunpool_enable_text_shaper_guards_matches_enable_text_shaper_guards() {
        let logs = Arc::new(RwLock::new(create_log_state()));
        let (mut a, mut b) = (pool(), pool());
        a.enable_text_shaper_guards(&logs, Arc::new(|| 0.0));
        enable_text_shaper_guards(&mut b, &logs, Arc::new(|| 0.0));
        assert_eq!(a.release_guard.is_some(), b.release_guard.is_some());
    }

    #[test]
    fn textshapersignalsstate_dispose_text_shaper_signals_matches_dispose_text_shaper_signals() {
        let (mut a, mut b) = (signals_state(), signals_state());
        enable_text_shaper_signals(&mut a);
        enable_text_shaper_signals(&mut b);
        a.dispose_text_shaper_signals();
        dispose_text_shaper_signals(&mut b);
        assert_eq!(a.signals.is_none(), b.signals.is_none());
    }

    #[test]
    fn textshapersignalsstate_enable_text_shaper_signals_matches_enable_text_shaper_signals() {
        let (mut a, mut b) = (signals_state(), signals_state());
        let (sa, sb) = (
            a.enable_text_shaper_signals(),
            enable_text_shaper_signals(&mut b),
        );
        assert!(Arc::ptr_eq(&sa, &a.get_text_shaper_signals().unwrap()));
        assert!(Arc::ptr_eq(&sb, &get_text_shaper_signals(&b).unwrap()));
    }

    #[test]
    fn textshapersignalsstate_get_text_shaper_signals_matches_get_text_shaper_signals() {
        let s = signals_state();
        assert_eq!(
            s.get_text_shaper_signals().is_none(),
            get_text_shaper_signals(&s).is_none()
        );
    }

    #[test]
    fn textshapersignals_initialize_text_shaper_signals_matches_initialize_text_shaper_signals() {
        let mut state = signals_state();
        let signals = enable_text_shaper_signals(&mut state);
        signals.write().unwrap().initialize_text_shaper_signals();
        initialize_text_shaper_signals(&mut signals.write().unwrap());
        assert!(
            signals
                .read()
                .unwrap()
                .on_backend_changed
                .data
                .read()
                .unwrap()
                .is_none()
        );
    }
}

impl HostTextShaperCapability {
    pub fn explain_text_shaper_operation(
        &self,
        operation: TextShaperOperation,
    ) -> BackendOperationExplanation {
        return explain_text_shaper_operation(self, operation);
    }

    pub fn get_code_point_for_glyph(&self, glyph_id: i32, _format: &TextFormat) -> i32 {
        return get_code_point_for_glyph(self, glyph_id, _format);
    }

    pub fn get_font_metrics(&self, format: &TextFormat) -> Option<FontMetrics> {
        return get_font_metrics(self, format);
    }

    pub fn get_font_metrics_into(&self, out: &mut FontMetrics, format: &TextFormat) -> bool {
        return get_font_metrics_into(out, self, format);
    }

    pub fn get_font_unit_scale(&self, format: &TextFormat) -> f32 {
        return get_font_unit_scale(self, format);
    }

    pub fn get_glyph_extents(&self, glyph_id: i32, _format: &TextFormat) -> Option<GlyphExtents> {
        return get_glyph_extents(self, glyph_id, _format);
    }

    pub fn get_glyph_extents_batch(
        &self,
        out: &mut Vec<GlyphExtents>,
        glyph_ids: &[i32],
        _format: &TextFormat,
    ) -> usize {
        return get_glyph_extents_batch(out, self, glyph_ids, _format);
    }

    pub fn get_glyph_extents_into(
        &self,
        out: &mut GlyphExtents,
        glyph_id: i32,
        format: &TextFormat,
    ) -> bool {
        return get_glyph_extents_into(out, self, glyph_id, format);
    }

    pub fn get_glyph_index_for_code_point(&self, code_point: i32, _format: &TextFormat) -> i32 {
        return get_glyph_index_for_code_point(self, code_point, _format);
    }

    pub fn get_glyph_name(&self, glyph_id: i32, _format: &TextFormat) -> String {
        return get_glyph_name(self, glyph_id, _format);
    }

    pub fn has_text_shaper_operation(&self, operation: TextShaperOperation) -> bool {
        return has_text_shaper_operation(self, operation);
    }

    pub fn measure_text(&self, text: &str, format: &TextFormat) -> f32 {
        return measure_text(self, text, format);
    }

    pub fn shape_text_run(
        &self,
        text: &str,
        format: &TextFormat,
        options: Option<&ShapeRunOptions>,
    ) -> Option<Ref<ShapedRun>> {
        return shape_text_run(self, text, format, options);
    }

    pub fn shape_text_run_cached(
        &self,
        cache: &mut TextShaperCache,
        text: &str,
        format: &TextFormat,
        options: Option<&ShapeRunOptions>,
    ) -> Option<Ref<ShapedRun>> {
        return shape_text_run_cached(self, cache, text, format, options);
    }

    pub fn shape_text_run_into(
        &self,
        out: &mut ShapedRun,
        text: &str,
        format: &TextFormat,
        options: Option<&ShapeRunOptions>,
    ) -> bool {
        return shape_text_run_into(out, self, text, format, options);
    }

    pub fn shape_text_runs(
        &self,
        text: &str,
        format: &TextFormat,
        options: Option<&TextShaperOptions>,
    ) -> Vec<Ref<ShapedRun>> {
        return shape_text_runs(self, text, format, options);
    }
}

impl ShapedRun {
    pub fn initialize_shaped_run(&mut self) {
        initialize_shaped_run(self);
    }

    pub fn clear_shaped_run(&mut self) {
        clear_shaped_run(self);
    }

    pub fn get_caret_positions_for_run(&self) -> Vec<f32> {
        return get_caret_positions_for_run(self);
    }

    pub fn get_cluster_for_index(&self, string_index: i32) -> i32 {
        return get_cluster_for_index(self, string_index);
    }

    pub fn get_index_range_for_cluster(
        &self,
        cluster: i32,
        string_length: Option<i32>,
    ) -> Option<(i32, i32)> {
        return get_index_range_for_cluster(self, cluster, string_length);
    }
}

impl TextShaperCache {
    pub fn initialize_text_shaper_cache(&mut self) {
        initialize_text_shaper_cache(self);
    }

    pub fn clear_text_shaper_cache(&mut self) {
        clear_text_shaper_cache(self);
    }

    pub fn dispose_text_shaper_cache(&mut self) {
        dispose_text_shaper_cache(self);
    }
}

impl ShapedRunPool {
    pub fn acquire_shaped_run(&mut self) -> Ref<ShapedRun> {
        return acquire_shaped_run(self);
    }

    pub fn disable_text_shaper_guards(&mut self) {
        disable_text_shaper_guards(self);
    }

    // flight-lint: allow(f64) D0: the injected flight-log clock returns millisecond timestamps
    pub fn enable_text_shaper_guards(
        &mut self,
        log_state: &LogStateRef,
        clock: Arc<dyn Fn() -> f64 + Send + Sync>,
    ) {
        return enable_text_shaper_guards(self, log_state, clock);
    }

    pub fn release_shaped_run(&mut self, run: &Ref<ShapedRun>) {
        release_shaped_run(self, run);
    }

    pub fn set_shaped_run_release_guard(&mut self, guard: Option<ShapedRunReleaseGuard>) {
        set_shaped_run_release_guard(self, guard);
    }
}

impl TextShaperSignalsState {
    pub fn dispose_text_shaper_signals(&mut self) {
        dispose_text_shaper_signals(self);
    }

    pub fn enable_text_shaper_signals(&mut self) -> Ref<TextShaperSignals> {
        return enable_text_shaper_signals(self);
    }

    pub fn get_text_shaper_signals(&self) -> Option<Ref<TextShaperSignals>> {
        return get_text_shaper_signals(self);
    }
}

impl TextShaperSignals {
    pub fn initialize_text_shaper_signals(&mut self) {
        initialize_text_shaper_signals(self);
    }
}
