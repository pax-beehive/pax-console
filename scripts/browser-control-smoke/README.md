# Docker viewer smoke test

Use Node 24 and the installed Console dependencies. Start the opt-in harness in
paxd in one terminal:

```
PAX_BROWSER_VNC_HARNESS=1 go test -run TestVNCBrowserHarness -count=1 ./internal/browsercontrol
```

Within ninety seconds, run from pax-console:

```
PAX_BROWSER_TEST_EXECUTABLE=/path/to/chrome node scripts/browser-control-smoke/run.mjs
```

The test uses a fresh browser and the real VNCChannel/noVNC modules. Playwright
relays frontend API requests to the loopback test harness. Manager auth is not
part of this harness; ownership is tested separately in Manager's userapi tests.
It checks a connected, non-black 1920x1080 canvas and writes a local screenshot
to /tmp/pax-vnc-browser-mvp.png. If Docker has no visible browser window, open a
disposable fixture first. The script is read-only: it does not click or type.
The interactive transport was also manually verified against a disposable
button fixture, which confirmed the click on the Docker browser side.
