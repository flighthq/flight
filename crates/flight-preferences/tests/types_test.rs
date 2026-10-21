use flight_preferences::*;

mod get_storage_clear_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_clear_failure_reason_string(StorageClearFailureReason::ClearFailed), "clear-failed");
        assert_eq!(get_storage_clear_failure_reason_string(StorageClearFailureReason::QuotaExceeded), "quota-exceeded");
        assert_eq!(get_storage_clear_failure_reason_string(StorageClearFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_clear_failure_reason_string(StorageClearFailureReason::SecurityDenied), "security-denied");
    }
}

mod get_storage_clear_namespace_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::QuotaExceeded), "quota-exceeded");
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::RemoveFailed), "remove-failed");
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_clear_namespace_failure_reason_string(StorageClearNamespaceFailureReason::SecurityDenied), "security-denied");
    }
}

mod get_storage_get_item_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_get_item_failure_reason_string(StorageGetItemFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_get_item_failure_reason_string(StorageGetItemFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_get_item_failure_reason_string(StorageGetItemFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_get_item_failure_reason_string(StorageGetItemFailureReason::SecurityDenied), "security-denied");
    }
}

mod get_storage_migration_read_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::SecurityDenied), "security-denied");
        assert_eq!(get_storage_migration_read_failure_reason_string(StorageMigrationReadFailureReason::VersionParseFailed), "version-parse-failed");
    }
}

mod get_storage_read_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_read_failure_reason_string(StorageReadFailureReason::ParseFailed), "parse-failed");
        assert_eq!(get_storage_read_failure_reason_string(StorageReadFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_read_failure_reason_string(StorageReadFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_read_failure_reason_string(StorageReadFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_read_failure_reason_string(StorageReadFailureReason::SecurityDenied), "security-denied");
    }
}

mod get_storage_remove_item_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::QuotaExceeded), "quota-exceeded");
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::RemoveFailed), "remove-failed");
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_remove_item_failure_reason_string(StorageRemoveItemFailureReason::SecurityDenied), "security-denied");
    }
}

mod get_storage_set_item_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::QuotaExceeded), "quota-exceeded");
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::SecurityDenied), "security-denied");
        assert_eq!(get_storage_set_item_failure_reason_string(StorageSetItemFailureReason::WriteFailed), "write-failed");
    }
}

mod get_storage_write_failure_reason_string {
    use super::*;

    #[test]
    fn maps_all_variants() {
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::PersistenceInvalid), "persistence-invalid");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::QuotaExceeded), "quota-exceeded");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::ReadFailed), "read-failed");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::RuntimeUnavailable), "runtime-unavailable");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::SecurityDenied), "security-denied");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::SerializationFailed), "serialization-failed");
        assert_eq!(get_storage_write_failure_reason_string(StorageWriteFailureReason::WriteFailed), "write-failed");
    }
}

mod parse_storage_clear_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_clear_failure_reason("clear-failed"), Some(StorageClearFailureReason::ClearFailed));
        assert_eq!(parse_storage_clear_failure_reason("quota-exceeded"), Some(StorageClearFailureReason::QuotaExceeded));
        assert_eq!(parse_storage_clear_failure_reason("runtime-unavailable"), Some(StorageClearFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_clear_failure_reason("security-denied"), Some(StorageClearFailureReason::SecurityDenied));
        assert_eq!(parse_storage_clear_failure_reason("unknown"), None);
    }
}

mod parse_storage_clear_namespace_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_clear_namespace_failure_reason("persistence-invalid"), Some(StorageClearNamespaceFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_clear_namespace_failure_reason("quota-exceeded"), Some(StorageClearNamespaceFailureReason::QuotaExceeded));
        assert_eq!(parse_storage_clear_namespace_failure_reason("read-failed"), Some(StorageClearNamespaceFailureReason::ReadFailed));
        assert_eq!(parse_storage_clear_namespace_failure_reason("remove-failed"), Some(StorageClearNamespaceFailureReason::RemoveFailed));
        assert_eq!(parse_storage_clear_namespace_failure_reason("runtime-unavailable"), Some(StorageClearNamespaceFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_clear_namespace_failure_reason("security-denied"), Some(StorageClearNamespaceFailureReason::SecurityDenied));
        assert_eq!(parse_storage_clear_namespace_failure_reason("unknown"), None);
    }
}

mod parse_storage_get_item_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_get_item_failure_reason("persistence-invalid"), Some(StorageGetItemFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_get_item_failure_reason("read-failed"), Some(StorageGetItemFailureReason::ReadFailed));
        assert_eq!(parse_storage_get_item_failure_reason("runtime-unavailable"), Some(StorageGetItemFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_get_item_failure_reason("security-denied"), Some(StorageGetItemFailureReason::SecurityDenied));
        assert_eq!(parse_storage_get_item_failure_reason("unknown"), None);
    }
}

