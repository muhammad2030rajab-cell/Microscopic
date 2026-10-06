-- Speed-only indexes (no data or behaviour change; safe to re-run).
-- Archive / home screen: "this lab's reports, newest first" can now be read straight off one index
-- instead of filtering by lab and then sorting.
CREATE INDEX IF NOT EXISTS reports_lab_created_idx ON reports (lab_id, created_at DESC);
-- Per-report "how many flagged / critical" counts can be answered from the index alone.
CREATE INDEX IF NOT EXISTS report_results_report_flag_idx ON report_results (report_id, flag);
