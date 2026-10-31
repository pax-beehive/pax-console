# Search and Secretary integration with current main

This integrates the search, automatic Secretary settings, and published summary
progress work with Console main `ceac263`. The earlier feature handoffs describe
the API contracts and initial real-stack verification:

- [Workspace search](handoff_20261031_search.md)
- [Secretary settings and progress](handoff_20261031_secretary_settings.md)

The current Settings workspace remains the navigation source of truth. Secretary
is its ninth catalog section, appears in the mobile Settings directory, and uses
the shared page header and mobile back link. The older horizontal settings tabs
were removed during integration. Project panes, resource pages, notification
settings, sidebar collapse preferences, and mobile viewport/safe-area handling
retain current main behavior. Administrator mobile navigation keeps Customers
and Collaboration alongside Search.

WorkOS login/logout, RegionGate, the same-origin REST proxy, and regional routing
remain unchanged. The new API hooks use authenticated user IDs in their cache
keys. Search additionally hides cached hits and its selected source if a refresh
fails authentication; an explicit sign-in link replaces those results.

The current main Switch and SearchBox primitives are reused. No dependency or
lockfile changes are needed. The change set contains source, tests, browser
runners, and documentation; screenshots and generated artifacts remain in
private temporary directories. A bounded credential-pattern scan found no
candidates.

The existing Settings browser regression now covers all nine sections at desktop
and mobile widths with explicitly fictional account/API responses. The search
and Secretary smoke runners continue to use the real isolated Manager fixture;
they do not mock feature requests or invoke a real user agent.

Verification results for the integrated tree will be recorded after the final
checks and real-stack browser run complete.
