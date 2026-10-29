//! flight-compiler: target-native

use std::sync::{Arc, RwLock};

use flight_text_markup::contract::*;
use flight_textformat::{TextFormat, create_text_format_range};
use flight_textlayout::{RichTextContent, create_rich_text_content};

use crate::support::*;

fn parse(html: &str) -> RichTextContent {
    let guards = create_text_markup_guard_state();
    return parse_text_markup(html, None, &guards);
}

fn format_at(content: &RichTextContent, index: usize) -> TextFormat {
    for range in &content.format_ranges {
        if index >= range.start && index < range.end {
            return range.format.read().unwrap().clone();
        }
    }
    return empty_format();
}

fn content(text: &str, ranges: &[(TextFormat, usize, usize)]) -> RichTextContent {
    let mut out = create_rich_text_content();
    out.text = String::from(text);
    for (format, start, end) in ranges {
        out.format_ranges.push(create_text_format_range(
            Arc::new(RwLock::new(format.clone())),
            *start,
            *end,
        ));
    }
    return out;
}

mod explain_text_markup {
    use super::*;

    #[test]
    fn reports_unknown_tags_unresolved_colors_and_sanitized_hrefs_as_plain_data() {
        let explanation = explain_text_markup(
            "<widget>x</widget><font color=\"mystery\">y</font><a href=\"javascript:run()\">z</a>",
            None,
        );
        assert_eq!(explanation.issues.len(), 3);
        let unknown = &explanation.issues[0];
        assert_eq!(unknown.kind, TextMarkupIssueKind::UnknownTag);
        assert_eq!(unknown.offset, 0);
        assert_eq!(unknown.tag, "widget");
        assert_eq!(unknown.value, None);
        let color = &explanation.issues[1];
        assert_eq!(color.kind, TextMarkupIssueKind::UnresolvedFontColor);
        assert_eq!(color.offset, 18);
        assert_eq!(color.tag, "font");
        assert_eq!(color.value.as_deref(), Some("mystery"));
        let href = &explanation.issues[2];
        assert_eq!(href.kind, TextMarkupIssueKind::UnsafeHref);
        assert_eq!(href.offset, 48);
        assert_eq!(href.tag, "a");
        assert_eq!(href.value.as_deref(), Some("javascript:run()"));
    }

    #[test]
    fn returns_no_issues_for_fully_represented_safe_markup() {
        let explanation = explain_text_markup("<b>x</b><a href=\"https://flight.dev\">y</a>", None);
        assert!(explanation.issues.is_empty());
    }
}

mod format_text_markup {
    use super::*;

    #[test]
    fn returns_an_empty_string_for_empty_content() {
        assert_eq!(format_text_markup(&create_rich_text_content()), "");
    }

    #[test]
    fn emits_plain_text_with_no_ranges_and_no_tags() {
        assert_eq!(format_text_markup(&content("hello", &[])), "hello");
    }

    #[test]
    fn escapes_text_entities_on_the_way_out() {
        assert_eq!(
            format_text_markup(&content("a < b & c > d", &[])),
            "a &lt; b &amp; c &gt; d"
        );
    }

