use flight_textlayout::contract::*;

use crate::common::{empty_text_format, range};

mod create_rich_text_content {
    use super::*;

    #[test]
    fn creates_empty_text_and_format_ranges() {
        let content = create_rich_text_content();
        assert_eq!(content.text, "");
        assert!(content.format_ranges.is_empty());
    }
}

mod initialize_rich_text_content {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_rich_text_content() {
        let mut content = create_rich_text_content();
        content.text = "text".to_string();
        content.format_ranges.push(range(empty_text_format(), 0, 4));
        initialize_rich_text_content(&mut content);
        assert_eq!(content.text, "");
        assert!(content.format_ranges.is_empty());
    }
}
