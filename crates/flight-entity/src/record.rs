use std::collections::HashMap;

/// A TypeScript `Record<string, V>` / plain dictionary. Values retain insertion storage while
/// observable enumeration follows JavaScript property order: canonical integer-index keys first
/// in numeric order, then all other string keys in insertion order.
#[derive(Clone, Debug)]
pub struct Record<V> {
    storage: Vec<(String, V)>,
    index: HashMap<String, usize>,
}

/// Deletes one key and returns whether it was present.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn delete_record_value<V>(record: &mut Record<V>, key: &str) -> bool {
    let Some(position) = record.index.remove(key) else {
        return false;
    };
    record.storage.remove(position);
    for next in position..record.storage.len() {
        let shifted_key = &record.storage[next].0;
        record.index.insert(shifted_key.clone(), next);
    }
    return true;
}

/// Returns borrowed key/value pairs in JavaScript own-property enumeration order.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn entries<V>(record: &Record<V>) -> Vec<(&str, &V)> {
    return ordered_positions(record)
        .into_iter()
        .map(|position| {
            let (key, value) = &record.storage[position];
            (key.as_str(), value)
        })
        .collect();
}

/// Returns keys in JavaScript own-property enumeration order.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn get_record_keys<V>(record: &Record<V>) -> Vec<String> {
    return ordered_positions(record)
        .into_iter()
        .map(|position| record.storage[position].0.clone())
        .collect();
}

/// Returns the value stored for `key`, if present.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn get_record_value<'a, V>(record: &'a Record<V>, key: &str) -> Option<&'a V> {
    let position = *record.index.get(key)?;
    return record.storage.get(position).map(|(_, value)| value);
}

/// Returns whether `key` is present, independently of the stored value.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn has_record_key<V>(record: &Record<V>, key: &str) -> bool {
    return record.index.contains_key(key);
}

fn ordered_positions<V>(record: &Record<V>) -> Vec<usize> {
    let mut integer_indices: Vec<(u32, usize)> = Vec::new();
    let mut other_positions: Vec<usize> = Vec::new();
    for (position, (key, _)) in record.storage.iter().enumerate() {
        if let Some(index) = parse_javascript_integer_index(key) {
            integer_indices.push((index, position));
        } else {
            other_positions.push(position);
        }
    }
    integer_indices.sort_unstable_by_key(|(index, _)| *index);
    let mut positions = Vec::with_capacity(record.storage.len());
    positions.extend(integer_indices.into_iter().map(|(_, position)| position));
    positions.extend(other_positions);
    return positions;
}

fn parse_javascript_integer_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    let value = key.parse::<u32>().ok()?;
    if value == u32::MAX || value.to_string() != key {
        return None;
    }
    return Some(value);
}

/// Inserts or replaces one value. Replacing an existing key retains its insertion position.
// flight-lint: allow(conform-extra) Principal batch6 approved Record helper maps JavaScript dictionary operations rather than a Flight entity export
pub fn set_record_value<V>(record: &mut Record<V>, key: String, value: V) {
    if let Some(position) = record.index.get(&key).copied() {
        record.storage[position].1 = value;
        return;
    }
    let position = record.storage.len();
    record.index.insert(key.clone(), position);
    record.storage.push((key, value));
}

impl<V> Default for Record<V> {
    fn default() -> Self {
        return Self {
            storage: Vec::new(),
            index: HashMap::new(),
        };
    }
}
