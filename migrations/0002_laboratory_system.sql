-- Multi-laboratory application schema.
-- Each lab is isolated by lab_id. Application queries MUST enforce this server-side.

create table if not exists labs (
  id text primary key,
  name text not null,
  name_en text,
  logo_url text,
  phone text,
  whatsapp text,
  email text,
  website text,
  address text,
  doctor_name text,
  doctor_degree text,
  doctor_specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists lab_users (
  id text primary key,
  lab_id text not null references labs(id) on delete cascade,
  auth_user_id text unique references "user"("id") on delete cascade,
  username text not null unique,
  role text not null default 'technician' check (role in ('owner', 'technician', 'reviewer', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists patients (
  id text primary key,
  lab_id text not null references labs(id) on delete cascade,
  patient_code text,
  full_name text not null,
  age integer,
  gender text check (gender in ('ذكر', 'أنثى')),
  phone text,
  national_id text,
  notes text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (lab_id, patient_code)
);

create table if not exists reports (
  id text primary key,
  lab_id text not null references labs(id) on delete cascade,
  patient_id text not null references patients(id) on delete restrict,
  sample_id text,
  referring_doctor text,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'approved', 'cancelled')),
  notes text,
  created_by text references lab_users(id) on delete set null,
  reviewed_by text references lab_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create table if not exists report_results (
  id text primary key,
  report_id text not null references reports(id) on delete cascade,
  test_id text not null,
  test_name text not null,
  category_id text,
  category_ar text,
  category_en text,
  result_value text,
  unit text,
  reference_range text,
  flag text check (flag in ('normal', 'low', 'high', 'abnormal', 'critical')),
  interpretation text,
  sort_order integer not null default 0
);

create table if not exists audit_logs (
  id text primary key,
  lab_id text references labs(id) on delete cascade,
  actor_user_id text references lab_users(id) on delete set null,
  actor_auth_user_id text references "user"("id") on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata_json text,
  created_at timestamptz not null default current_timestamp
);

create index if not exists lab_users_lab_id_idx on lab_users(lab_id);
create index if not exists patients_lab_id_idx on patients(lab_id);
create index if not exists reports_lab_id_idx on reports(lab_id);
create index if not exists reports_patient_id_idx on reports(patient_id);
create index if not exists reports_created_at_idx on reports(created_at);
create index if not exists report_results_report_id_idx on report_results(report_id);
create index if not exists audit_logs_lab_id_idx on audit_logs(lab_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at);
