# Android runtime Console handoff

## Implementation

This change lives in the isolated `mobile-integration-console` worktree on
`codex/mobile-runtime-integration`. It does not modify the other session's main
checkout or deploy a production Console.

- Node detail has an explicitly opened Android panel.
- Session resources have an independent, nonmodal phone window.
- `src/features/mobile-control` calls the same-origin `/api/pax` proxy and
  `POST /api/v1/user/{user_id}/nodes/{node_id}/daemon/mobile`.
- Manager checks node ownership and sends fixed `mobile.control` queries;
  paxd owns local credentials and runtime discovery.
- The UI supports explicit phone selection, lifecycle operations, takeover,
  screenshot-bound input, recording controls and bounded artifact download.
- Screenshots, text and media bytes remain ephemeral. Device and recording
  metadata use TanStack Query. Inputs are never automatically retried.
- Blur, hiding and unmount cancel operations still queued for dispatch. A
  dispatched operation can already have completed; cancellation does not undo it.
- Runtime human control persists until explicit release. Focusing the window
  does not retake control.

## Actual acceptance results

Pax control and screenshot acceptance passed against a real Android SDK emulator:
the actual Console Node page decoded a 720 x 1280 PNG, requested takeover, sent
one Back input, and released control. All required operations returned HTTP 200
and successful node results. The script waits for the release response and
confirmed UI state before closing its browser.

The local browser acceptance intercepts Manager identity/node metadata only
inside that disposable browser. Mobile operations pass through the real paxd
Client, private Unix test harness and real SDK runtime. This is not a claim of
production Manager deployment acceptance. The final read-only Settings screenshot
also passed after SDK cleanup and was delivered through Pax.

The Pax recording path successfully created, finalized and downloaded two
five-second internal-audio recordings through `recording_start`,
`recording_list` and bounded `recording_read` requests. ffprobe identified Opus,
48 kHz, stereo audio. However, the strong PCM amplitude check did not pass:

| Capture            | Peak |    RMS |  Mean level |
| ------------------ | ---: | -----: | ----------: |
| First Pax download |  198 | 128.99 | -48.10 dBFS |
| Final Pax download |  196 |    136 | -47.63 dBFS |

The check requires peak greater than 256 and RMS greater than 32. The first
download had a clear 440 Hz tone: its projection amplitude was 171.48, compared
with about 1 at 430 and 450 Hz. Thus the file contains the intended quiet tone,
but recording amplitude acceptance remains a known limitation. The tests did
not lower their thresholds or automatically retry recording starts. Completed
test artifacts remain private; no other device was stopped or destroyed.

The SDK's separate native WebRTC acceptance passed with stronger audio: actual
default Chrome decoded 720 x 1280 video, eight video frames and 36 audio packets,
with mean audio power about 0.01387 (-18.6 dBFS). It had no SCTP channel, and
logout confirmed media-process exit. This does not resolve the lower level on
the independent scrcpy recording path.

## Verification and local operation

The relevant Console tests passed (29 tests, including existing Browser-window
regressions). TypeScript, ESLint, Prettier and diff checks passed. Device-ID
fixtures were subsequently corrected to real `m-UUID` session IDs, and the seven
component tests passed again. Frame and recording IDs remain plain UUIDs.

Use the installed Node 24 toolchain when running checks on this machine:

```sh
PATH=/usr/local/opt/node@24/bin:$PATH node node_modules/typescript/bin/tsc --noEmit
PATH=/usr/local/opt/node@24/bin:$PATH node node_modules/vitest/vitest.mjs run \
  src/features/mobile-control/api.test.ts \
  src/components/resources/node-mobile-control.test.tsx \
  src/components/sessions/session-mobile-window.test.tsx \
  src/components/sessions/session-side-panels.test.ts \
  src/components/sessions/session-browser-window.test.tsx
```

The original browser acceptance reused the main checkout's dependencies through
an ignored `node_modules` symlink. Next's default Turbopack rejects that
outside-root symlink, so that acceptance used the official `next dev --webpack`
option, bound only to `127.0.0.1:3344`. That acceptance service was stopped afterward.
The main Pax services and separately owned SDK runtime on port 7342 were not
stopped by the Console cleanup.

## PR preparation on 2026-11-11

The feature was rebased onto current `origin/main` without the unrelated
installer commit inherited by the original worktree. Validation now uses a
separate `node_modules` installed from the frozen pnpm lockfile; the main
checkout's dependencies were not modified. The 44 relevant mobile, browser
window, side-panel and shared API client tests passed, along with TypeScript,
ESLint, Prettier and diff checks.

Current main enforces a twelve-second deadline even when a caller supplies a
cancellation signal. Mobile requests now pass an explicit bounded `timeoutMs`
to the shared helper: cold boot can wait twelve minutes, while the helper's
default remains twelve seconds and caller cancellation still takes effect
immediately. Regression tests exercise both long-request timeout and panel
cancellation. The opt-in browser script explicitly enables the Chromium
sandbox; real SDK/browser acceptance was not repeated during PR preparation.

This UI still requires the companion Manager and paxd adapters. It does not
add remote WebRTC, third-party streaming providers, or automatic selection of
the current Pax session's keyed phone.

`scripts/test-mobile-preview.mjs` requires a private test-harness socket and an
explicit owned running SDK session. `PAX_MOBILE_SCREENSHOT_ONLY=1` skips input
and takeover; `PAX_MOBILE_TEST_RECORDING=1` is an explicit recording write test
and also skips input/takeover. Do not run recording acceptance concurrently with
another media test. A Go test used to host the private harness must include
`-count=1`; a cached test result does not start a listener.

## Remaining boundary

Remote Pax preview uses screenshots and completed recordings. Same-host native
WebRTC stays on the local runtime; the Console does not forward SDP, ICE targets,
arbitrary URLs, host paths or credentials. The scrcpy recording level needs
separate capture-route investigation before claiming all audio-strength checks
are green. The emulator is not a malicious-application sandbox.
