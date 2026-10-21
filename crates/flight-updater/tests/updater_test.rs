use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex, RwLock};

use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_updater::contract::*;

use crate::block_on;

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

fn not_available_check() -> Arc<dyn Fn() -> AppUpdateCheckFuture + Send + Sync> {
    return Arc::new(|| {
        let future: AppUpdateCheckFuture = Box::pin(async {
            return Ok(AppUpdateCheckOutcome::NotAvailable(
                AppUpdateCheckOutcomeNotAvailable {},
            ));
        });
        return future;
    });
}

fn ok_install() -> Arc<dyn Fn(&DownloadedUpdate) -> AppUpdateInstallFuture + Send + Sync> {
    return Arc::new(|_update: &DownloadedUpdate| {
        let future: AppUpdateInstallFuture = Box::pin(async {
            return Ok(AppUpdateInstallOutcome {
                reason: AppUpdateInstallReason::Ok,
            });
        });
        return future;
    });
}

fn provider(
    check: Arc<dyn Fn() -> AppUpdateCheckFuture + Send + Sync>,
    destroy: Arc<dyn Fn() + Send + Sync>,
    install: Arc<dyn Fn(&DownloadedUpdate) -> AppUpdateInstallFuture + Send + Sync>,
) -> Ref<HostUpdaterCommandCapability> {
    return Arc::new(RwLock::new(HostUpdaterCommandCapability {
        check,
        destroy,
        install,
    }));
}

mod check_for_app_update {
    use super::*;

    #[test]
    fn awaits_exactly_one_explicit_host_updater_check() {
        let checks = Arc::new(Mutex::new(0));
        let captured = checks.clone();
        let host = provider(
            Arc::new(move || {
                *captured.lock().unwrap() += 1;
                return not_available_check().as_ref()();
            }),
            Arc::new(|| {}),
            ok_install(),
        );
        let outcome = block_on(check_for_app_update(&host));
        assert_eq!(
            get_app_update_check_outcome_reason(&outcome),
            AppUpdateCheckReason::NotAvailable
        );
        assert_eq!(*checks.lock().unwrap(), 1);
    }

    #[test]
    fn does_not_invent_error_detail_when_a_provider_operation_rejects() {
        let host = provider(
            Arc::new(|| {
                let future: AppUpdateCheckFuture = Box::pin(async {
                    return Err(FlightError {
                        kind: FlightErrorKind::Error,
                        message: "native detail must not leak through a portable outcome"
                            .to_string(),
                    });
                });
                return future;
            }),
            Arc::new(|| {}),
            ok_install(),
        );
        let outcome = block_on(check_for_app_update(&host));
        assert_eq!(
            get_app_update_check_outcome_reason(&outcome),
            AppUpdateCheckReason::OperationFailed
        );
    }

    #[test]
    fn rejects_a_handle_owned_by_another_provider_even_when_their_callbacks_are_identical() {
        let prepared = Arc::new(Mutex::new(Option::<DownloadedUpdate>::None));
        let prepared_by_check = prepared.clone();
        let check: Arc<dyn Fn() -> AppUpdateCheckFuture + Send + Sync> = Arc::new(move || {
            let taken = prepared_by_check.lock().unwrap().take();
            let future: AppUpdateCheckFuture = Box::pin(async move {
                return match taken {
                    Some(update) => Ok(AppUpdateCheckOutcome::Downloaded(
                        AppUpdateCheckOutcomeDownloaded { update },
                    )),
                    None => Ok(AppUpdateCheckOutcome::NotAvailable(
                        AppUpdateCheckOutcomeNotAvailable {},
                    )),
                };
            });
            return future;
        });
        let first = provider(check.clone(), Arc::new(|| {}), ok_install());
        let second = provider(check, Arc::new(|| {}), ok_install());

        *prepared.lock().unwrap() = Some(create_downloaded_update(info()));
        let AppUpdateCheckOutcome::Downloaded(downloaded) = block_on(check_for_app_update(&first))
        else {
            panic!("expected a downloaded update");
        };
        *prepared.lock().unwrap() = Some(downloaded.update);
        let outcome = block_on(check_for_app_update(&second));
        assert_eq!(
            get_app_update_check_outcome_reason(&outcome),
            AppUpdateCheckReason::OperationFailed
        );
    }
}

