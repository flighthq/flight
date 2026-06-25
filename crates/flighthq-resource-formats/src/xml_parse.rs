//! Pull-style XML parser sufficient for atlas and plist file formats.
//!
//! Port of `xmlParse.ts`. Not a general-purpose XML parser, but handles
//! namespaced/extra attributes and elements, both double-quoted and
//! single-quoted attribute values, XML entity escapes (`&amp; &lt; &gt; &quot;
//! &apos;` plus numeric references), XML comments (`<!-- -->`), CDATA sections
//! (`<![CDATA[...]]>`), the XML declaration, and DOCTYPE.
//!
//! TS used regular expressions for tokenizing; the Rust port hand-rolls the
//! equivalent scanning so the crate stays dependency-free. Behavior matches the
//! TS assertions 1:1.

/// A parsed XML element.
///
/// `attributes` preserves the document's attribute insertion order; matches the
/// TS `Record<string, string>` semantics for the patterns this parser targets.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct XmlElement {
    /// Attribute name → value, in document order.
    pub attributes: Vec<(String, String)>,
    /// Direct child elements. Text content and comments are discarded as
    /// elements.
    pub children: Vec<XmlElement>,
    /// Element name.
    pub name: String,
    /// Raw text content (trimmed), concatenation of text nodes.
    pub text: String,
}

impl XmlElement {
    /// Look up an attribute value by name, mirroring TS `el.attributes[name]`.
    /// Returns `None` for an absent attribute.
    pub fn get_attribute(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
}

/// Parse all attributes from an element's attribute string.
///
/// Supports double-quoted and single-quoted values and XML entity escapes.
/// Returns attributes in document order (TS returned a `Record`, iterated here
/// as ordered pairs).
pub fn parse_xml_attributes(attrs: &str) -> Vec<(String, String)> {
    let mut result: Vec<(String, String)> = Vec::new();
    let bytes: Vec<char> = attrs.chars().collect();
    let len = bytes.len();
    let mut pos = 0usize;

    while pos < len {
        // Find the next attribute-name start: a name char per [\w:.-].
        while pos < len && !is_attr_name_char(bytes[pos]) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let name_start = pos;
        while pos < len && is_attr_name_char(bytes[pos]) {
            pos += 1;
        }
        let name: String = bytes[name_start..pos].iter().collect();

        // Skip whitespace, then require '='.
        let mut probe = pos;
        while probe < len && bytes[probe].is_whitespace() {
            probe += 1;
        }
        if probe >= len || bytes[probe] != '=' {
            // No '=' for this token; it is not a quoted attribute. Continue
            // scanning from where the name ended.
            continue;
        }
        probe += 1; // consume '='
        while probe < len && bytes[probe].is_whitespace() {
            probe += 1;
        }
        if probe >= len {
            break;
        }
        let quote = bytes[probe];
        if quote != '"' && quote != '\'' {
            // Not a quoted value; skip and keep scanning.
            pos = probe;
            continue;
        }
        probe += 1; // consume opening quote
        let value_start = probe;
        while probe < len && bytes[probe] != quote {
            probe += 1;
        }
        let raw: String = bytes[value_start..probe.min(len)].iter().collect();
        if probe < len {
            probe += 1; // consume closing quote
        }
        result.push((name, decode_xml_entities(&raw)));
        pos = probe;
    }

    result
}

/// Parse a simple XML document into a tree of [`XmlElement`] values.
///
/// Returns the root element, or `None` when the input contains no recognizable
/// element. Does not validate DTD, namespaces, or processing instructions.
pub fn parse_xml_document(xml: &str) -> Option<XmlElement> {
    // Normalize: strip comments, process CDATA, normalize line endings.
    let normalized = normalize_line_endings(&strip_cdata(&strip_xml_comments(xml)));

    // Strip XML declaration and DOCTYPE if present, then trim.
    let without_pi = strip_processing_instructions(&normalized);
    let without_doctype = strip_doctype(&without_pi);
    let src: Vec<char> = without_doctype.trim().chars().collect();

    let mut state = ParseState { pos: 0 };
    parse_element(&src, &mut state)
}

struct ParseState {
    pos: usize,
}

fn decode_xml_entities(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(s.len());
    let mut i = 0usize;

    while i < len {
        if chars[i] != '&' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        // Find the terminating ';'.
        let mut j = i + 1;
        while j < len && chars[j] != ';' {
            j += 1;
        }
        if j >= len {
            // No terminator; emit the '&' literally and continue.
            out.push('&');
            i += 1;
            continue;
        }
        let body: String = chars[i + 1..j].iter().collect();
        if let Some(replacement) = decode_entity_body(&body) {
            out.push_str(&replacement);
            i = j + 1;
        } else {
            // Unrecognized entity: emit the original `&...;` verbatim (TS
            // returned the whole match `_`).
            out.push('&');
            out.push_str(&body);
            out.push(';');
            i = j + 1;
        }
    }

    out
}

/// Decode the body of an entity (the text between `&` and `;`). Returns `None`
/// when the body is not a recognized entity, matching TS's fall-through to the
/// raw match.
fn decode_entity_body(body: &str) -> Option<String> {
    if let Some(rest) = body.strip_prefix("#x").or_else(|| body.strip_prefix("#X")) {
        // The TS regex used #x([\da-fA-F]+); only the lowercase 'x' form is
        // produced by the TS pattern, but accept both to stay tolerant.
        if rest.is_empty() {
            return None;
        }
        let code = u32::from_str_radix(rest, 16).ok()?;
        return char::from_u32(code).map(|c| c.to_string());
    }
    if let Some(rest) = body.strip_prefix('#') {
        if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }
        let code: u32 = rest.parse().ok()?;
        return char::from_u32(code).map(|c| c.to_string());
    }
    // Named entity: TS matched (\w+). Require word chars only.
    if !body.is_empty() && body.chars().all(is_word_char) {
        return named_entity(body).map(str::to_string);
    }
    None
}

