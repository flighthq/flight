use std::sync::Arc;

use flight_textlayout::contract::{create_rich_text_content, create_text_format_range};

use super::*;

mod clear_rich_text_content {
    use super::*;

    #[test]
    fn clears_the_attached_content() {
        let mut runtime = create_rich_text_runtime();
        get_rich_text_content(&mut runtime);
        clear_rich_text_content(&mut runtime);
        assert!(runtime.rich_text_content.is_none());
    }
}

mod compute_rich_text_content {
    use super::*;

    #[test]
    fn applies_serialized_text_format_ranges_over_plain_text() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "hello".to_string();
        let mut italic = empty_text_format();
        italic.italic = Some(true);
        data.text_format_ranges = vec![create_text_format_range(format_ref(italic), 1, 4)];
        compute_rich_text_content(&mut content, &data, None);
        let ranges: Vec<(usize, usize, Option<bool>)> = content
            .format_ranges
            .iter()
            .map(|range| (range.start, range.end, range.format.read().unwrap().italic))
            .collect();
        assert_eq!(ranges, vec![(0, 1, None), (1, 4, Some(true)), (4, 5, None)]);
    }

    #[test]
    fn condenses_whitespace() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.condense_white = true;
        data.text = "  A \n\t B  ".to_string();
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "A B ");
    }

    #[test]
    fn decodes_entities_in_plain_text() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "A&amp;B".to_string();
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "A&B");
    }

    #[test]
    fn falls_back_to_the_bullet_mask_when_the_password_character_is_empty() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "ab".to_string();
        compute_rich_text_content(&mut content, &data, Some(""));
        assert_eq!(content.text, "••");
    }

    #[test]
    fn honors_max_chars() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.max_chars = 7;
        data.text = "Hello world".to_string();
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "Hello w");
        assert_eq!(content.format_ranges.last().unwrap().end, 7);
    }

    #[test]
    fn masks_every_character_when_a_password_character_is_supplied() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "secret".to_string();
        compute_rich_text_content(&mut content, &data, Some("*"));
        assert_eq!(content.text, "******");
    }

    #[test]
    fn merges_serialized_text_format_ranges_over_the_base_format() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "hello".to_string();
        data.text_color = 0x0000_00ff;
        let mut color = empty_text_format();
        color.color = Some(0xff00_00ff);
        data.text_format_ranges = vec![create_text_format_range(format_ref(color), 1, 4)];
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(
            content.format_ranges[1].format.read().unwrap().color,
            Some(0xff00_00ff)
        );
    }

    #[test]
    fn renders_plain_text_under_the_base_format() {
        let mut content = create_rich_text_content();
        let mut data = rich_text_data();
        data.text = "hello".to_string();
        data.text_color = 0x3366_99ff;
        compute_rich_text_content(&mut content, &data, None);
        assert_eq!(content.text, "hello");
        assert_eq!(content.format_ranges.len(), 1);
        assert_eq!(
            content.format_ranges[0].format.read().unwrap().color,
            Some(0x3366_99ff)
        );
    }
}

mod get_rich_text_content {
    use super::*;

    #[test]
    fn attaches_reusable_content_to_runtime_state() {
        let mut runtime = create_rich_text_runtime();
        let content = get_rich_text_content(&mut runtime);
        assert!(Arc::ptr_eq(
            runtime.rich_text_content.as_ref().unwrap(),
            &content
        ));
        assert!(Arc::ptr_eq(&get_rich_text_content(&mut runtime), &content));
    }
}
