# Rajab Diagnostics — V1 Candidate

## Included
- Platform admin bootstrap and multi-lab management
- Lab login and lab-scoped data isolation
- Lab roles: owner / technician / reviewer / viewer
- Team user management
- Lab profile settings stored in database
- Patient creation, search and reuse
- Patient/report identifiers and sample identifiers
- Database-backed report creation and archive
- Test catalog per lab with units/reference ranges and active/inactive state
- Catalog enforcement during report creation
- Draft → pending review → approved/cancelled workflow
- Draft editing with server-side status locks
- Audit logging for key report/team/catalog actions
- Report archive search and status filters
- A4/print-oriented report view
- Existing medical interpretation, calculated tests, flags and critical-value logic retained

## Verification status
The source package was reviewed and packaged. A full npm install/build/typecheck could not be completed in this environment because dependency installation timed out. Therefore this package is a V1 candidate and has not been represented as a fully build-verified release.

## Next production hardening
- Run dependency install and full build/typecheck/lint/tests in a normal development/CI environment.
- Regenerate TanStack route tree during the build rather than relying on the manually maintained generated file.
- Verify Better Auth server-side user creation against the installed Better Auth version.
- Add robust rollback for an auth-user created before an application DB insert fails.
- Harden first-admin bootstrap after the first platform admin is claimed.
- Add production database backups, logging/monitoring and deployment configuration.
