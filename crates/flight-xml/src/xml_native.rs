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

pub fn get_xml_record_value<'a>(
    record: &'a XmlRecord<String, String>,
    key: &str,
) -> Option<&'a str> {
    return record.get(key).map(String::as_str);
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
