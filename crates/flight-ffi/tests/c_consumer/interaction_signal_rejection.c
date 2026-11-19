/* Linked C coverage for flight_connect_interaction_signal's rejections. C cannot build a node
 * handle yet (Item B), so the manager and target are non-NULL dummy storage: a rejected name must
 * return NULL before either is read, and nothing may be called or released. */

#include <stdint.h>
#include <stdio.h>

#include "flight_ffi.h"

static int calls = 0;
static int releases = 0;

static void on_event(void *ctx, void *event) {
  (void)ctx;
  (void)event;
  calls += 1;
}

static void on_release(void *ctx) {
  (void)ctx;
  releases += 1;
}

static int check(int ok, const char *what) {
  if (!ok) {
    printf("flight-ffi interaction rejection: FAILED %s\n", what);
  }
  return ok;
}

int main(void) {
  static unsigned char manager_storage[64];
  static unsigned char target_storage[64];
  /* OnFocusIn, OnFocusOut, OnKeyDown, OnKeyUp, one past the last name, and the largest value. */
  const uint32_t rejected[] = {3u, 4u, 5u, 6u, 18u, 0xFFFFFFFFu};
  const uint32_t on_pointer_down = 9u;
  int ok = 1;

  for (size_t i = 0; i < sizeof rejected / sizeof rejected[0]; i += 1) {
    void *id = flight_connect_interaction_signal(manager_storage, target_storage, rejected[i],
                                                 on_event, &calls, on_release, NULL);
    ok &= check(id == NULL, "a non-pointer or invalid name was connected");
  }
  ok &= check(flight_connect_interaction_signal(NULL, target_storage, on_pointer_down, on_event,
                                                &calls, on_release, NULL) == NULL,
              "NULL manager");
  ok &= check(flight_connect_interaction_signal(manager_storage, NULL, on_pointer_down, on_event,
                                                &calls, on_release, NULL) == NULL,
              "NULL target");
  ok &= check(flight_connect_interaction_signal(manager_storage, target_storage, on_pointer_down,
                                                NULL, &calls, on_release, NULL) == NULL,
              "NULL slot_fn");
  ok &= check(calls == 0, "a rejected slot was called");
  ok &= check(releases == 0, "a rejected context was released");
  if (!ok) {
    return 1;
  }
  printf("flight-ffi interaction rejection: ok\n");
  return 0;
}
