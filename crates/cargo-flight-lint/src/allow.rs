//! `// flight-lint: allow(rule, ...) reason` markers.
//!
//! An item marker sits in the comment/attribute block directly above an item (or on the
//! item's first line) and covers that item. A file marker,
//! `// flight-lint: allow-file(rule, ...) reason`, may appear anywhere and covers the file.
//! `// flight-lint: conform-skip(tsName, ...) reason` records TS exports intentionally absent
//! from Rust; it is read from the crate's `lib.rs`.

use std::path::Path;

use crate::model::{Violation, find_rule};

const PREFIX: &str = "flight-lint:";

#[derive(Clone, Debug, PartialEq)]
pub enum MarkerKind {
    Item,
    File,
    ConformSkip,
}

#[derive(Clone, Debug)]
pub struct Marker {
    pub kind: MarkerKind,
    pub names: Vec<String>,
    pub reason: String,
    pub line: usize,
}

pub struct FileAllows {
    lines: Vec<String>,
    pub markers: Vec<Marker>,
}

impl FileAllows {
    pub fn new(source: &str) -> FileAllows {
        let lines: Vec<String> = source.lines().map(|l| l.to_string()).collect();
        let mut markers = Vec::new();
        for (i, line) in lines.iter().enumerate() {
            if let Some(m) = parse_marker(line, i + 1) {
                markers.push(m);
            }
        }
        return FileAllows { lines, markers };
    }

    /// True when `rule` is allowed for the item whose keyword sits on any of `item_lines`.
    pub fn is_allowed(&self, rule: &str, item_lines: &[usize]) -> bool {
        if self
            .markers
            .iter()
            .any(|m| m.kind == MarkerKind::File && m.names.iter().any(|n| n == rule))
        {
            return true;
        }
        for &line in item_lines {
            let (start, end) = self.leading_block(line);
            if self.markers.iter().any(|m| {
                m.kind == MarkerKind::Item
                    && m.line >= start
                    && m.line <= end
                    && m.names.iter().any(|n| n == rule)
            }) {
                return true;
            }
        }
        return false;
    }

    /// Lines `[start, line]` covering the comment/attribute block directly above `line`.
    fn leading_block(&self, line: usize) -> (usize, usize) {
        let mut start = line;
        while start > 1 {
            let prev = self.lines.get(start - 2).map(|s| s.trim()).unwrap_or("");
            let is_lead = prev.starts_with("//")
                || prev.starts_with('#')
                || prev.starts_with(")]")
                || prev.starts_with(']');
            if !is_lead {
                break;
            }
            start -= 1;
        }
        return (start, line);
    }

    pub fn marker_violations(&self, path: &Path) -> Vec<Violation> {
        let mut out = Vec::new();
        for m in &self.markers {
            if m.reason.is_empty() {
                out.push(Violation::new(
                    path,
                    m.line,
                    "allow-reason",
                    format!("allow marker for `{}` has no reason", m.names.join(", ")),
                ));
            }
            if m.kind == MarkerKind::ConformSkip {
                continue;
            }
            for n in &m.names {
                if find_rule(n).is_none() {
                    out.push(Violation::new(
                        path,
                        m.line,
                        "allow-unknown-rule",
                        format!("allow marker names unknown rule `{}`", n),
                    ));
                }
            }
        }
        return out;
    }
}

pub fn parse_marker(line: &str, line_no: usize) -> Option<Marker> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with("//") {
        // Trailing comment on a code line.
        let idx = line.find("// ")?;
        return parse_marker(&line[idx..], line_no);
    }
    let body = trimmed
        .trim_start_matches('/')
        .trim_start_matches('!')
        .trim();
    let rest = body.strip_prefix(PREFIX)?.trim();
    let (kind, rest) = if let Some(r) = rest.strip_prefix("allow-file(") {
        (MarkerKind::File, r)
    } else if let Some(r) = rest.strip_prefix("allow(") {
        (MarkerKind::Item, r)
    } else if let Some(r) = rest.strip_prefix("conform-skip(") {
        (MarkerKind::ConformSkip, r)
    } else {
        return None;
    };
    let close = rest.find(')')?;
    let names: Vec<String> = rest[..close]
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let reason = rest[close + 1..]
        .trim()
        .trim_start_matches(['-', ':', '—'])
        .trim()
        .to_string();
    return Some(Marker {
        kind,
        names,
        reason,
        line: line_no,
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_item_and_file_markers() {
        let m = parse_marker(
            "    // flight-lint: allow(f64, hidden-state) robust predicate",
            3,
        )
        .unwrap();
        assert_eq!(m.kind, MarkerKind::Item);
        assert_eq!(m.names, vec!["f64", "hidden-state"]);
        assert_eq!(m.reason, "robust predicate");
        let f = parse_marker("//! flight-lint: allow-file(f64) — kernel precision", 1).unwrap();
        assert_eq!(f.kind, MarkerKind::File);
        assert_eq!(f.reason, "kernel precision");
        assert!(parse_marker("// ordinary comment", 1).is_none());
    }

    #[test]
    fn marker_covers_item_through_docs_and_attrs() {
        let src = "// flight-lint: allow(f64) precision\n/// Doc.\n#[inline]\npub fn f() {}\n\npub fn g() {}\n";
        let allows = FileAllows::new(src);
        assert!(allows.is_allowed("f64", &[4]));
        assert!(!allows.is_allowed("f64", &[6]));
        assert!(!allows.is_allowed("hidden-state", &[4]));
    }

    #[test]
    fn trailing_marker_on_item_line() {
        let allows = FileAllows::new(
            "static X: Mutex<u8> = Mutex::new(0); // flight-lint: allow(hidden-state) cache\n",
        );
        assert!(allows.is_allowed("hidden-state", &[1]));
    }

    #[test]
    fn missing_reason_is_reported() {
        let allows = FileAllows::new(
            "// flight-lint: allow(f64)\nfn f() {}\n// flight-lint: allow(nope) x\n",
        );
        let v = allows.marker_violations(Path::new("a.rs"));
        let rules: Vec<&str> = v.iter().map(|v| v.rule.as_str()).collect();
        assert_eq!(rules, vec!["allow-reason", "allow-unknown-rule"]);
    }
}
