//! flight-compiler: target-native
//!
//! Rust strings are UTF-8 indexed while JavaScript strings are UTF-16 indexed, and Rust's
//! `HashMap` has no observable order while a JavaScript record does. The parser algorithm stays in
//! `xml_parse`; this module is only the representation adapter at those two target boundaries.

use std::borrow::Borrow;
use std::collections::HashMap as RustHashMap;
use std::hash::Hash;
use std::ops::Index;

use flight_entity::Ref;

use crate::types::{XmlContent, XmlElement};

/// Rust-only `XmlRecord` map-sugar parity tests.
#[cfg(test)]
mod xml_record_sugar_tests {
    use super::*;

    fn record(entries: &[(&str, &str)]) -> XmlRecord<String, String> {
        let mut out = create_xml_record();
        for (key, value) in entries {
            set_xml_record_value(&mut out, key.to_string(), value.to_string());
        }
        return out;
    }

    fn hash_map(entries: &[(&str, &str)]) -> RustHashMap<String, String> {
        return entries
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
    }

    #[test]
    fn contains_key_reports_present_and_missing_keys_and_tracks_insertion() {
        let mut attributes = record(&[("a", "1")]);
        assert!(attributes.contains_key("a"));
        assert!(!attributes.contains_key("b"));
        attributes.insert("b".to_string(), "2".to_string());
        assert!(attributes.contains_key("b"));
    }

    #[test]
    fn get_returns_the_current_value_and_none_for_a_missing_key() {
        let mut attributes = record(&[("a", "1"), ("b", "2")]);
        assert_eq!(attributes.get("a"), Some(&"1".to_string()));
        assert_eq!(attributes.get("b"), Some(&"2".to_string()));
        assert_eq!(attributes.get("missing"), None);
        attributes.insert("a".to_string(), "updated".to_string());
        assert_eq!(attributes.get("a"), Some(&"updated".to_string()));
    }

    #[test]
    fn index_returns_the_value_for_a_present_key() {
        let attributes = record(&[("a", "1"), ("b", "2")]);
        assert_eq!(attributes["a"], "1");
        assert_eq!(attributes["b"], "2");
    }

    #[test]
    #[should_panic(expected = "XML attribute key is absent")]
    fn index_panics_for_a_missing_key() {
        let attributes = record(&[("a", "1")]);
        let _ = &attributes["missing"];
    }

    #[test]
    fn insert_appends_a_new_key_and_replaces_an_existing_value_in_place() {
        let mut attributes = create_xml_record();
        assert_eq!(
            attributes.insert("z".to_string(), "first".to_string()),
            None
        );
        assert_eq!(
            attributes.insert("a".to_string(), "second".to_string()),
            None
        );
        assert_eq!(
            attributes.insert("z".to_string(), "updated".to_string()),
            Some("first".to_string())
        );
        assert_eq!(attributes.len(), 2);
        let keys: Vec<&String> = attributes.keys().collect();
        assert_eq!(keys, vec![&"z".to_string(), &"a".to_string()]);
        assert_eq!(attributes["z"], "updated");
    }

    #[test]
    fn is_empty_and_len_track_new_keys_but_not_overwrites() {
        let mut attributes = create_xml_record();
        assert!(attributes.is_empty());
        assert_eq!(attributes.len(), 0);
        attributes.insert("a".to_string(), "1".to_string());
        assert!(!attributes.is_empty());
        assert_eq!(attributes.len(), 1);
        attributes.insert("a".to_string(), "2".to_string());
        assert_eq!(attributes.len(), 1);
        attributes.insert("b".to_string(), "3".to_string());
        assert_eq!(attributes.len(), 2);
    }

    #[test]
    fn keys_enumerate_in_first_insertion_order() {
        let empty = create_xml_record();
        assert_eq!(empty.keys().count(), 0);
        let attributes = record(&[("z", "1"), ("a", "2"), ("m", "3"), ("a", "4")]);
        let keys: Vec<&String> = attributes.keys().collect();
        assert_eq!(
            keys,
            vec![&"z".to_string(), &"a".to_string(), &"m".to_string()]
        );
    }

    #[test]
    fn record_equality_ignores_insertion_order_and_compares_every_entry() {
        let attributes = record(&[("a", "1"), ("b", "2")]);
        assert!(attributes == record(&[("b", "2"), ("a", "1")]));
        assert!(record(&[]) == record(&[]));
        assert!(attributes != record(&[("a", "1"), ("b", "other")]));
        assert!(attributes != record(&[("a", "1"), ("c", "2")]));
        assert!(attributes != record(&[("a", "1")]));
        assert!(attributes != record(&[("a", "1"), ("b", "2"), ("c", "3")]));
    }

