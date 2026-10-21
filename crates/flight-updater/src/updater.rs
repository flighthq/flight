use std::future::Future;
use std::sync::Arc;

use flight_entity::{
    Ref, attach_entity_binding, detach_entity_binding, get_entity_binding_as, throw_type_error,
};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::test_support::block_on;
    use std::sync::{Mutex, RwLock};

    // D23 (B): a downloaded update is created empty, then given its metadata (Principal 21f7557f).
    fn downloaded_update_of(info: UpdateInfo) -> DownloadedUpdate {
        let mut update = create_downloaded_update();
        update.info = info;
        return update;
    }

    fn info() -> UpdateInfo {
        return UpdateInfo {
            download_size_bytes: None,
            is_mandatory: None,
            minimum_os_version: None,
            notes: None,
            release_date: None,
            sha512: None,
            version: Some("1.2.3".to_string()),
        };
    }

    fn provider(
        check_outcome: Arc<Mutex<AppUpdateCheckOutcome>>,
        installed: Arc<Mutex<Vec<String>>>,
        destroyed: Arc<Mutex<usize>>,
    ) -> Ref<HostUpdaterCommandCapability> {
        let check_outcome = check_outcome.clone();
        let install_seen = installed.clone();
        return Arc::new(RwLock::new(HostUpdaterCommandCapability {
            check: Arc::new(move || {
                let outcome = check_outcome.lock().unwrap().clone();
                let future: AppUpdateCheckFuture = Box::pin(async move {
                    return Ok(outcome);
                });
                return future;
            }),
            destroy: Arc::new(move || *destroyed.lock().unwrap() += 1),
            install: Arc::new(move |update: &DownloadedUpdate| {
                install_seen
                    .lock()
                    .unwrap()
                    .push(update.info.version.clone().unwrap_or_default());
                let future: AppUpdateInstallFuture = Box::pin(async {
                    return Ok(AppUpdateInstallOutcome {
                        reason: AppUpdateInstallReason::Ok,
                    });
                });
                return future;
            }),
        }));
    }

    #[test]
    fn check_method_matches_check_for_app_update() {
        let method_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {},
            ))),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(0)),
        );
        let free_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {},
            ))),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(0)),
        );
        let via_method = block_on(HostUpdaterCommandCapabilityMethods::check(&method_host));
        let via_free = block_on(check_for_app_update(&free_host));
        assert_eq!(via_method, via_free);
    }

    #[test]
    fn destroy_method_matches_destroy_updater() {
        let method_destroyed = Arc::new(Mutex::new(0));
        let method_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {},
            ))),
            Arc::new(Mutex::new(Vec::new())),
            method_destroyed.clone(),
        );
        let free_destroyed = Arc::new(Mutex::new(0));
        let free_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {},
            ))),
            Arc::new(Mutex::new(Vec::new())),
            free_destroyed.clone(),
        );
        HostUpdaterCommandCapabilityMethods::destroy(&method_host);
        destroy_updater(&free_host);
        assert_eq!(
            *method_destroyed.lock().unwrap(),
            *free_destroyed.lock().unwrap()
        );
    }

    #[test]
    fn install_method_matches_install_downloaded_update() {
        let method_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::Downloaded(
                AppUpdateCheckOutcomeDownloaded {
                    update: downloaded_update_of(info()),
                },
            ))),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(0)),
        );
        let free_host = provider(
            Arc::new(Mutex::new(AppUpdateCheckOutcome::Downloaded(
                AppUpdateCheckOutcomeDownloaded {
                    update: downloaded_update_of(info()),
                },
            ))),
            Arc::new(Mutex::new(Vec::new())),
            Arc::new(Mutex::new(0)),
        );
        let AppUpdateCheckOutcome::Downloaded(method_downloaded) =
            block_on(HostUpdaterCommandCapabilityMethods::check(&method_host))
        else {
            panic!("expected a downloaded update");
        };
        let AppUpdateCheckOutcome::Downloaded(free_downloaded) =
            block_on(check_for_app_update(&free_host))
        else {
            panic!("expected a downloaded update");
        };
        let mut method_update = method_downloaded.update;
        let mut free_update = free_downloaded.update;
        let via_method = block_on(HostUpdaterCommandCapabilityMethods::install(
            &method_host,
            &mut method_update,
        ));
        let via_free = block_on(install_downloaded_update(&free_host, &mut free_update));
        assert_eq!(via_method, via_free);
    }
}

