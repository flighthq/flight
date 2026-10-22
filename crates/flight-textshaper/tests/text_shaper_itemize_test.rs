use std::sync::{Arc, Mutex};

use flight_textshaper::contract::*;

use crate::text_shaper_fixture::*;

const ARABIC: &str = "سلام";

fn shaping_backend() -> HostTextShaperCapability {
    let mut host = advances_only(|text| text.len() as f32 * 8.0);
    host.shape_run = Some(Arc::new(|_, _, options| {
        let shaped = run(
            0.0,
            Vec::new(),
            options
                .and_then(|o| o.script.clone())
                .as_deref()
                .unwrap_or("Latn"),
        );
        shaped.write().unwrap().direction = options
            .and_then(|o| o.direction)
            .unwrap_or(TextDirection::LeftToRight);
        return shaped;
    }));
    return host;
}

fn items(
    text: &str,
    options: Option<&TextShaperOptions>,
) -> Vec<(TextDirection, usize, String, usize)> {
    let mut out = Vec::new();
    itemize_text(&mut out, text, &format(), options);
    return out
        .into_iter()
        .map(|item| (item.direction, item.start, item.script, item.end))
        .collect();
}

fn base(direction: TextDirection) -> TextShaperOptions {
    let make: fn() -> TextShaperOptions = TextShaperOptions::default;
    let mut options = make();
    options.direction = Some(direction);
    return options;
}

mod itemize_text {
    use super::*;

    #[test]
    fn clears_stale_items_and_reuses_storage_across_scripts_and_empty_input() {
        let mut out = Vec::with_capacity(8);
        out.push(TextItem {
            direction: TextDirection::TopToBottom,
            end: 99,
            script: "stale".to_string(),
            start: 99,
        });
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        itemize_text(&mut out, "a😀سلامz", &format(), None);
        assert_eq!(
            out,
            vec![
                TextItem {
                    direction: TextDirection::LeftToRight,
                    end: 3,
                    script: "Latn".to_string(),
                    start: 0,
                },
                TextItem {
                    direction: TextDirection::RightToLeft,
                    end: 7,
                    script: "Arab".to_string(),
                    start: 3,
                },
                TextItem {
                    direction: TextDirection::LeftToRight,
                    end: 8,
                    script: "Latn".to_string(),
                    start: 7,
                },
            ]
        );
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);

        itemize_text(
            &mut out,
            "..",
            &format(),
            Some(&base(TextDirection::TopToBottom)),
        );
        assert_eq!(
            out,
            vec![TextItem {
                direction: TextDirection::TopToBottom,
                end: 2,
                script: "Latn".to_string(),
                start: 0,
            }]
        );
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);

        itemize_text(&mut out, "", &format(), None);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }

    #[test]
    fn returns_empty_for_an_empty_string() {
        let mut out = Vec::new();
        itemize_text(&mut out, "", &format(), None);
        assert!(out.is_empty());
    }

    #[test]
    fn returns_a_single_run_for_a_pure_latin_string() {
        assert_eq!(
            items("Hello", None),
            vec![(TextDirection::LeftToRight, 0, "Latn".to_string(), 5)]
        );
    }

    #[test]
    fn splits_arabic_from_latin() {
        let text = format!("AB{ARABIC}");
        assert_eq!(
            items(&text, None),
            vec![
                (TextDirection::LeftToRight, 0, "Latn".to_string(), 2),
                (TextDirection::RightToLeft, 2, "Arab".to_string(), 6)
            ]
        );
    }

    #[test]
    fn treats_neutral_characters_as_belonging_to_the_current_run() {
        assert_eq!(
            items("Hello World", None),
            vec![(TextDirection::LeftToRight, 0, "Latn".to_string(), 11)]
        );
    }

    #[test]
    fn a_strong_first_character_overrides_the_base_direction() {
        assert_eq!(
            items("Hello", Some(&base(TextDirection::RightToLeft)))[0].0,
            TextDirection::LeftToRight
        );
    }

    #[test]
    fn neutral_only_text_takes_the_base_direction_and_the_latn_default() {
        assert_eq!(
            items("  !", Some(&base(TextDirection::RightToLeft))),
            vec![(TextDirection::RightToLeft, 0, "Latn".to_string(), 3)]
        );
        assert_eq!(
            items("..", Some(&base(TextDirection::TopToBottom)))[0].0,
            TextDirection::TopToBottom
        );
    }

    #[test]
    fn covers_the_entire_string_with_no_gaps() {
        let text = format!("Hi {ARABIC} end");
        let mut found = Vec::new();
        itemize_text(&mut found, &text, &format(), None);
        let covered: usize = found.iter().map(|item| item.end - item.start).sum();
        assert_eq!(covered, text.encode_utf16().count());
        for pair in found.windows(2) {
            assert_eq!(pair[1].start, pair[0].end);
        }
    }

    #[test]
    fn counts_utf16_code_units_and_keeps_a_surrogate_pair_whole() {
        let found = items("a😀b", None);
        assert_eq!(
            found,
            vec![(TextDirection::LeftToRight, 0, "Latn".to_string(), 4)]
        );
    }

    #[test]
    fn splits_on_a_script_change_within_one_direction() {
        let found = items("abαβ", None);
        assert_eq!(
            found,
            vec![
                (TextDirection::LeftToRight, 0, "Latn".to_string(), 2),
                (TextDirection::LeftToRight, 2, "Grek".to_string(), 4)
            ]
        );
    }
}

