# Microscopic LIS Upgrade

## Reliability
- Report creation is now atomic: patient + report + results + audit log are committed in one database transaction.
- Report editing is now atomic: patient + report + replacement results + audit log are committed together.
- Submit-for-review and approval are transactional with their audit log entries.
- This prevents partial laboratory records when a database operation fails midway.

## Result Review UX
- Added a prominent critical-result warning to the final review step.
- Critical results are listed by test name and entered value before the user issues/submits the report.
- Existing reference-range interpretation and flags remain unchanged.

## Validation note
- The source was updated and the ZIP was rebuilt.
- A full `npm ci`/TypeScript build could not be completed in the review environment because dependency installation exceeded the execution timeout.