/// Runs exactly one explicit host updater check (TS `checkForAppUpdate`). A provider rejection or
/// any non-downloaded arm becomes `operation-failed` with no invented detail. A downloaded handle
/// already owned by a different provider is rejected; otherwise the checked provider is attached
/// to the handle so later installs stay pinned to it.
pub async fn check_for_app_update(
    host_updater_command: &Ref<HostUpdaterCommandCapability>,
) -> AppUpdateCheckOutcome {
    let check = host_updater_command.read().unwrap().check.clone();
    let result = check().await;
    let Ok(outcome) = result else {
        return AppUpdateCheckOutcome::OperationFailed(AppUpdateCheckOutcomeOperationFailed {});
    };
    return match outcome {
        AppUpdateCheckOutcome::Downloaded(downloaded) => {
            let mut update = downloaded.update;
            let existing_owner = get_entity_binding_as::<
                Ref<HostUpdaterCommandCapability>,
                DownloadedUpdate,
            >(&update)
            .cloned();
            if let Some(existing_owner) = existing_owner
                && !Arc::ptr_eq(&existing_owner, host_updater_command)
            {
                return AppUpdateCheckOutcome::OperationFailed(
                    AppUpdateCheckOutcomeOperationFailed {},
                );
            }
            attach_entity_binding(&mut update, Box::new(host_updater_command.clone()));
            AppUpdateCheckOutcome::Downloaded(AppUpdateCheckOutcomeDownloaded { update })
        }
        AppUpdateCheckOutcome::CheckInProgress(_) => {
            AppUpdateCheckOutcome::CheckInProgress(AppUpdateCheckOutcomeCheckInProgress {})
        }
        AppUpdateCheckOutcome::NotAvailable(_) => {
            AppUpdateCheckOutcome::NotAvailable(AppUpdateCheckOutcomeNotAvailable {})
        }
        AppUpdateCheckOutcome::OperationFailed(_) => {
            AppUpdateCheckOutcome::OperationFailed(AppUpdateCheckOutcomeOperationFailed {})
        }
    };
}

/// Destroys only the explicitly supplied provider (TS `destroyUpdater`). The source does not catch
/// a synchronous throw here, so neither does this port.
pub fn destroy_updater(host_updater_command: &Ref<HostUpdaterCommandCapability>) {
    let destroy = host_updater_command.read().unwrap().destroy.clone();
    destroy();
}

/// Installs a handle through the provider that produced it (TS `installDownloadedUpdate`). The
/// selected provider is consulted only through its exact shared identity: a replacement provider
/// never observes a handle it did not check. An unknown or consumed handle throws the source's
/// TypeError. Only a successful install consumes ownership; failures and rejections leave it
/// intact so a retry can succeed.
pub async fn install_downloaded_update(
    host_updater_command: &Ref<HostUpdaterCommandCapability>,
    update: &mut DownloadedUpdate,
) -> AppUpdateInstallOutcome {
    let origin =
        get_entity_binding_as::<Ref<HostUpdaterCommandCapability>, DownloadedUpdate>(update)
            .cloned();
    let Some(origin) = origin else {
        throw_type_error("Downloaded update did not originate from a completed check");
    };
    let provider = if Arc::ptr_eq(host_updater_command, &origin) {
        host_updater_command.clone()
    } else {
        origin
    };
    let install = provider.read().unwrap().install.clone();
    let result = install(update).await;
    let Ok(outcome) = result else {
        return AppUpdateInstallOutcome {
            reason: AppUpdateInstallReason::OperationFailed,
        };
    };
    if outcome.reason != AppUpdateInstallReason::Ok {
        return AppUpdateInstallOutcome {
            reason: AppUpdateInstallReason::OperationFailed,
        };
    }
    detach_entity_binding(update);
    return AppUpdateInstallOutcome {
        reason: AppUpdateInstallReason::Ok,
    };
}

// ============================================================================
// D18 sugar: the shared provider handle mirrors the source's object methods
// ============================================================================

/// Sugar for the shared updater provider handle (TS `HostUpdaterCommandCapability`). The source
/// compares provider object identity, so Rust operations take `Ref<HostUpdaterCommandCapability>`
/// and the methods live on that handle rather than on the value type.
pub trait HostUpdaterCommandCapabilityMethods {
    fn check(&self) -> impl Future<Output = AppUpdateCheckOutcome> + Send;
    fn destroy(&self);
    fn install(
        &self,
        update: &mut DownloadedUpdate,
    ) -> impl Future<Output = AppUpdateInstallOutcome> + Send;
}

impl HostUpdaterCommandCapabilityMethods for Ref<HostUpdaterCommandCapability> {
    fn check(&self) -> impl Future<Output = AppUpdateCheckOutcome> + Send {
        return check_for_app_update(self);
    }

    fn destroy(&self) {
        return destroy_updater(self);
    }

    fn install(
        &self,
        update: &mut DownloadedUpdate,
    ) -> impl Future<Output = AppUpdateInstallOutcome> + Send {
        return install_downloaded_update(self, update);
    }
}
