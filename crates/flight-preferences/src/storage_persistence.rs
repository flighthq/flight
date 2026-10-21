use flight_permissions::HostPreferencesPersistenceQueryCapability;
use flight_permissions::HostPreferencesPersistenceRequestCapability;
use flight_permissions::StoragePersistenceProviderResult;

pub async fn get_storage_persistence(
    host_preferences_persistence_query: &HostPreferencesPersistenceQueryCapability,
) -> StoragePersistenceProviderResult {
    let backend = host_preferences_persistence_query;
    return (backend.get_persistence)().await;
}

pub async fn request_storage_persistence(
    host_preferences_persistence_request: &HostPreferencesPersistenceRequestCapability,
) -> StoragePersistenceProviderResult {
    let backend = host_preferences_persistence_request;
    return (backend.request_persistence)().await;
}
