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

impl<K, V> XmlRecord<K, V>
where
    K: Clone + Eq + Hash,
{
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        K: Borrow<Q>,
        Q: Eq + Hash + ?Sized,
    {
        return self.index.contains_key(key);
    }

    pub fn get<Q>(&self, key: &Q) -> Option<&V>
    where
        K: Borrow<Q>,
        Q: Eq + Hash + ?Sized,
    {
        let position = *self.index.get(key)?;
        return self.storage.get(position).map(|(_, value)| value);
    }

    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        if let Some(position) = self.index.get(&key).copied() {
            return Some(std::mem::replace(&mut self.storage[position].1, value));
        }
        let position = self.storage.len();
        self.index.insert(key.clone(), position);
        self.storage.push((key, value));
        return None;
    }

    pub fn is_empty(&self) -> bool {
        return self.storage.is_empty();
    }

    pub fn len(&self) -> usize {
        return self.storage.len();
    }

    pub fn keys(&self) -> impl Iterator<Item = &K> {
        return self.storage.iter().map(|(key, _)| key);
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
        return self.get(key).expect("XML attribute key is absent");
    }
}

impl<K, V> PartialEq for XmlRecord<K, V>
where
    K: Clone + Eq + Hash,
    V: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        if self.len() != other.len() {
            return false;
        }
        return self
            .storage
            .iter()
            .all(|(key, value)| other.get(key) == Some(value));
    }
}

impl<V> PartialEq<RustHashMap<String, V>> for XmlRecord<String, V>
where
    V: PartialEq,
{
    fn eq(&self, other: &RustHashMap<String, V>) -> bool {
        if self.len() != other.len() {
            return false;
        }
        return self
            .storage
            .iter()
            .all(|(key, value)| other.get(key) == Some(value));
    }
}

pub fn create_xml_record() -> XmlRecord<String, String> {
    return XmlRecord::default();
}

pub fn create_xml_scanner(value: &str) -> XmlScanner {
    return XmlScanner {
        units: value.encode_utf16().collect(),
    };
}

pub fn get_xml_record_value<'a>(
    record: &'a XmlRecord<String, String>,
    key: &str,
) -> Option<&'a str> {
    return record.get(key).map(String::as_str);
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

#[allow(clippy::manual_range_contains)]
fn is_decimal_digit(unit: u16) -> bool {
    return unit >= 48 && unit <= 57;
}

#[allow(clippy::manual_range_contains)]
fn is_hex_digit(unit: u16) -> bool {
    return is_decimal_digit(unit) || (unit >= 65 && unit <= 70) || (unit >= 97 && unit <= 102);
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

pub fn prepare_xml_document_native(xml: &str, entities: &mut XmlRecord<String, String>) -> String {
    let source = strip_xml_comments_native(xml);
    let source = normalize_xml_line_endings_native(&source);
    let source = strip_processing_instructions_native(&source);
    return strip_xml_doctypes_native(&source, entities);
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

pub fn set_xml_record_value(record: &mut XmlRecord<String, String>, key: String, value: String) {
    record.insert(key, value);
}

pub fn xml_record_is_empty(record: &XmlRecord<String, String>) -> bool {
    return record.is_empty();
}

pub fn xml_utf16_slice(value: &str, start: usize, end: usize) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    return String::from_utf16_lossy(&units[start..end]);
}

pub fn xml_is_whitespace(unit: u16) -> bool {
    if unit == 0xfeff {
        return true;
    }
    return char::from_u32(unit as u32).is_some_and(char::is_whitespace);
}

pub fn xml_trim(value: &str) -> String {
    return value
        .trim_matches(|character: char| character == '\u{feff}' || character.is_whitespace())
        .to_string();
}

pub fn xml_string_from_code_point(code_point: u32) -> Option<String> {
    return char::from_u32(code_point).map(|character| character.to_string());
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

pub fn push_xml_text_content(out: &mut Vec<XmlContent>, value: String) {
    out.push(XmlContent::Text(value));
}

pub fn push_xml_element_content(out: &mut Vec<XmlContent>, value: Ref<XmlElement>) {
    out.push(XmlContent::Element(value));
}
