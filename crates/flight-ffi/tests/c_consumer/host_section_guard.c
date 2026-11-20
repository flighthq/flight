/* Compiles only while the header's FLIGHT_HOST_HEADLESS section stays hidden: without the guard
 * macro, these conflicting file-scope declarations of the section's names must be the only ones. */

#include "flight_ffi.h"

#ifdef FLIGHT_HOST_HEADLESS
#error "this probe must be compiled without FLIGHT_HOST_HEADLESS"
#endif

typedef int FlightHeadlessHost;
int flight_create_headless_host = 0;
int flight_destroy_headless_host = 0;

int main(void) {
  FlightHeadlessHost unused = flight_create_headless_host + flight_destroy_headless_host;
  return unused;
}
