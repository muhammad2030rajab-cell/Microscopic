-- The approval workflow was removed: every saved report is final straight away.
-- Reports that were still drafts / waiting for review become regular reports; cancelled ones stay cancelled.
update reports
   set status = 'approved',
       approved_at = coalesce(approved_at, updated_at, created_at)
 where status in ('draft', 'pending_review');
