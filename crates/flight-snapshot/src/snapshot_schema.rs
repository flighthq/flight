use std::collections::HashSet;

use crate::types::SnapshotSchema;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_an_omitted_schema_distinct_from_an_empty_one() {
        assert_eq!(compile_snapshot_schema(None), None);
        let empty: SnapshotSchema = Vec::new();
        assert_eq!(compile_snapshot_schema(Some(&empty)), Some(HashSet::new()));
        let listed: SnapshotSchema = vec!["players.0.health".to_string(), "x".to_string()];
        assert!(
            compile_snapshot_schema(Some(&listed))
                .unwrap()
                .contains("players.0.health")
        );
    }

    #[test]
    fn joins_dotted_paths_with_array_indices() {
        assert_eq!(get_snapshot_path("", "players"), "players");
        assert_eq!(get_snapshot_path("players", "0"), "players.0");
        assert_eq!(get_snapshot_path("players.0", "health"), "players.0.health");
    }
}

/// Compiles a schema to a set once per call. `None` (no schema: every numeric leaf interpolates)
/// stays distinct from an empty set (a schema listing nothing, so nothing interpolates).
pub(crate) fn compile_snapshot_schema(schema: Option<&SnapshotSchema>) -> Option<HashSet<String>> {
    return schema.map(|listed| listed.iter().cloned().collect());
}

/// Joins a container prefix and key into the dotted path a schema lists.
pub(crate) fn get_snapshot_path(prefix: &str, key: &str) -> String {
    return if prefix.is_empty() {
        key.to_string()
    } else {
        format!("{}.{}", prefix, key)
    };
}
