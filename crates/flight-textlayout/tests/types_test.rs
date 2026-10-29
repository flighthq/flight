use flight_textlayout::contract::*;

mod text_auto_size {
    use super::*;

    #[test]
    fn keeps_every_variant_distinct() {
        assert_ne!(TextAutoSize::Center, TextAutoSize::Left);
        assert_ne!(TextAutoSize::Left, TextAutoSize::None);
        assert_ne!(TextAutoSize::None, TextAutoSize::Right);
    }
}

mod text_justification {
    use super::*;

    #[test]
    fn keeps_every_variant_distinct() {
        assert_ne!(
            TextJustification::InterCharacter,
            TextJustification::InterWord
        );
        assert_ne!(TextJustification::InterWord, TextJustification::None);
    }
}

mod text_vertical_align {
    use super::*;

    #[test]
    fn keeps_every_variant_distinct() {
        assert_ne!(TextVerticalAlign::Bottom, TextVerticalAlign::Middle);
        assert_ne!(TextVerticalAlign::Middle, TextVerticalAlign::Top);
    }
}