    #[test]
    fn record_equality_follows_mutation() {
        let mut attributes = record(&[("a", "1")]);
        let other = record(&[("a", "2")]);
        assert!(attributes != other);
        attributes.insert("a".to_string(), "2".to_string());
        assert!(attributes == other);
        attributes.insert("b".to_string(), "3".to_string());
        assert!(attributes != other);
    }

    #[test]
    fn record_equals_hash_map_with_the_same_entries_only() {
        let attributes = record(&[("a", "1"), ("b", "2")]);
        assert!(attributes == hash_map(&[("b", "2"), ("a", "1")]));
        assert!(record(&[]) == hash_map(&[]));
        assert!(attributes != hash_map(&[("a", "1"), ("b", "other")]));
        assert!(attributes != hash_map(&[("a", "1"), ("c", "2")]));
        assert!(attributes != hash_map(&[("a", "1")]));
        assert!(attributes != hash_map(&[("a", "1"), ("b", "2"), ("c", "3")]));
    }

    #[test]
    fn record_equality_with_a_hash_map_follows_mutation() {
        let mut attributes = record(&[("a", "1")]);
        let other = hash_map(&[("a", "1"), ("b", "2")]);
        assert!(attributes != other);
        attributes.insert("b".to_string(), "2".to_string());
        assert!(attributes == other);
        attributes.insert("b".to_string(), "changed".to_string());
        assert!(attributes != other);
    }
}

const MAX_XML_ENTITY_PASSES: usize = 8;
const MAX_XML_ENTITY_GROWTH: usize = 16;
const MAX_XML_ENTITY_BUDGET: usize = 65536;

pub struct XmlScanner {
    units: Vec<u16>,
}

/// An insertion-preserving Rust twin of a JavaScript record.
///
/// Rust consumers retain their familiar map operations while TypeScript aliases this to `Record`.
#[derive(Clone, Debug)]
pub struct XmlRecord<K, V> {
    index: RustHashMap<K, usize>,
    storage: Vec<(K, V)>,
}

pub fn create_xml_record() -> XmlRecord<String, String> {
    return XmlRecord::default();
}

pub fn create_xml_scanner(value: &str) -> XmlScanner {
    return XmlScanner {
        units: value.encode_utf16().collect(),
    };
}

#[allow(clippy::manual_range_contains)]
fn ascii_case_insensitive_at(scanner: &XmlScanner, start: usize, expected: &str) -> bool {
    let expected_scanner = create_xml_scanner(expected);
    let expected_len = xml_scanner_length(&expected_scanner);
    if start + expected_len > xml_scanner_length(scanner) {
        return false;
    }
    let mut index = 0;
    while index < expected_len {
        let mut actual = xml_scanner_unit_at(scanner, start + index);
        if actual >= 65 && actual <= 90 {
            actual += 32;
        }
        if actual != xml_scanner_unit_at(&expected_scanner, index) {
            return false;
        }
        index += 1;
    }
    return true;
}

