use flight_layout::contract::*;

mod get_flex_layout_align_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_flex_layout_align_string(FlexLayoutAlign::Center),
            "center"
        );
        assert_eq!(get_flex_layout_align_string(FlexLayoutAlign::End), "end");
        assert_eq!(
            get_flex_layout_align_string(FlexLayoutAlign::Start),
            "start"
        );
        assert_eq!(
            get_flex_layout_align_string(FlexLayoutAlign::Stretch),
            "stretch"
        );
    }
}

mod get_flex_layout_direction_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_flex_layout_direction_string(FlexLayoutDirection::Column),
            "column"
        );
        assert_eq!(
            get_flex_layout_direction_string(FlexLayoutDirection::ColumnReverse),
            "column-reverse"
        );
        assert_eq!(
            get_flex_layout_direction_string(FlexLayoutDirection::Row),
            "row"
        );
        assert_eq!(
            get_flex_layout_direction_string(FlexLayoutDirection::RowReverse),
            "row-reverse"
        );
    }
}

mod get_flex_layout_justify_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::Center),
            "center"
        );
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::End),
            "end"
        );
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::SpaceAround),
            "space-around"
        );
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::SpaceBetween),
            "space-between"
        );
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::SpaceEvenly),
            "space-evenly"
        );
        assert_eq!(
            get_flex_layout_justify_string(FlexLayoutJustify::Start),
            "start"
        );
    }
}

mod get_flex_layout_wrap_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_flex_layout_wrap_string(FlexLayoutWrap::NoWrap),
            "nowrap"
        );
        assert_eq!(get_flex_layout_wrap_string(FlexLayoutWrap::Wrap), "wrap");
        assert_eq!(
            get_flex_layout_wrap_string(FlexLayoutWrap::WrapReverse),
            "wrap-reverse"
        );
    }
}

mod get_layout_resolution_failure_kind_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_layout_resolution_failure_kind_string(
                LayoutResolutionFailureKind::IntrinsicSizesTooSmall
            ),
            "IntrinsicSizesTooSmall"
        );
        assert_eq!(
            get_layout_resolution_failure_kind_string(
                LayoutResolutionFailureKind::InvalidContainerStyle
            ),
            "InvalidContainerStyle"
        );
        assert_eq!(
            get_layout_resolution_failure_kind_string(
                LayoutResolutionFailureKind::InvalidHierarchy
            ),
            "InvalidHierarchy"
        );
        assert_eq!(
            get_layout_resolution_failure_kind_string(
                LayoutResolutionFailureKind::InvalidItemStyle
            ),
            "InvalidItemStyle"
        );
        assert_eq!(
            get_layout_resolution_failure_kind_string(LayoutResolutionFailureKind::OutputTooSmall),
            "OutputTooSmall"
        );
        assert_eq!(
            get_layout_resolution_failure_kind_string(
                LayoutResolutionFailureKind::UnregisteredKind
            ),
            "UnregisteredKind"
        );
    }
}

mod get_viewport_align_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_viewport_align_string(ViewportAlign::Bottom), "bottom");
        assert_eq!(
            get_viewport_align_string(ViewportAlign::BottomLeft),
            "bottomleft"
        );
        assert_eq!(
            get_viewport_align_string(ViewportAlign::BottomRight),
            "bottomright"
        );
        assert_eq!(get_viewport_align_string(ViewportAlign::Left), "left");
        assert_eq!(get_viewport_align_string(ViewportAlign::Right), "right");
        assert_eq!(get_viewport_align_string(ViewportAlign::Top), "top");
        assert_eq!(get_viewport_align_string(ViewportAlign::TopLeft), "topleft");
        assert_eq!(
            get_viewport_align_string(ViewportAlign::TopRight),
            "topright"
        );
    }
}

mod parse_flex_layout_align {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_flex_layout_align("center"),
            Some(FlexLayoutAlign::Center)
        );
        assert_eq!(parse_flex_layout_align("end"), Some(FlexLayoutAlign::End));
        assert_eq!(
            parse_flex_layout_align("start"),
            Some(FlexLayoutAlign::Start)
        );
        assert_eq!(
            parse_flex_layout_align("stretch"),
            Some(FlexLayoutAlign::Stretch)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_flex_layout_align("CENTER"), None);
        assert_eq!(parse_flex_layout_align(""), None);
    }
}