mod destroy_updater {
    use super::*;

    #[test]
    fn destroys_only_the_explicitly_supplied_provider() {
        let selected_destroyed = Arc::new(Mutex::new(0));
        let captured = selected_destroyed.clone();
        let selected = provider(
            not_available_check(),
            Arc::new(move || *captured.lock().unwrap() += 1),
            ok_install(),
        );
        let other_destroyed = Arc::new(Mutex::new(0));
        let captured = other_destroyed.clone();
        let _other = provider(
            not_available_check(),
            Arc::new(move || *captured.lock().unwrap() += 1),
            ok_install(),
        );
        destroy_updater(&selected);
        assert_eq!(*selected_destroyed.lock().unwrap(), 1);
        assert_eq!(*other_destroyed.lock().unwrap(), 0);
    }
}

mod install_downloaded_update {
    use super::*;

    #[test]
    fn pins_a_downloaded_handle_to_its_originating_provider_across_host_replacement() {
        let prepared = Arc::new(Mutex::new(Some(create_downloaded_update(info()))));
        let prepared_by_check = prepared.clone();
        let origin_installs = Arc::new(Mutex::new(0));
        let origin_seen = origin_installs.clone();
        let origin = provider(
            Arc::new(move || {
                let taken = prepared_by_check.lock().unwrap().take();
                let future: AppUpdateCheckFuture = Box::pin(async move {
                    return Ok(AppUpdateCheckOutcome::Downloaded(
                        AppUpdateCheckOutcomeDownloaded {
                            update: taken.expect("prepared update"),
                        },
                    ));
                });
                return future;
            }),
            Arc::new(|| {}),
            Arc::new(move |_update: &DownloadedUpdate| {
                *origin_seen.lock().unwrap() += 1;
                return ok_install().as_ref()(_update);
            }),
        );
        let replacement_installs = Arc::new(Mutex::new(0));
        let replacement_seen = replacement_installs.clone();
        let replacement = provider(
            not_available_check(),
            Arc::new(|| {}),
            Arc::new(move |_update: &DownloadedUpdate| {
                *replacement_seen.lock().unwrap() += 1;
                return ok_install().as_ref()(_update);
            }),
        );

        let AppUpdateCheckOutcome::Downloaded(downloaded) = block_on(check_for_app_update(&origin))
        else {
            panic!("expected a downloaded update");
        };
        let mut update = downloaded.update;
        let outcome = block_on(install_downloaded_update(&replacement, &mut update));
        assert_eq!(outcome.reason, AppUpdateInstallReason::Ok);
        assert_eq!(*origin_installs.lock().unwrap(), 1);
        assert_eq!(*replacement_installs.lock().unwrap(), 0);
    }

    #[test]
    fn rejects_a_handle_that_did_not_originate_from_a_completed_check() {
        let mut update = create_downloaded_update(info());
        let host = provider(not_available_check(), Arc::new(|| {}), ok_install());
        let payload = std::panic::catch_unwind(AssertUnwindSafe(|| {
            return block_on(install_downloaded_update(&host, &mut update));
        }));
        let error = payload
            .expect_err("installing an unrecognized handle must throw")
            .downcast::<FlightError>()
            .expect("panic payload must be a FlightError");
        assert_eq!(error.kind, FlightErrorKind::TypeError);
        assert_eq!(
            error.message,
            "Downloaded update did not originate from a completed check"
        );
    }

