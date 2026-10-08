-- Lab devices (analyzers, centrifuges, fridges...) and consumable supplies (reagents, tubes, kits...) with stock movements.
-- Additive only: nothing changes for a lab that never opens the page.
CREATE TABLE IF NOT EXISTS lab_devices (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  model text CHECK (model IS NULL OR char_length(model) <= 120),
  serial_no text CHECK (serial_no IS NULL OR char_length(serial_no) <= 80),
  location text CHECK (location IS NULL OR char_length(location) <= 120),
  status text NOT NULL DEFAULT 'working' CHECK (status IN ('working', 'maintenance', 'out_of_service')),
  purchase_date date,
  warranty_until date,
  last_service_date date,
  next_service_date date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS lab_devices_lab_idx ON lab_devices (lab_id, name);

CREATE TABLE IF NOT EXISTS lab_supplies (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  unit text CHECK (unit IS NULL OR char_length(unit) <= 30),
  quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0 AND quantity <= 1000000000),
  min_quantity numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0 AND min_quantity <= 1000000000),
  expiry_date date,
  lot_no text CHECK (lot_no IS NULL OR char_length(lot_no) <= 60),
  supplier text CHECK (supplier IS NULL OR char_length(supplier) <= 120),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  updated_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS lab_supplies_lab_idx ON lab_supplies (lab_id, name);

-- One row per stock change (received / used / corrected), so the balance can always be explained.
CREATE TABLE IF NOT EXISTS lab_supply_moves (
  id text PRIMARY KEY,
  lab_id text NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  supply_id text NOT NULL REFERENCES lab_supplies(id) ON DELETE CASCADE,
  delta numeric(12,2) NOT NULL CHECK (delta <> 0),
  kind text NOT NULL CHECK (kind IN ('in', 'out', 'adjust')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT current_timestamp
);
CREATE INDEX IF NOT EXISTS lab_supply_moves_supply_idx ON lab_supply_moves (supply_id, created_at DESC);
