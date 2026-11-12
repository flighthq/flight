use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

pub type FieldOffsets = BTreeMap<String, BTreeMap<String, usize>>;

pub fn load_offsets(path: &Path) -> FieldOffsets {
    let content = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!(
            "warning: could not read offsets file {}: {e}",
            path.display()
        );
        String::from("{}")
    });
    parse_offsets_json(&content)
}

fn parse_offsets_json(json: &str) -> FieldOffsets {
    let mut result = FieldOffsets::new();
    let json = json.trim();
    let inner = json
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .unwrap_or("");

    for struct_entry in split_top_level(inner) {
        let struct_entry = struct_entry.trim();
        if struct_entry.is_empty() {
            continue;
        }
        let colon = match struct_entry.find(':') {
            Some(i) => i,
            None => continue,
        };
        let name = struct_entry[..colon].trim().trim_matches('"').to_string();
        let rest = struct_entry[colon + 1..].trim();
        let obj_inner = rest
            .strip_prefix('{')
            .and_then(|s| s.strip_suffix('}'))
            .unwrap_or("");

        let mut fields = BTreeMap::new();
        for kv in obj_inner.split(',') {
            let kv = kv.trim();
            if kv.is_empty() {
                continue;
            }
            let kv_colon = match kv.find(':') {
                Some(i) => i,
                None => continue,
            };
            let key = kv[..kv_colon].trim().trim_matches('"');
            if key.starts_with('_') {
                continue;
            }
            let val = kv[kv_colon + 1..].trim();
            if let Ok(n) = val.parse::<usize>() {
                fields.insert(key.to_string(), n);
            }
        }
        if !fields.is_empty() {
            result.insert(name, fields);
        }
    }
    result
}

fn split_top_level(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    for (i, c) in s.char_indices() {
        match c {
            '{' | '[' => depth += 1,
            '}' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < s.len() {
        parts.push(&s[start..]);
    }
    parts
}
