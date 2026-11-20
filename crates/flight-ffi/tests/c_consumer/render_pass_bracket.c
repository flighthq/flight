/* Linked C coverage for the borrow-erased WGPU pass bracket against the default library. Production
 * C has no producer for a render state or render target, so this pins the exact typed prototypes and
 * the NULL sentinels: every NULL handle or required argument is rejected before anything else is
 * read, including a live FlightNode scene source, which stays caller-owned and is released normally
 * afterwards. render_pass_live.c drives the bracket live against stand-in carriers. */

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

#include "flight_ffi.h"

static int check(int ok, const char *what) {
  if (!ok) {
    printf("flight-ffi render pass bracket: FAILED %s\n", what);
  }
  return ok;
}

int main(void) {
  FlightWgpuRenderPassHandle *(*begin)(void *, void *, void *) = flight_begin_wgpu_render_pass;
  bool (*end)(FlightWgpuRenderPassHandle *) = flight_end_wgpu_render_pass;
  void (*release)(FlightWgpuRenderPassHandle *) = flight_free_wgpu_render_pass_handle;
  bool (*scene2d)(FlightWgpuRenderPassHandle *, void *, const FlightNode *, void *) =
      flight_render_wgpu_scene2d;
  bool (*scene3d)(FlightWgpuRenderPassHandle *, const FlightNode *, void *, void *, void *) =
      flight_render_wgpu_scene3d;
  bool (*skybox)(FlightWgpuRenderPassHandle *, void *, void *, double) =
      flight_render_wgpu_environment_skybox;
  uint64_t dummy[4] = {0, 0, 0, 0};
  FlightNode *source = flight_create_display_object();
  int ok = check(source != NULL, "display object source");

  ok &= check(begin(NULL, dummy, NULL) == NULL, "begin with NULL state");
  ok &= check(begin(dummy, NULL, NULL) == NULL, "begin with NULL target");
  ok &= check(!end(NULL), "end with NULL handle");
  release(NULL);
  ok &= check(!scene2d(NULL, dummy, source, NULL), "scene2d with NULL handle");
  ok &= check(!scene2d(NULL, dummy, NULL, NULL), "scene2d with NULL handle and NULL source");
  ok &= check(!scene3d(NULL, source, dummy, dummy, NULL), "scene3d with NULL handle");
  ok &= check(!scene3d(NULL, NULL, dummy, dummy, NULL), "scene3d with NULL handle and NULL scene");
  ok &= check(!skybox(NULL, dummy, dummy, 1.0), "skybox with NULL handle");
#ifndef FLIGHT_FFI_DELIBERATE_LEAK
  flight_free_node(source);
#endif

  if (!ok) {
    return 1;
  }
  printf("flight-ffi render pass bracket: ok\n");
  return 0;
}
