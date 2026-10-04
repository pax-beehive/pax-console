# Image build and Release registration

The Publish image workflow builds linux/amd64 from the exact main commit,
pushes ghcr.io/pax-beehive/pax-console:git-<commit>, pulls the immutable digest,
checks its platform and revision label, then registers that digest with
https://release.paxworkspace.net/api/v1/artifacts.

A push to main triggers the workflow. The existing Dockerfile runs the
production Next.js build before any image is pushed.
The main-only workflow_dispatch entry also supports an explicit first run.
No workflow starts a production deployment.

GitHub's job-scoped GITHUB_TOKEN has packages:write for GHCR publication.
PAX_RELEASE_PUBLISHER_TOKEN is an Actions secret containing the existing
registration-only Release credential. It must never appear in source, logs,
image build arguments, or uploaded workflow artifacts. 

The registration record is uploaded as release-image-<commit> before calling
Release. If registration fails, download artifact.json from that run and use
the existing pax-release register-artifact command with that saved record and
a local publisher token file. This retries the same digest without rebuilding.
HTTP redirects, non-200/201 statuses and mismatched acknowledgements fail the job.

A registered image is a build output, not evidence of a production rollout.
Private GHCR packages require read credentials on deployment agents; runner
pull verification does not prove that agent registry credentials are configured.

Validation before enabling: workflow syntax and shell parsing, plus 16 isolated
registration scenarios across both product workflows (201/200, redirect,
unauthorized, server error, wrong digest, non-integer ID, HTML response).
Fixtures checked failure retention and that the credential is never logged.