fn collect_xml_entity_declarations_native(doctype: &str, out: &mut XmlRecord<String, String>) {
    let scanner = create_xml_scanner(doctype);
    let len = xml_scanner_length(&scanner);
    let mut pos = 0;
    while pos + 8 <= len {
        if !xml_scanner_starts_with(&scanner, pos, "<!ENTITY") {
            pos += 1;
            continue;
        }
        pos += 8;
        let whitespace_start = pos;
        while pos < len && xml_is_whitespace(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos == whitespace_start {
            continue;
        }
        let name_start = pos;
        while pos < len && is_name_char(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos == name_start {
            continue;
        }
        let name = xml_utf16_slice(doctype, name_start, pos);
        while pos < len && xml_is_whitespace(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let quote = xml_scanner_unit_at(&scanner, pos);
        if quote != 34 && quote != 39 {
            continue;
        }
        pos += 1;
        let value_start = pos;
        while pos < len && xml_scanner_unit_at(&scanner, pos) != quote {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let value = xml_utf16_slice(doctype, value_start, pos);
        pos += 1;
        while pos < len && xml_is_whitespace(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos < len && xml_scanner_unit_at(&scanner, pos) == 62 {
            set_xml_record_value(out, name, value);
            pos += 1;
        }
    }
}

fn contains_xml_record_key<K, V, Q>(record: &XmlRecord<K, V>, key: &Q) -> bool
where
    K: Borrow<Q> + Eq + Hash,
    Q: Eq + Hash + ?Sized,
{
    return record.index.contains_key(key);
}

pub fn decode_xml_entities_native(source: &str) -> String {
    let scanner = create_xml_scanner(source);
    let len = xml_scanner_length(&scanner);
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;

    while pos < len {
        if xml_scanner_unit_at(&scanner, pos) != 38 {
            pos += 1;
            continue;
        }
        let amp_pos = pos;
        pos += 1;
        if pos >= len {
            break;
        }

        if xml_scanner_unit_at(&scanner, pos) == 35 {
            pos += 1;
            let is_hex = pos < len && xml_scanner_unit_at(&scanner, pos) == 120;
            if is_hex {
                pos += 1;
            }
            let number_start = pos;
            if is_hex {
                while pos < len && is_hex_digit(xml_scanner_unit_at(&scanner, pos)) {
                    pos += 1;
                }
            } else {
                while pos < len && is_decimal_digit(xml_scanner_unit_at(&scanner, pos)) {
                    pos += 1;
                }
            }
            if pos > number_start && pos < len && xml_scanner_unit_at(&scanner, pos) == 59 {
                let radix = if is_hex { 16 } else { 10 };
                if let Some(code_point) = parse_code_point(&scanner, number_start, pos, radix)
                    && let Some(replacement) = xml_string_from_code_point(code_point)
                {
                    result += &xml_utf16_slice(source, copy_start, amp_pos);
                    result += &replacement;
                    pos += 1;
                    copy_start = pos;
                    continue;
                }
                pos += 1;
                continue;
            }
            continue;
        }

        let name_start = pos;
        while pos < len && is_word_char(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos > name_start && pos < len && xml_scanner_unit_at(&scanner, pos) == 59 {
            let name = xml_utf16_slice(source, name_start, pos);
            if let Some(replacement) = xml_entity_replacement(&name) {
                result += &xml_utf16_slice(source, copy_start, amp_pos);
                result += replacement;
                pos += 1;
                copy_start = pos;
                continue;
            }
            pos += 1;
        }
    }

    result += &xml_utf16_slice(source, copy_start, len);
    return result;
}

fn equals_xml_record_and_hash_map<V>(
    record: &XmlRecord<String, V>,
    other: &RustHashMap<String, V>,
) -> bool
where
    V: PartialEq,
{
    if record.len() != other.len() {
        return false;
    }
    return record
        .storage
        .iter()
        .all(|(key, value)| other.get(key) == Some(value));
}

fn equals_xml_records<K, V>(record: &XmlRecord<K, V>, other: &XmlRecord<K, V>) -> bool
where
    K: Clone + Eq + Hash,
    V: PartialEq,
{
    if record.len() != other.len() {
        return false;
    }
    return record
        .storage
        .iter()
        .all(|(key, value)| other.get(key) == Some(value));
}

pub fn expand_xml_entities_native(source: &str, entities: &XmlRecord<String, String>) -> String {
    if xml_record_is_empty(entities) {
        return source.to_string();
    }
    let mut output = source.to_string();
    let budget = xml_scanner_length(&create_xml_scanner(source)) * MAX_XML_ENTITY_GROWTH
        + MAX_XML_ENTITY_BUDGET;
    let mut pass = 0;
    while pass < MAX_XML_ENTITY_PASSES {
        let next = replace_entity_references_native(&output, entities);
        if next == output || xml_scanner_length(&create_xml_scanner(&next)) > budget {
            return output;
        }
        output = next;
        pass += 1;
    }
    return output;
}

fn find_xml_record_value<'a, K, V, Q>(record: &'a XmlRecord<K, V>, key: &Q) -> Option<&'a V>
where
    K: Borrow<Q> + Eq + Hash,
    Q: Eq + Hash + ?Sized,
{
    let position = *record.index.get(key)?;
    return record.storage.get(position).map(|(_, value)| value);
}

fn get_xml_record_keys<K, V>(record: &XmlRecord<K, V>) -> impl Iterator<Item = &K> {
    return record.storage.iter().map(|(key, _)| key);
}

fn get_xml_record_length<K, V>(record: &XmlRecord<K, V>) -> usize {
    return record.storage.len();
}

pub fn get_xml_record_value<'a>(
    record: &'a XmlRecord<String, String>,
    key: &str,
) -> Option<&'a str> {
    return record.get(key).map(String::as_str);
}

fn insert_xml_record_value<K, V>(record: &mut XmlRecord<K, V>, key: K, value: V) -> Option<V>
where
    K: Clone + Eq + Hash,
{
    if let Some(position) = record.index.get(&key).copied() {
        return Some(std::mem::replace(&mut record.storage[position].1, value));
    }
    let position = record.storage.len();
    record.index.insert(key.clone(), position);
    record.storage.push((key, value));
    return None;
}

#[allow(clippy::manual_range_contains)]
fn is_decimal_digit(unit: u16) -> bool {
    return unit >= 48 && unit <= 57;
}

#[allow(clippy::manual_range_contains)]
fn is_hex_digit(unit: u16) -> bool {
    return is_decimal_digit(unit) || (unit >= 65 && unit <= 70) || (unit >= 97 && unit <= 102);
}

#[allow(clippy::manual_range_contains)]
fn is_name_char(unit: u16) -> bool {
    return (unit >= 48 && unit <= 57)
        || (unit >= 65 && unit <= 90)
        || (unit >= 97 && unit <= 122)
        || unit == 95
        || unit == 58
        || unit == 46
        || unit == 45;
}

#[allow(clippy::manual_range_contains)]
fn is_word_char(unit: u16) -> bool {
    return (unit >= 48 && unit <= 57)
        || (unit >= 65 && unit <= 90)
        || (unit >= 97 && unit <= 122)
        || unit == 95;
}

fn normalize_xml_line_endings_native(xml: &str) -> String {
    let scanner = create_xml_scanner(xml);
    let len = xml_scanner_length(&scanner);
    let mut output = String::new();
    let mut position = 0;
    let mut copy_start = 0;
    while position < len {
        if xml_scanner_unit_at(&scanner, position) != 13 {
            position += 1;
            continue;
        }
        output += &xml_utf16_slice(xml, copy_start, position);
        output += "\n";
        position += 1;
        if position < len && xml_scanner_unit_at(&scanner, position) == 10 {
            position += 1;
        }
        copy_start = position;
    }
    output += &xml_utf16_slice(xml, copy_start, len);
    return output;
}

#[allow(clippy::manual_range_contains)]
fn parse_code_point(scanner: &XmlScanner, start: usize, end: usize, radix: u32) -> Option<u32> {
    let mut value: u32 = 0;
    let mut position = start;
    while position < end {
        let unit = xml_scanner_unit_at(scanner, position);
        let digit: u32;
        if unit >= 48 && unit <= 57 {
            digit = (unit - 48) as u32;
        } else if unit >= 65 && unit <= 70 {
            digit = (unit - 65 + 10) as u32;
        } else if unit >= 97 && unit <= 102 {
            digit = (unit - 97 + 10) as u32;
        } else {
            return None;
        }
        if digit >= radix || value > 0x10ffff / radix {
            return None;
        }
        value = value * radix + digit;
        if value > 0x10ffff {
            return None;
        }
        position += 1;
    }
    return Some(value);
}

pub fn parse_xml_attributes_native(attrs: &str) -> XmlRecord<String, String> {
    let scanner = create_xml_scanner(attrs);
    let len = xml_scanner_length(&scanner);
    let mut result = create_xml_record();
    let mut pos = 0;

    while pos < len {
        while pos < len && !is_name_char(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let name_start = pos;
        while pos < len && is_name_char(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        let name = xml_utf16_slice(attrs, name_start, pos);
        while pos < len && xml_is_whitespace(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos >= len || xml_scanner_unit_at(&scanner, pos) != 61 {
            continue;
        }
        pos += 1;
        while pos < len && xml_is_whitespace(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos >= len {
            break;
        }
        let quote = xml_scanner_unit_at(&scanner, pos);
        if quote != 34 && quote != 39 {
            continue;
        }
        pos += 1;
        let value_start = pos;
        while pos < len && xml_scanner_unit_at(&scanner, pos) != quote {
            pos += 1;
        }
        let value = xml_utf16_slice(attrs, value_start, pos);
        if pos < len {
            pos += 1;
        }
        set_xml_record_value(&mut result, name, decode_xml_entities_native(&value));
    }
    return result;
}

pub fn parse_xml_number_native(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Some(0.0);
    }
    if trimmed == "Infinity" || trimmed == "+Infinity" {
        return Some(f64::INFINITY);
    }
    if trimmed == "-Infinity" {
        return Some(f64::NEG_INFINITY);
    }
    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        return u64::from_str_radix(hex, 16)
            .ok()
            .map(|number| number as f64);
    }
    if let Some(binary) = trimmed
        .strip_prefix("0b")
        .or_else(|| trimmed.strip_prefix("0B"))
    {
        return u64::from_str_radix(binary, 2)
            .ok()
            .map(|number| number as f64);
    }
    if let Some(octal) = trimmed
        .strip_prefix("0o")
        .or_else(|| trimmed.strip_prefix("0O"))
    {
        return u64::from_str_radix(octal, 8)
            .ok()
            .map(|number| number as f64);
    }
    return trimmed.parse::<f64>().ok();
}

pub fn prepare_xml_document_native(xml: &str, entities: &mut XmlRecord<String, String>) -> String {
    let source = strip_xml_comments_native(xml);
    let source = normalize_xml_line_endings_native(&source);
    let source = strip_processing_instructions_native(&source);
    return strip_xml_doctypes_native(&source, entities);
}

pub fn push_xml_element_content(out: &mut Vec<XmlContent>, value: Ref<XmlElement>) {
    out.push(XmlContent::Element(value));
}

pub fn push_xml_text_content(out: &mut Vec<XmlContent>, value: String) {
    out.push(XmlContent::Text(value));
}

fn replace_entity_references_native(source: &str, entities: &XmlRecord<String, String>) -> String {
    let scanner = create_xml_scanner(source);
    let len = xml_scanner_length(&scanner);
    let mut result = String::new();
    let mut pos = 0;
    let mut copy_start = 0;
    while pos < len {
        if xml_scanner_unit_at(&scanner, pos) != 38 {
            pos += 1;
            continue;
        }
        let amp_pos = pos;
        pos += 1;
        let name_start = pos;
        while pos < len && is_name_char(xml_scanner_unit_at(&scanner, pos)) {
            pos += 1;
        }
        if pos > name_start && pos < len && xml_scanner_unit_at(&scanner, pos) == 59 {
            let name = xml_utf16_slice(source, name_start, pos);
            if let Some(replacement) = get_xml_record_value(entities, &name) {
                result += &xml_utf16_slice(source, copy_start, amp_pos);
                result += replacement;
                pos += 1;
                copy_start = pos;
                continue;
            }
            pos += 1;
        }
    }
    result += &xml_utf16_slice(source, copy_start, len);
    return result;
}

pub fn set_xml_record_value(record: &mut XmlRecord<String, String>, key: String, value: String) {
    record.insert(key, value);
}

fn strip_processing_instructions_native(xml: &str) -> String {
    let scanner = create_xml_scanner(xml);
    let len = xml_scanner_length(&scanner);
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;
    while pos < len {
        if xml_scanner_starts_with(&scanner, pos, "<?") {
            output += &xml_utf16_slice(xml, copy_start, pos);
            pos += 2;
            pos = xml_scanner_find(&scanner, "?>", pos).map_or(len, |end| end + 2);
            copy_start = pos;
        } else {
            pos += 1;
        }
    }
    output += &xml_utf16_slice(xml, copy_start, len);
    return output;
}

fn strip_xml_comments_native(xml: &str) -> String {
    let scanner = create_xml_scanner(xml);
    let len = xml_scanner_length(&scanner);
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;
    while pos < len {
        if xml_scanner_starts_with(&scanner, pos, "<![CDATA[") {
            pos = xml_scanner_find(&scanner, "]]>", pos + 9).map_or(len, |end| end + 3);
            continue;
        }
        if xml_scanner_starts_with(&scanner, pos, "<!--") {
            output += &xml_utf16_slice(xml, copy_start, pos);
            pos = xml_scanner_find(&scanner, "-->", pos + 4).map_or(len, |end| end + 3);
            copy_start = pos;
            continue;
        }
        pos += 1;
    }
    output += &xml_utf16_slice(xml, copy_start, len);
    return output;
}

fn strip_xml_doctypes_native(xml: &str, out: &mut XmlRecord<String, String>) -> String {
    let scanner = create_xml_scanner(xml);
    let len = xml_scanner_length(&scanner);
    let mut output = String::new();
    let mut pos = 0;
    let mut copy_start = 0;
    while pos < len {
        if xml_scanner_unit_at(&scanner, pos) != 60
            || !ascii_case_insensitive_at(&scanner, pos, "<!doctype")
        {
            pos += 1;
            continue;
        }
        output += &xml_utf16_slice(xml, copy_start, pos);
        let doctype_start = pos;
        pos += 9;
        let mut internal_subset_depth = 0;
        let mut quote = 0;
        while pos < len {
            let unit = xml_scanner_unit_at(&scanner, pos);
            if quote != 0 {
                if unit == quote {
                    quote = 0;
                }
            } else if unit == 34 || unit == 39 {
                quote = unit;
            } else if unit == 91 {
                internal_subset_depth += 1;
            } else if unit == 93 && internal_subset_depth > 0 {
                internal_subset_depth -= 1;
            } else if unit == 62 && internal_subset_depth == 0 {
                pos += 1;
                break;
            }
            pos += 1;
        }
        collect_xml_entity_declarations_native(&xml_utf16_slice(xml, doctype_start, pos), out);
        copy_start = pos;
    }
    output += &xml_utf16_slice(xml, copy_start, len);
    return output;
}

fn xml_entity_replacement(name: &str) -> Option<&'static str> {
    if name == "amp" {
        return Some("&");
    }
    if name == "apos" {
        return Some("'");
    }
    if name == "gt" {
        return Some(">");
    }
    if name == "lt" {
        return Some("<");
    }
    if name == "quot" {
        return Some("\"");
    }
    return None;
}

pub fn xml_is_whitespace(unit: u16) -> bool {
    if unit == 0xfeff {
        return true;
    }
    return char::from_u32(unit as u32).is_some_and(char::is_whitespace);
}

pub fn xml_record_is_empty(record: &XmlRecord<String, String>) -> bool {
    return record.is_empty();
}

pub fn xml_scanner_find(scanner: &XmlScanner, pattern: &str, start: usize) -> Option<usize> {
    let pattern_units: Vec<u16> = pattern.encode_utf16().collect();
    if pattern_units.is_empty() {
        return Some(start);
    }
    let mut position = start;
    while position + pattern_units.len() <= scanner.units.len() {
        if scanner.units[position..position + pattern_units.len()] == pattern_units {
            return Some(position);
        }
        position += 1;
    }
    return None;
}

pub fn xml_scanner_length(scanner: &XmlScanner) -> usize {
    return scanner.units.len();
}

pub fn xml_scanner_starts_with(scanner: &XmlScanner, start: usize, pattern: &str) -> bool {
    let pattern_units: Vec<u16> = pattern.encode_utf16().collect();
    if start + pattern_units.len() > scanner.units.len() {
        return false;
    }
    return scanner.units[start..start + pattern_units.len()] == pattern_units;
}

pub fn xml_scanner_unit_at(scanner: &XmlScanner, position: usize) -> u16 {
    return scanner.units[position];
}

pub fn xml_string_from_code_point(code_point: u32) -> Option<String> {
    return char::from_u32(code_point).map(|character| character.to_string());
}

pub fn xml_trim(value: &str) -> String {
    return value
        .trim_matches(|character: char| character == '\u{feff}' || character.is_whitespace())
        .to_string();
}

pub fn xml_utf16_slice(value: &str, start: usize, end: usize) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    return String::from_utf16_lossy(&units[start..end]);
}

impl<K, V> XmlRecord<K, V>
where
    K: Clone + Eq + Hash,
{
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Borrow<Q>,
        Q: Eq + Hash + ?Sized,
    {
        return contains_xml_record_key(self, key);
    }

    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
        Q: Eq + Hash + ?Sized,
    {
        return find_xml_record_value(self, key);
    }

    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        return insert_xml_record_value(self, key, value);
    }

    pub fn is_empty(&self) -> bool {
        return get_xml_record_length(self) == 0;
    }

    pub fn keys(&self) -> impl Iterator<Item = &K> {
        return get_xml_record_keys(self);
    }

    pub fn len(&self) -> usize {
        return get_xml_record_length(self);
    }
}

impl<K, V> Default for XmlRecord<K, V> {
    fn default() -> Self {
        return Self {
            index: RustHashMap::new(),
            storage: Vec::new(),
        };
    }
}

impl<V> Index<&str> for XmlRecord<String, V> {
    type Output = V;

    fn index(&self, key: &str) -> &Self::Output {
        return find_xml_record_value(self, key).expect("XML attribute key is absent");
    }
}

impl<K, V> PartialEq for XmlRecord<K, V>
where
    K: Clone + Eq + Hash,
    V: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        return equals_xml_records(self, other);
    }
}

impl<V> PartialEq<RustHashMap<String, V>> for XmlRecord<String, V>
where
    V: PartialEq,
{
    fn eq(&self, other: &RustHashMap<String, V>) -> bool {
        return equals_xml_record_and_hash_map(self, other);
    }
}
