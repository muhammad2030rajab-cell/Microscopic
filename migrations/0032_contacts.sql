-- Referring doctors and clients (clinics, centers, companies) of a lab. Additive only: nothing changes for existing data.
CREATE TABLE IF NOT EXISTS lab_contacts (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('doctor', 'client')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  specialty text CHECK (specialty IS NULL OR char_length(specialty) <= 120),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS lab_contacts_lab_kind_idx ON lab_contacts (lab_id, kind, name);
