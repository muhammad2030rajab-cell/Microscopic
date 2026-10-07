# Microscopic Dashboard Upgrade

## Version: Operations Center

### What changed
- Upgraded the laboratory home screen into an actionable **Lab Operations Center**.
- Added a four-stage workflow: patient intake, result entry, review, and approval.
- Added quick actions for patient search, pending review, and critical results.
- Added explicit online/offline state to the operations center.
- Kept all displayed counters sourced from the existing dashboard statistics; no synthetic patient/report numbers were introduced.
- Preserved existing permissions: report creation, report viewing, and team access remain permission-gated.
- Reused existing report filters so workflow cards open the relevant archive view directly.

### Important validation note
The source was updated and the archive was integrity-checked. A full `npm ci` / `typecheck` / `build` could not be completed in the review environment because dependency installation exceeded the execution time limit.

Recommended local validation:

```bash
npm ci
npm run typecheck
npm test
npm run build
```