mod parse_flex_layout_direction {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_flex_layout_direction("column"),
            Some(FlexLayoutDirection::Column)
        );
        assert_eq!(
            parse_flex_layout_direction("column-reverse"),
            Some(FlexLayoutDirection::ColumnReverse)
        );
        assert_eq!(
            parse_flex_layout_direction("row"),
            Some(FlexLayoutDirection::Row)
        );
        assert_eq!(
            parse_flex_layout_direction("row-reverse"),
            Some(FlexLayoutDirection::RowReverse)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_flex_layout_direction("COLUMN"), None);
        assert_eq!(parse_flex_layout_direction(""), None);
    }
}

mod parse_flex_layout_justify {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_flex_layout_justify("center"),
            Some(FlexLayoutJustify::Center)
        );
        assert_eq!(
            parse_flex_layout_justify("end"),
            Some(FlexLayoutJustify::End)
        );
        assert_eq!(
            parse_flex_layout_justify("space-around"),
            Some(FlexLayoutJustify::SpaceAround)
        );
        assert_eq!(
            parse_flex_layout_justify("space-between"),
            Some(FlexLayoutJustify::SpaceBetween)
        );
        assert_eq!(
            parse_flex_layout_justify("space-evenly"),
            Some(FlexLayoutJustify::SpaceEvenly)
        );
        assert_eq!(
            parse_flex_layout_justify("start"),
            Some(FlexLayoutJustify::Start)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_flex_layout_justify("CENTER"), None);
        assert_eq!(parse_flex_layout_justify(""), None);
    }
}

mod parse_flex_layout_wrap {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_flex_layout_wrap("nowrap"),
            Some(FlexLayoutWrap::NoWrap)
        );
        assert_eq!(parse_flex_layout_wrap("wrap"), Some(FlexLayoutWrap::Wrap));
        assert_eq!(
            parse_flex_layout_wrap("wrap-reverse"),
            Some(FlexLayoutWrap::WrapReverse)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_flex_layout_wrap("NOWRAP"), None);
        assert_eq!(parse_flex_layout_wrap(""), None);
    }
}

mod parse_layout_resolution_failure_kind {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_layout_resolution_failure_kind("IntrinsicSizesTooSmall"),
            Some(LayoutResolutionFailureKind::IntrinsicSizesTooSmall)
        );
        assert_eq!(
            parse_layout_resolution_failure_kind("InvalidContainerStyle"),
            Some(LayoutResolutionFailureKind::InvalidContainerStyle)
        );
        assert_eq!(
            parse_layout_resolution_failure_kind("InvalidHierarchy"),
            Some(LayoutResolutionFailureKind::InvalidHierarchy)
        );
        assert_eq!(
            parse_layout_resolution_failure_kind("InvalidItemStyle"),
            Some(LayoutResolutionFailureKind::InvalidItemStyle)
        );
        assert_eq!(
            parse_layout_resolution_failure_kind("OutputTooSmall"),
            Some(LayoutResolutionFailureKind::OutputTooSmall)
        );
        assert_eq!(
            parse_layout_resolution_failure_kind("UnregisteredKind"),
            Some(LayoutResolutionFailureKind::UnregisteredKind)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(
            parse_layout_resolution_failure_kind("INTRINSICSIZESTOOSMALL"),
            None
        );
        assert_eq!(parse_layout_resolution_failure_kind(""), None);
    }
}

mod parse_viewport_align {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_viewport_align("bottom"), Some(ViewportAlign::Bottom));
        assert_eq!(
            parse_viewport_align("bottomleft"),
            Some(ViewportAlign::BottomLeft)
        );
        assert_eq!(
            parse_viewport_align("bottomright"),
            Some(ViewportAlign::BottomRight)
        );
        assert_eq!(parse_viewport_align("left"), Some(ViewportAlign::Left));
        assert_eq!(parse_viewport_align("right"), Some(ViewportAlign::Right));
        assert_eq!(parse_viewport_align("top"), Some(ViewportAlign::Top));
        assert_eq!(
            parse_viewport_align("topleft"),
            Some(ViewportAlign::TopLeft)
        );
        assert_eq!(
            parse_viewport_align("topright"),
            Some(ViewportAlign::TopRight)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_viewport_align("BOTTOM"), None);
        assert_eq!(parse_viewport_align(""), None);
    }
}
