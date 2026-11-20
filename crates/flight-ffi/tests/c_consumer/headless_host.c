/* Strict C coverage for the headless host section of the header: options, explanations, creation
 * failure, the opaque host handle, the carriers it lends, read-back before any frame, and
 * destruction with lent carriers outstanding. Every call on a destroyed, repeated, unknown or
 * foreign handle must fail closed, which the sanitizers check by running it. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "flight_ffi.h"

#define CHECK(condition)                                                                          \
  do {                                                                                            \
    if (!(condition)) {                                                                           \
      fprintf(stderr, "check failed at line %d: %s\n", __LINE__, #condition);                    \
      return 1;                                                                                   \
    }                                                                                             \
  } while (0)

/* Returns whether the owned string is non-NULL and non-empty, and releases it. */
static bool take_nonempty_string(char *text) {
  bool nonempty = text != NULL && text[0] != '\0';
  flight_free_string(text);
  return nonempty;
}

static int check_options_and_creation_failure(void) {
  void *options = flight_create_headless_host_options();
  CHECK(options != NULL);
  CHECK(flight_get_headless_host_options_allow_software_adapter(options));
  CHECK(flight_get_headless_host_options_power_preference(options) == 0);
  CHECK(flight_set_headless_host_options_power_preference(options, 1) == 1);
  CHECK(flight_set_headless_host_options_power_preference(options, 7) == 1);
  CHECK(!flight_set_headless_host_options_allow_dx12(options, false));
  CHECK(!flight_set_headless_host_options_allow_metal(options, false));
  CHECK(!flight_set_headless_host_options_allow_vulkan(options, false));
  CHECK(flight_create_headless_host(options) == NULL);
  void *explanation = flight_explain_headless_host(options);
  CHECK(explanation != NULL);
  CHECK(flight_get_headless_host_explanation_reason(explanation) == 1);
  CHECK(take_nonempty_string(flight_get_headless_host_explanation_message(explanation)));
  char *backend = flight_get_headless_host_explanation_adapter_backend(explanation);
  CHECK(backend != NULL && backend[0] == '\0');
  flight_free_string(backend);
  flight_free_headless_host_explanation(explanation);
  flight_free_headless_host_explanation(NULL);
  flight_free_headless_host_options(options);
  flight_free_headless_host_options(NULL);
  return 0;
}

/* Every host call on `host` must behave as on a host that does not exist. */
static int check_fails_closed(FlightHeadlessHost *host) {
  CHECK(flight_is_headless_host_destroyed(host));
  CHECK(!flight_is_headless_host_software_adapter(host));
  CHECK(flight_get_headless_host_wgpu_device(host) == NULL);
  CHECK(flight_get_headless_host_wgpu_capability(host) == NULL);
  CHECK(flight_get_headless_host_adapter_name(host) == NULL);
  CHECK(flight_get_headless_host_adapter_backend(host) == NULL);
  CHECK(flight_create_headless_host_surface(host, 2, 2) == NULL);
  CHECK(flight_create_headless_host_render_target(host, 2, 2) == NULL);
  flight_destroy_headless_host(host);
  return 0;
}

int main(void) {
  if (check_options_and_creation_failure() != 0) {
    return 1;
  }
  if (check_fails_closed(NULL) != 0) {
    return 1;
  }
  if (check_fails_closed((FlightHeadlessHost *)(uintptr_t)2) != 0) {
    return 1;
  }

  FlightHeadlessHost *host = flight_create_headless_host(NULL);
  if (host == NULL) {
    void *explanation = flight_explain_headless_host(NULL);
    printf("flight-ffi headless host: skipped (no adapter, reason %u)\n",
           flight_get_headless_host_explanation_reason(explanation));
    flight_free_headless_host_explanation(explanation);
    return 0;
  }
  CHECK(!flight_is_headless_host_destroyed(host));
  CHECK(take_nonempty_string(flight_get_headless_host_adapter_name(host)));
  CHECK(take_nonempty_string(flight_get_headless_host_adapter_backend(host)));
  void *ready = flight_explain_headless_host(NULL);
  CHECK(flight_get_headless_host_explanation_reason(ready) == 0);
  CHECK(take_nonempty_string(flight_get_headless_host_explanation_adapter_name(ready)));
  flight_free_headless_host_explanation(ready);

  void *device = flight_get_headless_host_wgpu_device(host);
  void *capability = flight_get_headless_host_wgpu_capability(host);
  CHECK(device != NULL && capability != NULL && device != capability);
  CHECK(flight_get_headless_host_wgpu_device(host) == device);
  CHECK(flight_get_headless_host_wgpu_capability(host) == capability);
  void *surface = flight_create_headless_host_surface(host, 16, 8);
  void *target = flight_create_headless_host_render_target(host, 16, 8);
  CHECK(surface != NULL && target != NULL && surface != target);

  CHECK(flight_create_bitmap_from_headless_screen_render_target(target, 1000) == NULL);
  void *unread = flight_explain_headless_screen_render_target_read_back(target, 1000);
  CHECK(unread != NULL);
  CHECK(flight_get_headless_read_back_explanation_reason(unread) == 2);
  flight_free_headless_read_back_explanation(unread);
  CHECK(flight_create_bitmap_from_headless_screen_render_target(surface, 1000) == NULL);
  CHECK(flight_explain_headless_screen_render_target_read_back(NULL, 1000) == NULL);
  if (check_fails_closed((FlightHeadlessHost *)target) != 0) {
    return 1;
  }

#ifdef FLIGHT_FFI_DELIBERATE_LEAK
  char *leaked = flight_get_headless_host_adapter_name(host);
  CHECK(leaked != NULL);
#endif

  flight_destroy_headless_host(host);
  if (check_fails_closed(host) != 0) {
    return 1;
  }
  CHECK(flight_create_bitmap_from_headless_screen_render_target(target, 1000) == NULL);
  CHECK(flight_explain_headless_screen_render_target_read_back(target, 1000) == NULL);

  FlightHeadlessHost *next = flight_create_headless_host(NULL);
  CHECK(next != NULL && next != host);
  CHECK(flight_is_headless_host_destroyed(host));
  flight_destroy_headless_host(next);
  printf("flight-ffi headless host: ok\n");
  return 0;
}