    #[test]
    fn emits_style_booleans_as_their_tags() {
        let format = TextFormat {
            bold: Some(true),
            italic: Some(true),
            strikethrough: Some(true),
            underline: Some(true),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("text", &[(format, 0, 4)])),
            "<b><i><u><s>text</s></u></i></b>"
        );
    }

    #[test]
    fn emits_font_color_as_an_rrggbb_attribute() {
        let format = TextFormat {
            color: Some(0xff0000ff),
            font: Some(String::from("Verdana")),
            size: Some(18.0),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("red", &[(format, 0, 3)])),
            "<font color=\"#ff0000\" size=\"18\" face=\"Verdana\">red</font>"
        );
    }

    #[test]
    fn emits_anchors_with_href_and_target() {
        let format = TextFormat {
            target: Some(String::from("_blank")),
            url: Some(String::from("https://a.test")),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("link", &[(format, 0, 4)])),
            "<a href=\"https://a.test\" target=\"_blank\">link</a>"
        );
    }

    #[test]
    fn emits_textformat_block_metrics() {
        let format = TextFormat {
            block_indent: Some(4.0),
            leading: Some(2.0),
            left_margin: Some(10.0),
            tab_stops: Some(vec![10.0, 20.0]),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("x", &[(format, 0, 1)])),
            "<textformat blockindent=\"4\" leading=\"2\" leftmargin=\"10\" tabstops=\"10,20\">x</textformat>"
        );
    }

    #[test]
    fn emits_bullets_with_a_list_marker_type() {
        let format = TextFormat {
            bullet: Some(true),
            list_marker: Some(flight_textformat::TextFormatListMarker::Square),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("item", &[(format, 0, 4)])),
            "<li type=\"square\">item</li>"
        );
    }

    #[test]
    fn resolves_overlapping_ranges_by_array_order() {
        let first = TextFormat {
            bold: Some(true),
            color: Some(0xff0000ff),
            ..empty_format()
        };
        let second = TextFormat {
            color: Some(0x0000ffff),
            italic: Some(true),
            ..empty_format()
        };
        assert_eq!(
            format_text_markup(&content("abcde", &[(first, 0, 5), (second, 2, 4)])),
            "<font color=\"#ff0000\"><b>ab</b></font><font color=\"#0000ff\"><b><i>cd</i></b></font><font color=\"#ff0000\"><b>e</b></font>"
        );
    }

    #[test]
    fn serializes_resolved_span_classes_as_standard_tags_rather_than_class_names() {
        let format = TextFormat {
            bold: Some(true),
            ..empty_format()
        };
        let output = format_text_markup(&content("x", &[(format, 0, 1)]));
        assert_eq!(output, "<b>x</b>");
        assert!(!output.contains("class"));
    }
}

mod parse_text_markup {
    use super::*;