    #[test]
    fn a_successful_install_consumes_the_handle() {
        let host = proven_provider(ok_install());
        let mut update = checked_update(&host);
        let outcome = block_on(install_downloaded_update(&host, &mut update));
        assert_eq!(outcome.reason, AppUpdateInstallReason::Ok);
        let payload = std::panic::catch_unwind(AssertUnwindSafe(|| {
            return block_on(install_downloaded_update(&host, &mut update));
        }));
        let error = payload
            .expect_err("a consumed handle must throw")
            .downcast::<FlightError>()
            .expect("panic payload must be a FlightError");
        assert_eq!(error.kind, FlightErrorKind::TypeError);
    }

    #[test]
    fn a_rejected_install_keeps_ownership_so_a_retry_can_succeed() {
        let attempts = Arc::new(Mutex::new(0));
        let captured = attempts.clone();
        let host = proven_provider(Arc::new(move |_update: &DownloadedUpdate| {
            let mut attempt = captured.lock().unwrap();
            *attempt += 1;
            let current = *attempt;
            let future: AppUpdateInstallFuture = Box::pin(async move {
                if current == 1 {
                    return Err(FlightError {
                        kind: FlightErrorKind::Error,
                        message: "transient".to_string(),
                    });
                }
                return Ok(AppUpdateInstallOutcome {
                    reason: AppUpdateInstallReason::Ok,
                });
            });
            return future;
        }));
        let mut update = checked_update(&host);
        let first = block_on(install_downloaded_update(&host, &mut update));
        assert_eq!(first.reason, AppUpdateInstallReason::OperationFailed);
        let second = block_on(install_downloaded_update(&host, &mut update));
        assert_eq!(second.reason, AppUpdateInstallReason::Ok);
    }

    #[test]
    fn a_non_ok_sentinel_keeps_ownership_so_a_retry_can_succeed() {
        let attempts = Arc::new(Mutex::new(0));
        let captured = attempts.clone();
        let host = proven_provider(Arc::new(move |_update: &DownloadedUpdate| {
            let mut attempt = captured.lock().unwrap();
            *attempt += 1;
            let current = *attempt;
            let future: AppUpdateInstallFuture = Box::pin(async move {
                if current == 1 {
                    return Ok(AppUpdateInstallOutcome {
                        reason: AppUpdateInstallReason::OperationFailed,
                    });
                }
                return Ok(AppUpdateInstallOutcome {
                    reason: AppUpdateInstallReason::Ok,
                });
            });
            return future;
        }));
        let mut update = checked_update(&host);
        let first = block_on(install_downloaded_update(&host, &mut update));
        assert_eq!(first.reason, AppUpdateInstallReason::OperationFailed);
        let second = block_on(install_downloaded_update(&host, &mut update));
        assert_eq!(second.reason, AppUpdateInstallReason::Ok);
    }

    fn checked_update(host: &Ref<HostUpdaterCommandCapability>) -> DownloadedUpdate {
        let AppUpdateCheckOutcome::Downloaded(downloaded) = block_on(check_for_app_update(host))
        else {
            panic!("expected a downloaded update");
        };
        return downloaded.update;
    }

    fn proven_provider(
        install: Arc<dyn Fn(&DownloadedUpdate) -> AppUpdateInstallFuture + Send + Sync>,
    ) -> Ref<HostUpdaterCommandCapability> {
        let prepared = Arc::new(Mutex::new(Some(create_downloaded_update(info()))));
        let prepared_by_check = prepared.clone();
        return provider(
            Arc::new(move || {
                let taken = prepared_by_check.lock().unwrap().take();
                let future: AppUpdateCheckFuture = Box::pin(async move {
                    return match taken {
                        Some(update) => Ok(AppUpdateCheckOutcome::Downloaded(
                            AppUpdateCheckOutcomeDownloaded { update },
                        )),
                        None => Ok(AppUpdateCheckOutcome::NotAvailable(
                            AppUpdateCheckOutcomeNotAvailable {},
                        )),
                    };
                });
                return future;
            }),
            Arc::new(|| {}),
            install,
        );
    }
}