fn is_attr_name_char(c: char) -> bool {
    // TS attribute-name class: [\w:.-].
    is_word_char(c) || c == ':' || c == '.' || c == '-'
}

fn is_word_char(c: char) -> bool {
    // Matches JS \w: ASCII letters, digits, and underscore.
    c.is_ascii_alphanumeric() || c == '_'
}

/// True for the JS `\s` whitespace class as used by the name-terminator test
/// `/[\s>/]/` in `parseElement`.
fn is_name_terminator(c: char) -> bool {
    c.is_whitespace() || c == '>' || c == '/'
}

fn named_entity(name: &str) -> Option<&'static str> {
    static ENTITIES: &[(&str, &str)] = &[
        ("amp", "&"),
        ("apos", "'"),
        ("gt", ">"),
        ("lt", "<"),
        ("quot", "\""),
    ];
    ENTITIES
        .iter()
        .find(|(key, _)| *key == name)
        .map(|(_, value)| *value)
}

fn normalize_line_endings(src: &str) -> String {
    // Replace \r\n and bare \r with \n (TS: /\r\n?/g -> '\n').
    let mut out = String::with_capacity(src.len());
    let chars: Vec<char> = src.chars().collect();
    let len = chars.len();
    let mut i = 0usize;
    while i < len {
        if chars[i] == '\r' {
            out.push('\n');
            if i + 1 < len && chars[i + 1] == '\n' {
                i += 2;
            } else {
                i += 1;
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn parse_element(src: &[char], state: &mut ParseState) -> Option<XmlElement> {
    skip_whitespace(src, state);
    if state.pos >= src.len() || src[state.pos] != '<' {
        return None;
    }

    state.pos += 1; // consume '<'

    // Skip processing instructions.
    if state.pos < src.len() && src[state.pos] == '?' {
        match find_subslice(src, state.pos, &['?', '>']) {
            Some(end) => state.pos = end + 2,
            None => state.pos = src.len(),
        }
        return parse_element(src, state);
    }

    // Read element name.
    let name_start = state.pos;
    while state.pos < src.len() && !is_name_terminator(src[state.pos]) {
        state.pos += 1;
    }
    let name: String = src[name_start..state.pos].iter().collect();
    if name.is_empty() {
        return None;
    }

    skip_whitespace(src, state);

    // Read attributes (everything up to '>' or '/>').
    let mut attrs_str = String::new();
    while state.pos < src.len()
        && src[state.pos] != '>'
        && !(src[state.pos] == '/' && peek(src, state.pos + 1) == Some('>'))
    {
        attrs_str.push(src[state.pos]);
        state.pos += 1;
    }

    let self_closing = state.pos < src.len() && src[state.pos] == '/';
    state.pos += if self_closing { 2 } else { 1 }; // consume '/>' or '>'

    let attributes = parse_xml_attributes(&attrs_str);
    let mut children: Vec<XmlElement> = Vec::new();
    let mut text = String::new();

    if !self_closing {
        // Parse children until the closing tag.
        while state.pos < src.len() {
            skip_whitespace(src, state);
            if state.pos >= src.len() {
                break;
            }

            if src[state.pos] != '<' {
                // Text node.
                let text_start = state.pos;
                while state.pos < src.len() && src[state.pos] != '<' {
                    state.pos += 1;
                }
                let raw: String = src[text_start..state.pos].iter().collect();
                text.push_str(&decode_xml_entities(raw.trim()));
                continue;
            }

            // Check for closing tag.
            if peek(src, state.pos + 1) == Some('/') {
                while state.pos < src.len() && src[state.pos] != '>' {
                    state.pos += 1;
                }
                state.pos += 1; // consume '>'
                break;
            }

            if let Some(child) = parse_element(src, state) {
                children.push(child);
            }
        }
    }

    Some(XmlElement {
        attributes,
        children,
        name,
        text,
    })
}

fn peek(src: &[char], index: usize) -> Option<char> {
    src.get(index).copied()
}

fn find_subslice(src: &[char], from: usize, needle: &[char]) -> Option<usize> {
    if needle.is_empty() || from > src.len() {
        return None;
    }
    let last = src.len().checked_sub(needle.len())?;
    (from..=last).find(|&i| src[i..i + needle.len()] == *needle)
}

fn skip_whitespace(src: &[char], state: &mut ParseState) {
    while state.pos < src.len() && src[state.pos].is_whitespace() {
        state.pos += 1;
    }
}

/// Replace each CDATA section with its raw inner content (TS: drop the `<![CDATA[`
/// prefix and the `]]>` suffix).
fn strip_cdata(xml: &str) -> String {
    let open: Vec<char> = "<![CDATA[".chars().collect();
    let close: Vec<char> = "]]>".chars().collect();
    let chars: Vec<char> = xml.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(xml.len());
    let mut i = 0usize;

    while i < len {
        if matches_at(&chars, i, &open) {
            let content_start = i + open.len();
            match find_subslice(&chars, content_start, &close) {
                Some(end) => {
                    out.extend(&chars[content_start..end]);
                    i = end + close.len();
                }
                None => {
                    // No terminator: leave the rest verbatim.
                    out.extend(&chars[i..]);
                    break;
                }
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }

    out
}

/// Strip `<!DOCTYPE ...>` declarations (TS: /<!DOCTYPE[^>]*>/gi).
fn strip_doctype(src: &str) -> String {
    strip_bracketed(src, "<!DOCTYPE", true)
}

/// Strip `<?...?>` processing instructions, including the XML declaration
/// (TS: /<\?[\s\S]*?\?>/g).
fn strip_processing_instructions(src: &str) -> String {
    let open: Vec<char> = "<?".chars().collect();
    let close: Vec<char> = "?>".chars().collect();
    let chars: Vec<char> = src.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(src.len());
    let mut i = 0usize;

    while i < len {
        if matches_at(&chars, i, &open) {
            match find_subslice(&chars, i + open.len(), &close) {
                Some(end) => i = end + close.len(),
                None => {
                    // Unterminated PI: drop the remainder.
                    break;
                }
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }

    out
}

/// Remove XML comments `<!-- ... -->` (TS: /<!--[\s\S]*?-->/g).
fn strip_xml_comments(xml: &str) -> String {
    let open: Vec<char> = "<!--".chars().collect();
    let close: Vec<char> = "-->".chars().collect();
    let chars: Vec<char> = xml.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(xml.len());
    let mut i = 0usize;

    while i < len {
        if matches_at(&chars, i, &open) {
            match find_subslice(&chars, i + open.len(), &close) {
                Some(end) => i = end + close.len(),
                None => break,
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }

    out
}

/// Remove every `<prefix ... >` run terminated by the next `>` (the `[^>]*>`
/// shape used for DOCTYPE). `case_insensitive` matches the TS `i` flag.
fn strip_bracketed(src: &str, prefix: &str, case_insensitive: bool) -> String {
    let prefix_chars: Vec<char> = prefix.chars().collect();
    let chars: Vec<char> = src.chars().collect();
    let len = chars.len();
    let mut out = String::with_capacity(src.len());
    let mut i = 0usize;

    while i < len {
        if matches_at_with_case(&chars, i, &prefix_chars, case_insensitive) {
            let mut j = i + prefix_chars.len();
            while j < len && chars[j] != '>' {
                j += 1;
            }
            if j < len {
                j += 1; // consume '>'
            }
            i = j;
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }

    out
}

fn matches_at(haystack: &[char], at: usize, needle: &[char]) -> bool {
    matches_at_with_case(haystack, at, needle, false)
}

fn matches_at_with_case(
    haystack: &[char],
    at: usize,
    needle: &[char],
    case_insensitive: bool,
) -> bool {
    if at + needle.len() > haystack.len() {
        return false;
    }
    needle.iter().enumerate().all(|(k, &expected)| {
        let actual = haystack[at + k];
        if case_insensitive {
            actual.eq_ignore_ascii_case(&expected)
        } else {
            actual == expected
        }
    })
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    fn attr_map(el: &XmlElement) -> BTreeMap<String, String> {
        el.attributes.iter().cloned().collect()
    }

    mod parse_xml_attributes {
        use super::*;

        fn lookup<'a>(attrs: &'a [(String, String)], name: &str) -> Option<&'a str> {
            attrs
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.as_str())
        }

        #[test]
        fn parses_double_quoted_attributes() {
            let attrs = parse_xml_attributes("name=\"hero\" x=\"10\" y=\"20\"");
            assert_eq!(lookup(&attrs, "name"), Some("hero"));
            assert_eq!(lookup(&attrs, "x"), Some("10"));
            assert_eq!(lookup(&attrs, "y"), Some("20"));
        }

        #[test]
        fn parses_single_quoted_attributes() {
            let attrs = parse_xml_attributes("name='hero' x='10'");
            assert_eq!(lookup(&attrs, "name"), Some("hero"));
            assert_eq!(lookup(&attrs, "x"), Some("10"));
        }

        #[test]
        fn decodes_xml_entity_amp() {
            let attrs = parse_xml_attributes("name=\"a&amp;b\"");
            assert_eq!(lookup(&attrs, "name"), Some("a&b"));
        }

        #[test]
        fn decodes_xml_entity_lt_and_gt() {
            let attrs = parse_xml_attributes("name=\"a&lt;b&gt;c\"");
            assert_eq!(lookup(&attrs, "name"), Some("a<b>c"));
        }

        #[test]
        fn decodes_xml_entity_quot() {
            let attrs = parse_xml_attributes("name='say &quot;hi&quot;'");
            assert_eq!(lookup(&attrs, "name"), Some("say \"hi\""));
        }

        #[test]
        fn decodes_xml_entity_apos() {
            let attrs = parse_xml_attributes("name=\"it&apos;s\"");
            assert_eq!(lookup(&attrs, "name"), Some("it's"));
        }

        #[test]
        fn decodes_numeric_character_references() {
            let attrs = parse_xml_attributes("name=\"&#65;\"");
            assert_eq!(lookup(&attrs, "name"), Some("A"));
        }

        #[test]
        fn returns_empty_for_empty_string() {
            assert!(parse_xml_attributes("").is_empty());
        }
    }

    mod parse_xml_document {
        use super::*;

        #[test]
        fn returns_the_first_top_level_element_as_the_root() {
            let root = parse_xml_document("<TextureAtlas imagePath=\"sheet.png\"></TextureAtlas>")
                .unwrap();
            assert_eq!(root.name, "TextureAtlas");
            assert_eq!(root.get_attribute("imagePath"), Some("sheet.png"));
            assert!(root.children.is_empty());
        }

        #[test]
        fn parses_multiple_attributes_on_a_single_element() {
            let root =
                parse_xml_document("<sub x=\"10\" y=\"20\" width=\"32\" height=\"64\"/>").unwrap();
            let expected: BTreeMap<String, String> =
                [("x", "10"), ("y", "20"), ("width", "32"), ("height", "64")]
                    .iter()
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect();
            assert_eq!(attr_map(&root), expected);
        }

        #[test]
        fn accepts_both_single_and_double_quoted_attribute_values() {
            let root = parse_xml_document("<node a='single' b=\"double\"/>").unwrap();
            let expected: BTreeMap<String, String> = [("a", "single"), ("b", "double")]
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            assert_eq!(attr_map(&root), expected);
        }

        #[test]
        fn nests_children_under_their_parent_open_tag() {
            let xml = concat!(
                "<TextureAtlas imagePath=\"s.png\">",
                "<SubTexture name=\"a\" x=\"0\" y=\"0\"/>",
                "<SubTexture name=\"b\" x=\"8\" y=\"8\"/>",
                "</TextureAtlas>"
            );
            let root = parse_xml_document(xml).unwrap();
            assert_eq!(root.name, "TextureAtlas");
            assert_eq!(root.children.len(), 2);
            assert_eq!(root.children[0].name, "SubTexture");
            assert_eq!(root.children[0].get_attribute("name"), Some("a"));
            assert_eq!(root.children[1].get_attribute("name"), Some("b"));
        }

        #[test]
        fn treats_self_closing_tags_as_leaves_rather_than_opening_a_scope() {
            let xml = "<root><leaf/><sibling/></root>";
            let root = parse_xml_document(xml).unwrap();
            let names: Vec<&str> = root.children.iter().map(|c| c.name.as_str()).collect();
            assert_eq!(names, vec!["leaf", "sibling"]);
        }

        #[test]
        fn supports_deep_nesting_across_multiple_levels() {
            let xml = "<a><b><c value=\"deep\"/></b></a>";
            let root = parse_xml_document(xml).unwrap();
            assert_eq!(root.name, "a");
            let b = &root.children[0];
            assert_eq!(b.name, "b");
            let c = &b.children[0];
            assert_eq!(c.name, "c");
            assert_eq!(c.get_attribute("value"), Some("deep"));
        }

        #[test]
        fn returns_none_when_the_input_contains_no_recognizable_element() {
            assert!(parse_xml_document("").is_none());
            assert!(parse_xml_document("   just text, no tags   ").is_none());
        }

        #[test]
        fn tolerates_unbalanced_close_tags_without_underflowing_the_stack() {
            let root = parse_xml_document("<a></a></b>").unwrap();
            assert_eq!(root.name, "a");
        }

        #[test]
        fn returns_the_first_element_when_several_share_the_top_level() {
            let root = parse_xml_document("<first/><second/>").unwrap();
            assert_eq!(root.name, "first");
        }

        #[test]
        fn allows_dots_hyphens_and_underscores_in_tag_and_attribute_names() {
            let root = parse_xml_document("<my-tag.v2 data_key=\"x\"/>").unwrap();
            assert_eq!(root.name, "my-tag.v2");
            assert_eq!(root.get_attribute("data_key"), Some("x"));
        }

        #[test]
        fn strips_xml_comments() {
            let xml = "<root><!-- This is a comment --><child/></root>";
            let doc = parse_xml_document(xml).unwrap();
            assert_eq!(doc.children.len(), 1);
            assert_eq!(doc.children[0].name, "child");
        }

        #[test]
        fn strips_the_xml_declaration() {
            let xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><root/>";
            let doc = parse_xml_document(xml).unwrap();
            assert_eq!(doc.name, "root");
        }

        #[test]
        fn parses_text_content() {
            let xml = "<root><key>hello</key></root>";
            let doc = parse_xml_document(xml).unwrap();
            assert_eq!(doc.children[0].text, "hello");
        }

        #[test]
        fn strips_cdata_sections_to_raw_content() {
            let xml = "<root><![CDATA[<not a tag>]]></root>";
            let doc = parse_xml_document(xml).unwrap();
            assert_eq!(doc.name, "root");
        }

        #[test]
        fn strips_doctype() {
            let xml = "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\"><root/>";
            let doc = parse_xml_document(xml).unwrap();
            assert_eq!(doc.name, "root");
        }
    }
}