    #[test]
    fn returns_empty_content_for_an_empty_string() {
        let parsed = parse("");
        assert_eq!(parsed.text, "");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn keeps_plain_text_with_no_ranges() {
        let parsed = parse("just text");
        assert_eq!(parsed.text, "just text");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn decodes_named_and_numeric_entities() {
        assert_eq!(
            parse("&amp;&lt;&gt;&quot;&apos;&#65;&#x42;").text,
            "&<>\"'AB"
        );
    }

    #[test]
    fn leaves_unknown_named_entities_verbatim() {
        assert_eq!(parse("&unknown;").text, "&unknown;");
    }

    #[test]
    fn maps_style_tags_to_style_booleans() {
        for (html, expected) in [
            (
                "<b>x</b>",
                TextFormat {
                    bold: Some(true),
                    ..empty_format()
                },
            ),
            (
                "<i>x</i>",
                TextFormat {
                    italic: Some(true),
                    ..empty_format()
                },
            ),
            (
                "<u>x</u>",
                TextFormat {
                    underline: Some(true),
                    ..empty_format()
                },
            ),
            (
                "<s>x</s>",
                TextFormat {
                    strikethrough: Some(true),
                    ..empty_format()
                },
            ),
        ] {
            assert_eq!(format_at(&parse(html), 0), expected, "{}", html);
        }
    }

    #[test]
    fn maps_the_strong_em_strike_aliases_to_the_same_booleans() {
        assert_eq!(format_at(&parse("<strong>x</strong>"), 0).bold, Some(true));
        assert_eq!(format_at(&parse("<em>x</em>"), 0).italic, Some(true));
        assert_eq!(
            format_at(&parse("<strike>x</strike>"), 0).strikethrough,
            Some(true)
        );
    }

    #[test]
    fn leaves_a_named_font_color_unresolved_by_default() {
        assert_eq!(
            format_at(&parse("<font color=\"red\">x</font>"), 0).color,
            None
        );
        assert_eq!(
            format_at(&parse("<font color=\"cornflowerblue\">x</font>"), 0).color,
            None
        );
    }

    #[test]
    fn uses_a_passed_registry_instead_of_the_standard_dialect() {
        let mut registry = create_markup_tag_registry();
        register_markup_tag(
            &mut registry,
            "hot",
            Arc::new(|_attributes, _enclosing| {
                MarkupTagResult::Format(TextFormat {
                    color: Some(0xff0000ff),
                    ..empty_format()
                })
            }),
        );
        let guards = create_text_markup_guard_state();
        let parsed = parse_text_markup("<hot>x</hot><b>y</b>", Some(&registry), &guards);
        assert_eq!(parsed.text, "xy");
        assert_eq!(format_at(&parsed, 0).color, Some(0xff0000ff));
        assert_eq!(format_at(&parsed, 1), empty_format());
    }

    #[test]
    fn parses_font_color_size_and_face() {
        assert_eq!(
            format_at(&parse("<font color=\"#ff0000\">x</font>"), 0).color,
            Some(0xff0000ff)
        );
        assert_eq!(
            format_at(&parse("<font color=\"#f00\">x</font>"), 0).color,
            Some(0xff0000ff)
        );
        assert_eq!(
            format_at(&parse("<font color=\"0x00ff00\">x</font>"), 0).color,
            Some(0x00ff00ff)
        );
        let format = format_at(&parse("<font size=\"24\" face=\"Arial\">x</font>"), 0);
        assert_eq!(format.font.as_deref(), Some("Arial"));
        assert_eq!(format.size, Some(24.0));
    }

    #[test]
    fn resolves_relative_font_sizes_against_the_enclosing_absolute_size() {
        let parsed =
            parse("<font size=\"16\">a<font size=\"+2\">b</font><font size=\"-1\">c</font></font>");
        assert_eq!(format_at(&parsed, 0).size, Some(16.0));
        assert_eq!(format_at(&parsed, 1).size, Some(18.0));
        assert_eq!(format_at(&parsed, 2).size, Some(15.0));
    }

    #[test]
    fn ignores_an_unparseable_font_color_rather_than_throwing() {
        assert_eq!(
            format_at(&parse("<font color=\"notacolor\">x</font>"), 0).color,
            None
        );
    }

    #[test]
    fn parses_anchors_into_url_and_target() {
        let format = format_at(
            &parse("<a href=\"https://a.test\" target=\"_blank\">x</a>"),
            0,
        );
        assert_eq!(format.url.as_deref(), Some("https://a.test"));
        assert_eq!(format.target.as_deref(), Some("_blank"));
    }

    #[test]
    fn drops_unsafe_href_schemes_while_retaining_text_and_safe_metadata() {
        let parsed = parse("<a href=\"java\nscript:run()\" target=\"_blank\">x</a>");
        assert_eq!(parsed.text, "x");
        let format = format_at(&parsed, 0);
        assert_eq!(format.target.as_deref(), Some("_blank"));
        assert_eq!(format.url, None);
    }

    #[test]
    fn parses_p_align_into_the_align_field() {
        assert_eq!(
            format_at(&parse("<p align=\"center\">x</p>"), 0).align,
            Some(flight_textformat::TextFormatAlign::Center)
        );
    }

    #[test]
    fn parses_li_into_bullet_and_an_optional_list_marker() {
        assert_eq!(format_at(&parse("<li>x</li>"), 0).bullet, Some(true));
        let marked = format_at(&parse("<li type=\"square\">x</li>"), 0);
        assert_eq!(marked.bullet, Some(true));
        assert_eq!(
            marked.list_marker,
            Some(flight_textformat::TextFormatListMarker::Square)
        );
    }

    #[test]
    fn inserts_an_implicit_break_before_a_block_tag_but_not_at_the_start() {
        assert_eq!(parse("<p align=\"left\">first</p>").text, "first");
        let parsed = parse("<p align=\"left\">a</p><p align=\"right\">b</p>");
        assert_eq!(parsed.text, "a\nb");
        assert_eq!(
            format_at(&parsed, 0).align,
            Some(flight_textformat::TextFormatAlign::Left)
        );
        assert_eq!(
            format_at(&parsed, 2).align,
            Some(flight_textformat::TextFormatAlign::Right)
        );
    }

    #[test]
    fn collapses_the_block_break_against_an_existing_trailing_newline() {
        assert_eq!(parse("a<br><li>b</li>").text, "a\nb");
    }

    #[test]
    fn parses_textformat_block_metrics() {
        let format = format_at(
            &parse(
                "<textformat leftmargin=\"10\" blockindent=\"4\" tabstops=\"10, 20\">x</textformat>",
            ),
            0,
        );
        assert_eq!(format.block_indent, Some(4.0));
        assert_eq!(format.left_margin, Some(10.0));
        assert_eq!(format.tab_stops, Some(vec![10.0, 20.0]));
    }

    #[test]
    fn turns_br_into_a_newline_with_no_orphan_format() {
        let parsed = parse("a<br>b");
        assert_eq!(parsed.text, "a\nb");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn keeps_span_text_but_applies_no_format() {
        let parsed = parse("<span class=\"fancy\">kept</span>");
        assert_eq!(parsed.text, "kept");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn drops_img_tags_entirely() {
        let parsed = parse("a<img src=\"x.png\"/>b");
        assert_eq!(parsed.text, "ab");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn composes_nested_tags_into_a_single_range() {
        let format = format_at(&parse("<font color=\"#0000ff\"><b>x</b></font>"), 0);
        assert_eq!(format.bold, Some(true));
        assert_eq!(format.color, Some(0x0000ffff));
    }

    #[test]
    fn splits_ranges_at_format_boundaries() {
        let parsed = parse("<b>a<i>b</i></b>c");
        assert_eq!(parsed.text, "abc");
        assert_eq!(format_at(&parsed, 0).bold, Some(true));
        assert_eq!(format_at(&parsed, 0).italic, None);
        assert_eq!(format_at(&parsed, 1).bold, Some(true));
        assert_eq!(format_at(&parsed, 1).italic, Some(true));
        assert_eq!(format_at(&parsed, 2), empty_format());
    }

    #[test]
    fn recovers_from_an_unclosed_tag_by_extending_to_the_end() {
        let parsed = parse("<b>bold to end");
        assert_eq!(parsed.text, "bold to end");
        assert_eq!(format_at(&parsed, 0).bold, Some(true));
        assert_eq!(format_at(&parsed, parsed.text.len() - 1).bold, Some(true));
    }

    #[test]
    fn keeps_the_text_of_unknown_tags() {
        let parsed = parse("<marquee>scroll</marquee>");
        assert_eq!(parsed.text, "scroll");
        assert!(parsed.format_ranges.is_empty());
    }

    #[test]
    fn treats_a_stray_less_than_with_no_close_as_literal_text() {
        assert_eq!(parse("a < b").text, "a < b");
    }

    #[test]
    fn ignores_an_extra_closing_tag_without_throwing() {
        let parsed = parse("a</b>b");
        assert_eq!(parsed.text, "ab");
        assert!(parsed.format_ranges.is_empty());
    }
}

mod text_markup_round_trip {
    use super::*;

    #[test]
    fn is_a_fixed_point_over_parse_format_reparse() {
        let cases = [
            "plain text",
            "a <b>bold</b> and <i>italic</i> mix",
            "<font color=\"#123456\" size=\"20\" face=\"Georgia\">styled</font>",
            "<a href=\"https://a.test\" target=\"_top\">link</a>",
            "<p align=\"justify\">para</p>",
            "<li type=\"disc\">bullet</li>",
            "<textformat leftmargin=\"8\" indent=\"2\" leading=\"4\" tabstops=\"10,20,30\">metrics</textformat>",
            "<font color=\"#00ff00\"><b><u>deep</u></b></font>",
            "entities &amp; &lt; &gt; escaped",
            "line one<br>line two",
            "<p align=\"left\">one</p><p align=\"right\">two</p>",
            "lead<li type=\"disc\">item</li>",
        ];
        for source in cases {
            let once = parse(source);
            let twice = parse(&format_text_markup(&once));
            assert_eq!(twice.text, once.text, "{}", source);
            assert_eq!(
                twice.format_ranges.len(),
                once.format_ranges.len(),
                "{}",
                source
            );
            for index in 0..once.format_ranges.len() {
                let before = &once.format_ranges[index];
                let after = &twice.format_ranges[index];
                assert_eq!(
                    (after.start, after.end),
                    (before.start, before.end),
                    "{}",
                    source
                );
                assert_eq!(
                    *after.format.read().unwrap(),
                    *before.format.read().unwrap(),
                    "{}",
                    source
                );
            }
        }
    }
}
