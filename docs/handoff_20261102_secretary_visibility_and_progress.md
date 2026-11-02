# Secretary session visibility and progress recovery

Internal Secretary execution sessions were appearing in Home's normal session
rail. The progress request could remain in Loading indefinitely because
`apiFetch` ignored its twelve-second timeout whenever a caller supplied an
AbortSignal. It also cleared that timeout after headers, before JSON body reads.

Home now applies the Manager's internal execution markers to cached list pages:
`source == secretary_internal` or the reserved `sess_secretary_` ID prefix. This
is a display filter, not authorization; explicit session access remains intact.
The Manager companion change filters list results before pagination.

`apiFetch` now forwards caller cancellation into its deadline controller and
keeps the deadline active through JSON consumption. TimeoutError remains distinct
from caller AbortError, including body-read aborts. Timers and caller listeners
are cleaned up after settlement. Secretary progress does not immediately retry a
timeout; it displays the timeout with an available Refresh action. Its ordinary
polling interval remains unchanged. Processing status describes last_error as a
previous task failure while other conversations are processing, without claiming
that failed tasks will necessarily recover.

## Validation

- API, Secretary UI, session-origin, and Home regression suites: 217 passed, one
  pre-existing skipped test across 13 files.
- Changed TypeScript files pass ESLint and Prettier checks; git diff --check passes.
- A production Next build passes, including TypeScript and all route generation.
  The build required network access for its existing Google Font dependency.
- Browser checks use the production build and a loopback-only synthetic API. A
  twenty-second progress response produces an explicit timeout and enabled
  Refresh after twelve seconds. Refresh succeeds after restoring a fast response.
- At 390 x 844, Home receives three fixture sessions, including both internal
  markers, and displays only the ordinary user conversation. The processing
  status explicitly identifies a previous failed task. No production settings,
  sessions, tasks, or accounts were changed by these browser checks.

Both architecture and operating-guide documentation describe the changed request
lifecycle and cached-list visibility boundary. Backend query timeouts and progress
query performance are handled by the companion Manager fix.

## Cached per-agent list follow-up

The final list audit also found unfiltered per-agent query observers used by
Resources/Monitor, agent detail, and the E2EE session selector. These now reuse
`selectVisibleSessions` as a TanStack query projection. It filters both exact
internal markers from existing cache entries and later cache updates, without
modifying the stored metadata or filtering the selected Secretary agent itself.
Ordinary chats on that agent remain visible, including chats named Secretary.
The canonical single-session read path remains available for explicit links.

Two regression tests failed before this fix and pass with it. The shared
session-origin module has 100% statement, branch, function, and line coverage.
