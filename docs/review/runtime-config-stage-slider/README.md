# Runtime feature scope interaction review

The feature list and editor share one four-stop rail. Clicking a new scope,
releasing a drag, or completing a keyboard adjustment opens the editor with that
scope selected. Edit opens the currently effective scope. Cancelling discards the
draft; only a successful write updates the list.

The real Console UI was checked with fictional, intercepted `/api/pax` responses.
These screenshots do not demonstrate a live Manager or gateway integration.
Framework development controls are hidden in screenshots.

| State                        | English desktop                                      | English phone                                      | Chinese desktop                                         | Chinese phone                                         |
| ---------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Effective scopes and Edit    | [1440px](config-en-1440-features.png)                | [390px](config-en-390-features.png)                | [1440px](config-zh-CN-1440-features.png)                | [390px](config-zh-CN-390-features.png)                |
| Unsaved editor               | [1440px](config-en-1440-editor-draft.png)            | [390px](config-en-390-editor-draft.png)            | [1440px](config-zh-CN-1440-editor-draft.png)            | [390px](config-zh-CN-390-editor-draft.png)            |
| Scope confirmation           | [1440px](config-en-1440-impact-confirmation.png)     | [390px](config-en-390-impact-confirmation.png)     | [1440px](config-zh-CN-1440-impact-confirmation.png)     | [390px](config-zh-CN-390-impact-confirmation.png)     |
| US saved, HK conflict        | [1440px](config-en-1440-editor-partial-conflict.png) | [390px](config-en-390-editor-partial-conflict.png) | [1440px](config-zh-CN-1440-editor-partial-conflict.png) | [390px](config-zh-CN-390-editor-partial-conflict.png) |
| Saved after retrying only HK | [1440px](config-en-1440-editor-saved.png)            | [390px](config-en-390-editor-saved.png)            | [1440px](config-zh-CN-1440-editor-saved.png)            | [390px](config-zh-CN-390-editor-saved.png)            |

The browser check covers pointer release outside the rail, mobile touch
cancellation, keyboard selection, cancellation without a write, nested
confirmation Escape, per-region conflict results, explicit review, and retrying
only the failed region. It also checks that service configuration and audit tabs
still render, with no horizontal overflow or browser runtime errors.

To reproduce, start Console locally, then run:

```sh
PAX_CONFIG_CONSOLE_URL=http://127.0.0.1:3139 \
PAX_BROWSER_TEST_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
PAX_CONFIG_SCREENSHOTS=/tmp/pax-config-stage-review \
node scripts/config-admin-smoke.mjs
```

`PAX_BROWSER_TEST_EXECUTABLE` can be omitted when Playwright's Chromium is
installed. The script accepts only localhost or `127.0.0.1` Console URLs.
