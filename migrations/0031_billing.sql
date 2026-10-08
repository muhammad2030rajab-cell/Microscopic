-- Prices, invoices and payments. Additive only: nothing changes for a lab that never sets a price.
-- price: per test, per lab (null = not priced, counts as 0).
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS price numeric(10,2) CHECK (price IS NULL OR (price >= 0 AND price <= 10000000));
-- total_price: sum of the entered tests' prices when the report was saved (a snapshot: later price changes do not rewrite old invoices).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS total_price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS discount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);

CREATE TABLE IF NOT EXISTS report_payments (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  report_id text NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount > 0 AND amount <= 10000000),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'card', 'transfer', 'other')),
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS report_payments_report_idx ON report_payments (report_id);
CREATE INDEX IF NOT EXISTS report_payments_lab_day_idx ON report_payments (lab_id, created_at);