mod shape_text_runs {
    use super::*;

    #[test]
    fn threads_the_explicit_host_to_every_shaped_item() {
        assert_eq!(
            shape_text_runs(&shaping_backend(), &format!("AB{ARABIC}"), &format(), None).len(),
            2
        );
    }

    #[test]
    fn returns_empty_for_an_empty_string_or_an_advances_only_backend() {
        assert!(shape_text_runs(&shaping_backend(), "", &format(), None).is_empty());
        assert!(
            shape_text_runs(
                &advances_only(|text| text.len() as f32),
                "Hello",
                &format(),
                None
            )
            .is_empty()
        );
    }

    #[test]
    fn returns_one_shaped_run_per_item_for_a_mixed_script_string() {
        let runs = shape_text_runs(&shaping_backend(), &format!("AB{ARABIC}"), &format(), None);
        assert_eq!(
            runs[0].read().unwrap().direction,
            TextDirection::LeftToRight
        );
        assert_eq!(
            runs[1].read().unwrap().direction,
            TextDirection::RightToLeft
        );
    }

    #[test]
    fn passes_per_item_text_direction_and_script_to_shape_run() {
        let captured: Arc<Mutex<Vec<(String, Option<TextDirection>, Option<String>)>>> =
            Arc::new(Mutex::new(Vec::new()));
        let record = captured.clone();
        let mut host = advances_only(|_| 0.0);
        host.shape_run = Some(Arc::new(move |text, _format, options| {
            record.lock().unwrap().push((
                text.to_string(),
                options.and_then(|o| o.direction),
                options.and_then(|o| o.script.clone()),
            ));
            return create_shaped_run();
        }));
        shape_text_runs(&host, &format!("AB{ARABIC}"), &format(), None);
        assert_eq!(
            *captured.lock().unwrap(),
            vec![
                (
                    "AB".to_string(),
                    Some(TextDirection::LeftToRight),
                    Some("Latn".to_string())
                ),
                (
                    ARABIC.to_string(),
                    Some(TextDirection::RightToLeft),
                    Some("Arab".to_string())
                ),
            ]
        );
    }

    #[test]
    fn leaves_a_vertical_item_direction_unspecified() {
        let captured: Arc<Mutex<Vec<Option<TextDirection>>>> = Arc::new(Mutex::new(Vec::new()));
        let record = captured.clone();
        let mut host = advances_only(|_| 0.0);
        host.shape_run = Some(Arc::new(move |_, _, options| {
            record
                .lock()
                .unwrap()
                .push(options.and_then(|o| o.direction));
            return create_shaped_run();
        }));
        shape_text_runs(
            &host,
            "..",
            &format(),
            Some(&base(TextDirection::TopToBottom)),
        );
        assert_eq!(*captured.lock().unwrap(), vec![None]);
    }
}
