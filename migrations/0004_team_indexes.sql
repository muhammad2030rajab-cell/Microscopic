create index if not exists lab_users_lab_active_idx on lab_users(lab_id, is_active);
create index if not exists lab_users_role_idx on lab_users(role);
