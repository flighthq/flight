use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_textshaper::contract::*;

use crate::text_shaper_fixture::*;

/// The source's counting backend: every shape call allocates a fresh stub run.
fn counting_backend() -> (HostTextShaperCapability, Arc<AtomicUsize>) {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let mut host = advances_only(|_| 0.0);
    host.shape_run = Some(Arc::new(move |_, _, _| {
        count.fetch_add(1, Ordering::SeqCst);
        return run(
            15.0,
            vec![glyph(0, 1, 7.0, 0.0), glyph(1, 2, 8.0, 0.0)],
            "Latn",
        );
    }));
    return (host, calls);
}

fn backend_with_advance(advance: f32) -> HostTextShaperCapability {
    let mut host = advances_only(|_| 0.0);
    host.shape_run = Some(Arc::new(move |_, _, _| run(advance, Vec::new(), "Latn")));
    return host;
}

fn calls(counter: &Arc<AtomicUsize>) -> usize {
    return counter.load(Ordering::SeqCst);
}

mod clear_text_shaper_cache {
    use super::*;

    #[test]
    fn removes_all_cached_entries() {
        let (host, counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        assert_eq!(calls(&counter), 1);
        clear_text_shaper_cache(&mut cache);
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        assert_eq!(calls(&counter), 2);
    }

    #[test]
    fn cache_remains_usable_after_clearing() {
        let (host, _counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        clear_text_shaper_cache(&mut cache);
        assert!(shape_text_run_cached(&host, &mut cache, "hi", &format(), None).is_some());
    }

    #[test]
    fn is_a_no_op_on_a_disposed_cache() {
        let mut cache = create_text_shaper_cache();
        dispose_text_shaper_cache(&mut cache);
        clear_text_shaper_cache(&mut cache);
        assert!(
            shape_text_run_cached(&counting_backend().0, &mut cache, "hi", &format(), None)
                .is_none()
        );
    }
}

mod create_text_shaper_cache {
    use super::*;

    #[test]
    fn allocates_a_new_independent_cache_on_each_call() {
        let (host, counter) = counting_backend();
        let (mut a, mut b) = (create_text_shaper_cache(), create_text_shaper_cache());
        shape_text_run_cached(&host, &mut a, "hi", &format(), None);
        shape_text_run_cached(&host, &mut b, "hi", &format(), None);
        assert_eq!(calls(&counter), 2);
    }
}

mod dispose_text_shaper_cache {
    use super::*;

    #[test]
    fn makes_the_cache_unusable_without_calling_the_backend_again() {
        let (host, counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        dispose_text_shaper_cache(&mut cache);
        assert!(shape_text_run_cached(&host, &mut cache, "hi", &format(), None).is_none());
        assert_eq!(calls(&counter), 1);
    }

    #[test]
    fn is_idempotent() {
        let mut cache = create_text_shaper_cache();
        dispose_text_shaper_cache(&mut cache);
        dispose_text_shaper_cache(&mut cache);
        assert!(
            shape_text_run_cached(&counting_backend().0, &mut cache, "x", &format(), None)
                .is_none()
        );
    }

    #[test]
    fn releases_the_cached_runs() {
        let (host, _counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        let cached = shape_text_run_cached(&host, &mut cache, "hi", &format(), None).unwrap();
        assert_eq!(Arc::strong_count(&cached), 2);
        dispose_text_shaper_cache(&mut cache);
        assert_eq!(Arc::strong_count(&cached), 1);
    }
}

mod initialize_text_shaper_cache {
    use super::*;

    #[test]
    fn is_the_construction_initializer_and_revives_a_disposed_cache() {
        let (host, _counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        dispose_text_shaper_cache(&mut cache);
        initialize_text_shaper_cache(&mut cache);
        assert!(shape_text_run_cached(&host, &mut cache, "hi", &format(), None).is_some());
    }
}

mod shape_text_run_cached {
    use super::*;

    fn advance(run: Option<flight_entity::Ref<ShapedRun>>) -> f32 {
        return run.unwrap().read().unwrap().advance_width;
    }

    #[test]
    fn keeps_cache_entries_isolated_when_callers_interleave_different_hosts() {
        let mut cache = create_text_shaper_cache();
        let (first, second) = (backend_with_advance(1.0), backend_with_advance(2.0));
        assert_eq!(
            advance(shape_text_run_cached(
                &first,
                &mut cache,
                "hi",
                &format(),
                None
            )),
            1.0
        );
        assert_eq!(
            advance(shape_text_run_cached(
                &second,
                &mut cache,
                "hi",
                &format(),
                None
            )),
            2.0
        );
        assert_eq!(
            advance(shape_text_run_cached(
                &first,
                &mut cache,
                "hi",
                &format(),
                None
            )),
            1.0
        );
    }

    #[test]
    fn shares_entries_between_capability_records_of_one_provider() {
        let mut cache = create_text_shaper_cache();
        let first = backend_with_advance(1.0);
        let mut second = backend_with_advance(2.0);
        second.provider = first.provider.clone();
        shape_text_run_cached(&first, &mut cache, "hi", &format(), None);
        assert_eq!(
            advance(shape_text_run_cached(
                &second,
                &mut cache,
                "hi",
                &format(),
                None
            )),
            1.0
        );
    }

    #[test]
    fn returns_null_when_the_backend_is_advances_only() {
        let mut cache = create_text_shaper_cache();
        assert!(
            shape_text_run_cached(&advances_only(|_| 0.0), &mut cache, "hi", &format(), None)
                .is_none()
        );
    }

    #[test]
    fn returns_a_shaped_run_on_success() {
        let mut cache = create_text_shaper_cache();
        let run = shape_text_run_cached(&counting_backend().0, &mut cache, "hi", &format(), None)
            .unwrap();
        assert_eq!(run.read().unwrap().glyph_count, 2);
    }

    #[test]
    fn returns_the_same_run_on_the_second_call() {
        let (host, _counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        let first = shape_text_run_cached(&host, &mut cache, "hi", &format(), None).unwrap();
        let second = shape_text_run_cached(&host, &mut cache, "hi", &format(), None).unwrap();
        assert!(Arc::ptr_eq(&first, &second));
    }

    #[test]
    fn calls_the_backend_once_for_identical_inputs_and_again_for_different_ones() {
        let (host, counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        assert_eq!(calls(&counter), 1);
        shape_text_run_cached(&host, &mut cache, "bye", &format(), None);
        assert_eq!(calls(&counter), 2);
        shape_text_run_cached(&host, &mut cache, "hi", &sized(12.0), None);
        assert_eq!(
            calls(&counter),
            2,
            "an explicit size 12 keys like the default"
        );
        shape_text_run_cached(&host, &mut cache, "hi", &sized(16.0), None);
        assert_eq!(calls(&counter), 3);
    }

    #[test]
    fn keys_on_every_shaping_relevant_format_field() {
        let (host, counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        let mut variants = Vec::new();
        let mut font = format();
        font.font = Some("Serif".to_string());
        variants.push(font);
        let mut bold = format();
        bold.bold = Some(true);
        variants.push(bold);
        let mut italic = format();
        italic.italic = Some(true);
        variants.push(italic);
        let mut kerning = format();
        kerning.kerning = Some(true);
        variants.push(kerning);
        let mut spacing = format();
        spacing.letter_spacing = Some(2.0);
        variants.push(spacing);
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        for variant in &variants {
            shape_text_run_cached(&host, &mut cache, "hi", variant, None);
        }
        assert_eq!(calls(&counter), 6);
        let mut colour_only = format();
        colour_only.color = Some(0xff0000);
        shape_text_run_cached(&host, &mut cache, "hi", &colour_only, None);
        assert_eq!(
            calls(&counter),
            6,
            "a non-shaping field does not split the key"
        );
    }

    #[test]
    fn calls_the_backend_again_for_different_options() {
        let (host, counter) = counting_backend();
        let mut cache = create_text_shaper_cache();
        let ltr = ShapeRunOptions {
            direction: Some(TextDirection::LeftToRight),
            script: None,
        };
        let rtl = ShapeRunOptions {
            direction: Some(TextDirection::RightToLeft),
            script: None,
        };
        shape_text_run_cached(&host, &mut cache, "hi", &format(), Some(&ltr));
        shape_text_run_cached(&host, &mut cache, "hi", &format(), Some(&rtl));
        assert_eq!(calls(&counter), 2);
        let empty = ShapeRunOptions {
            direction: None,
            script: None,
        };
        shape_text_run_cached(&host, &mut cache, "hi", &format(), None);
        shape_text_run_cached(&host, &mut cache, "hi", &format(), Some(&empty));
        assert_eq!(
            calls(&counter),
            4,
            "omitted options key differently from empty options"
        );
    }

    #[test]
    fn does_not_cache_null_results() {
        let mut cache = create_text_shaper_cache();
        assert!(
            shape_text_run_cached(&advances_only(|_| 0.0), &mut cache, "hi", &format(), None)
                .is_none()
        );
        let (host, counter) = counting_backend();
        assert!(shape_text_run_cached(&host, &mut cache, "hi", &format(), None).is_some());
        assert_eq!(calls(&counter), 1);
    }
}