mod parse_storage_migration_read_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_migration_read_failure_reason("persistence-invalid"), Some(StorageMigrationReadFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_migration_read_failure_reason("read-failed"), Some(StorageMigrationReadFailureReason::ReadFailed));
        assert_eq!(parse_storage_migration_read_failure_reason("runtime-unavailable"), Some(StorageMigrationReadFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_migration_read_failure_reason("security-denied"), Some(StorageMigrationReadFailureReason::SecurityDenied));
        assert_eq!(parse_storage_migration_read_failure_reason("version-parse-failed"), Some(StorageMigrationReadFailureReason::VersionParseFailed));
        assert_eq!(parse_storage_migration_read_failure_reason("unknown"), None);
    }
}

mod parse_storage_read_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_read_failure_reason("parse-failed"), Some(StorageReadFailureReason::ParseFailed));
        assert_eq!(parse_storage_read_failure_reason("persistence-invalid"), Some(StorageReadFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_read_failure_reason("read-failed"), Some(StorageReadFailureReason::ReadFailed));
        assert_eq!(parse_storage_read_failure_reason("runtime-unavailable"), Some(StorageReadFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_read_failure_reason("security-denied"), Some(StorageReadFailureReason::SecurityDenied));
        assert_eq!(parse_storage_read_failure_reason("unknown"), None);
    }
}

mod parse_storage_remove_item_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_remove_item_failure_reason("persistence-invalid"), Some(StorageRemoveItemFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_remove_item_failure_reason("quota-exceeded"), Some(StorageRemoveItemFailureReason::QuotaExceeded));
        assert_eq!(parse_storage_remove_item_failure_reason("read-failed"), Some(StorageRemoveItemFailureReason::ReadFailed));
        assert_eq!(parse_storage_remove_item_failure_reason("remove-failed"), Some(StorageRemoveItemFailureReason::RemoveFailed));
        assert_eq!(parse_storage_remove_item_failure_reason("runtime-unavailable"), Some(StorageRemoveItemFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_remove_item_failure_reason("security-denied"), Some(StorageRemoveItemFailureReason::SecurityDenied));
        assert_eq!(parse_storage_remove_item_failure_reason("unknown"), None);
    }
}

mod parse_storage_set_item_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_set_item_failure_reason("persistence-invalid"), Some(StorageSetItemFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_set_item_failure_reason("quota-exceeded"), Some(StorageSetItemFailureReason::QuotaExceeded));
        assert_eq!(parse_storage_set_item_failure_reason("read-failed"), Some(StorageSetItemFailureReason::ReadFailed));
        assert_eq!(parse_storage_set_item_failure_reason("runtime-unavailable"), Some(StorageSetItemFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_set_item_failure_reason("security-denied"), Some(StorageSetItemFailureReason::SecurityDenied));
        assert_eq!(parse_storage_set_item_failure_reason("write-failed"), Some(StorageSetItemFailureReason::WriteFailed));
        assert_eq!(parse_storage_set_item_failure_reason("unknown"), None);
    }
}

mod parse_storage_write_failure_reason {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        assert_eq!(parse_storage_write_failure_reason("persistence-invalid"), Some(StorageWriteFailureReason::PersistenceInvalid));
        assert_eq!(parse_storage_write_failure_reason("quota-exceeded"), Some(StorageWriteFailureReason::QuotaExceeded));
        assert_eq!(parse_storage_write_failure_reason("read-failed"), Some(StorageWriteFailureReason::ReadFailed));
        assert_eq!(parse_storage_write_failure_reason("runtime-unavailable"), Some(StorageWriteFailureReason::RuntimeUnavailable));
        assert_eq!(parse_storage_write_failure_reason("security-denied"), Some(StorageWriteFailureReason::SecurityDenied));
        assert_eq!(parse_storage_write_failure_reason("serialization-failed"), Some(StorageWriteFailureReason::SerializationFailed));
        assert_eq!(parse_storage_write_failure_reason("write-failed"), Some(StorageWriteFailureReason::WriteFailed));
        assert_eq!(parse_storage_write_failure_reason("unknown"), None);
    }
}

mod storage_batch_mutation_outcome_is_ok {
    use super::*;

    #[test]
    fn returns_true_for_ok() {
        let ok: StorageBatchMutationOutcome<StorageRemoveItemFailureReason> =
            StorageBatchMutationOutcome::Ok(StorageBatchMutationOk { completed: 3 });
        assert!(storage_batch_mutation_outcome_is_ok(&ok));
    }

    #[test]
    fn returns_false_for_err() {
        let err: StorageBatchMutationOutcome<StorageRemoveItemFailureReason> =
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 1,
                failed_key: Some("b".to_string()),
                reason: StorageRemoveItemFailureReason::RemoveFailed,
            });
        assert!(!storage_batch_mutation_outcome_is_ok(&err));
    }
}

mod storage_batch_mutation_outcome_reason {
    use super::*;

