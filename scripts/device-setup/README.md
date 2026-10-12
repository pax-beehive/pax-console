# Installer regression

Build the renderer from the matching Manager worktree using its required Go
version (load gvm, run gvm list, select Go 1.26):

```sh
GOWORK=off go build -o /tmp/pax-setup-renderer ./internal/manager/paxd/testdata/render_setup
```

From Console, run with Node 24:

```sh
PAX_SETUP_RENDERER=/tmp/pax-setup-renderer \
PAXD_INSTALLER=/absolute/path/to/paxd/scripts/installer.sh \
PAX_SETUP_REPORT=/tmp/device-setup-results.json \
node scripts/device-setup/e2e.mjs
```

This executes the real Console command builder, rendered Manager bootstrap, and
paxd installer with real curl/Bash against local HTTP servers. Artifact binaries
and registration services are fixtures. Platform detection is simulated for
Darwin/Linux amd64; this is not a Linux host or production enrollment test.
Temporary homes isolate installed files. Tests never start an OS daemon or use
real account tokens. Cases cover separate regional endpoints, browser sign-in,
expired/consumed tokens, HTML/empty/partial downloads, checksum failures, artifact
403 and bootstrap 503. Assertions include exit status, registration destination,
secret-free requests/output, and cleanup.
