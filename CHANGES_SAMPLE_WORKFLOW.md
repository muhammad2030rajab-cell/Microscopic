# Sample Workflow Upgrade

- Added migration `0031_sample_workflow.sql` with a specimen lifecycle: registered -> collected -> received -> processing -> ready.
- Reuses the existing `sample_id` as the specimen/barcode identifier.
- Tracks collection, receipt, processing, and ready timestamps plus the staff member who collected the sample.
- Added a server-side transactional workflow transition with audit logging.
- Added a responsive sample workflow panel to the report page with barcode display, section/device field, next-step action, and barcode printing.
- Transitions are forward-only and permission-protected; offline report copies remain read-only.