    #[test]
    fn returns_none_for_ok() {
        let ok: StorageBatchMutationOutcome<StorageRemoveItemFailureReason> =
            StorageBatchMutationOutcome::Ok(StorageBatchMutationOk { completed: 3 });
        assert_eq!(storage_batch_mutation_outcome_reason(&ok), None);
    }

    #[test]
    fn returns_reason_for_err() {
        let err: StorageBatchMutationOutcome<StorageRemoveItemFailureReason> =
            StorageBatchMutationOutcome::Err(StorageBatchMutationErr {
                completed: 1,
                failed_key: Some("b".to_string()),
                reason: StorageRemoveItemFailureReason::RemoveFailed,
            });
        assert_eq!(storage_batch_mutation_outcome_reason(&err), Some(StorageRemoveItemFailureReason::RemoveFailed));
    }
}

mod storage_get_item_failure_into_clear_namespace {
    use super::*;

    #[test]
    fn converts_all_variants() {
        assert_eq!(
            storage_get_item_failure_into_clear_namespace(StorageGetItemFailureReason::RuntimeUnavailable),
            StorageClearNamespaceFailureReason::RuntimeUnavailable,
        );
        assert_eq!(
            storage_get_item_failure_into_clear_namespace(StorageGetItemFailureReason::PersistenceInvalid),
            StorageClearNamespaceFailureReason::PersistenceInvalid,
        );
    }
}

mod storage_get_item_failure_into_migration_read {
    use super::*;

    #[test]
    fn converts_all_variants() {
        assert_eq!(
            storage_get_item_failure_into_migration_read(StorageGetItemFailureReason::PersistenceInvalid),
            StorageMigrationReadFailureReason::PersistenceInvalid,
        );
        assert_eq!(
            storage_get_item_failure_into_migration_read(StorageGetItemFailureReason::SecurityDenied),
            StorageMigrationReadFailureReason::SecurityDenied,
        );
    }
}

mod storage_get_item_failure_into_read {
    use super::*;

    #[test]
    fn converts_all_variants() {
        assert_eq!(
            storage_get_item_failure_into_read(StorageGetItemFailureReason::SecurityDenied),
            StorageReadFailureReason::SecurityDenied,
        );
        assert_eq!(
            storage_get_item_failure_into_read(StorageGetItemFailureReason::ReadFailed),
            StorageReadFailureReason::ReadFailed,
        );
    }
}

mod storage_mutation_outcome_is_ok {
    use super::*;

    #[test]
    fn returns_true_for_ok() {
        let ok: StorageMutationOutcome<StorageClearFailureReason> = StorageMutationOutcome::Ok;
        assert!(storage_mutation_outcome_is_ok(&ok));
    }

    #[test]
    fn returns_false_for_err() {
        let err: StorageMutationOutcome<StorageClearFailureReason> =
            StorageMutationOutcome::Err(StorageMutationErr { reason: StorageClearFailureReason::SecurityDenied });
        assert!(!storage_mutation_outcome_is_ok(&err));
    }
}

mod storage_mutation_outcome_reason {
    use super::*;

    #[test]
    fn returns_none_for_ok() {
        let ok: StorageMutationOutcome<StorageClearFailureReason> = StorageMutationOutcome::Ok;
        assert_eq!(storage_mutation_outcome_reason(&ok), None);
    }

    #[test]
    fn returns_reason_for_err() {
        let err: StorageMutationOutcome<StorageClearFailureReason> =
            StorageMutationOutcome::Err(StorageMutationErr { reason: StorageClearFailureReason::SecurityDenied });
        assert_eq!(storage_mutation_outcome_reason(&err), Some(StorageClearFailureReason::SecurityDenied));
    }
}

mod storage_remove_item_failure_into_clear_namespace {
    use super::*;

    #[test]
    fn converts_all_variants() {
        assert_eq!(
            storage_remove_item_failure_into_clear_namespace(StorageRemoveItemFailureReason::RemoveFailed),
            StorageClearNamespaceFailureReason::RemoveFailed,
        );
        assert_eq!(
            storage_remove_item_failure_into_clear_namespace(StorageRemoveItemFailureReason::QuotaExceeded),
            StorageClearNamespaceFailureReason::QuotaExceeded,
        );
    }
}

mod storage_value_outcome_is_ok {
    use super::*;

    #[test]
    fn returns_true_for_ok() {
        let ok: StorageValueOutcome<String, StorageGetItemFailureReason> =
            StorageValueOutcome::Ok(StorageValueOk { value: "test".to_string() });
        assert!(storage_value_outcome_is_ok(&ok));
    }

    #[test]
    fn returns_false_for_err() {
        let err: StorageValueOutcome<String, StorageGetItemFailureReason> =
            StorageValueOutcome::Err(StorageValueErr { reason: StorageGetItemFailureReason::ReadFailed });
        assert!(!storage_value_outcome_is_ok(&err));
    }
}
