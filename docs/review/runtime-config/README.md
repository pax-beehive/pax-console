# Runtime configuration UI verification

These screenshots show the production build of `/admin/config`, using explicitly fictional API contract fixtures. No real Manager configuration was read or changed. They verify Console rendering and interactions; they do not prove that a deployed regional gateway or Manager implements the companion endpoints.

The browser check passed in English and Simplified Chinese at 1440×1080 and 390×844. It exercises feature navigation, a sequential two-region save with US success and HK conflict, service settings, and audit history, while checking for runtime errors and horizontal overflow. Unit tests cover the additional reset, revert, confirmation, cache, permission, and secret-handling paths.

| Language / width   | Features                               | Editor / partial result                               | Service settings                       | Change history                      |
| ------------------ | -------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| English / desktop  | [View](config-en-1440-features.png)    | [View](config-en-1440-editor-partial-conflict.png)    | [View](config-en-1440-settings.png)    | [View](config-en-1440-audit.png)    |
| English / phone    | [View](config-en-390-features.png)     | [View](config-en-390-editor-partial-conflict.png)     | [View](config-en-390-settings.png)     | [View](config-en-390-audit.png)     |
| 简体中文 / desktop | [查看](config-zh-CN-1440-features.png) | [查看](config-zh-CN-1440-editor-partial-conflict.png) | [查看](config-zh-CN-1440-settings.png) | [查看](config-zh-CN-1440-audit.png) |
| 简体中文 / phone   | [查看](config-zh-CN-390-features.png)  | [查看](config-zh-CN-390-editor-partial-conflict.png)  | [查看](config-zh-CN-390-settings.png)  | [查看](config-zh-CN-390-audit.png)  |

To repeat against an already running local Console:

```sh
PAX_CONFIG_CONSOLE_URL=http://localhost:3129 \
PAX_CONFIG_SCREENSHOTS=/tmp/pax-config-screenshots \
PAX_BROWSER_TEST_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/config-admin-smoke.mjs
```

The script accepts only localhost/127.0.0.1. Its browser API interception supplies contract fixtures and never forwards writes to a real Manager.

The companion Manager deployment must expose the contract's `vault_configured` and secret registry entries, and its regional gateway must route `/api/v1/admin/config` with the existing `region=us|hk` selector and administrator identity checks. Console validates snapshot regions and does not add a direct Manager request path. An older Manager's features 404 uses the previous administrator visibility policy; unavailable configuration APIs remain an explicit page error.
