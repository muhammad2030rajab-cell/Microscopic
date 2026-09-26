-- Google Drive storage metadata.
-- The core application database remains the source of truth for identity,
-- authentication, permissions and lab configuration. Drive is optional storage
-- for lab documents/data backups and can be enabled without changing existing rows.

create table if not exists lab_drive_storage (
  lab_id text primary key references labs(id) on delete cascade,
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  lab_folder_id text,
  patients_folder_id text,
  reports_folder_id text,
  pdf_folder_id text,
  backups_folder_id text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error')),
  last_error text,
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists lab_drive_storage_status_idx
  on lab_drive_storage(status);

alter table patients
  add column if not exists drive_file_id text;

alter table reports
  add column if not exists drive_file_id text;

create index if not exists patients_drive_file_id_idx
  on patients(drive_file_id)
  where drive_file_id is not null;

create index if not exists reports_drive_file_id_idx
  on reports(drive_file_id)
  where drive_file_id is not null;
