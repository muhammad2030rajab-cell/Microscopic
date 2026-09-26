import { randomUUID } from 'node:crypto';
import { getSql } from '@/lib/db';
import { env } from '@/lib/env.server';
import type { LabDriveStorage } from './storage.types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_API = 'https://oauth2.googleapis.com/token';

function googleDriveConfigured() {
  return Boolean(
    env('GOOGLE_DRIVE_CLIENT_ID') &&
      env('GOOGLE_DRIVE_CLIENT_SECRET') &&
      env('GOOGLE_DRIVE_REFRESH_TOKEN'),
  );
}

export function isGoogleDriveConfigured() {
  return googleDriveConfigured();
}

async function getAccessToken() {
  const clientId = env('GOOGLE_DRIVE_CLIENT_ID');
  const clientSecret = env('GOOGLE_DRIVE_CLIENT_SECRET');
  const refreshToken = env('GOOGLE_DRIVE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_DRIVE_NOT_CONFIGURED');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_API, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GOOGLE_TOKEN_ERROR:${response.status}:${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('GOOGLE_ACCESS_TOKEN_MISSING');
  return data.access_token;
}

async function driveRequest<T>(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GOOGLE_DRIVE_ERROR:${response.status}:${text.slice(0, 500)}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function escapeDriveQuery(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

async function findFolder(name: string, parentId?: string) {
  const parent = parentId || 'root';
  const q = [
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    `'${escapeDriveQuery(parent)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
  ].join(' and ');

  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    pageSize: '10',
    spaces: 'drive',
  });

  const result = await driveRequest<{ files?: { id: string; name: string }[] }>(
    `/files?${params.toString()}`,
  );
  return result.files?.[0]?.id || null;
}

async function createFolder(name: string, parentId?: string) {
  return driveRequest<{ id: string; name: string }>('/files', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

async function ensureFolder(name: string, parentId?: string) {
  const existing = await findFolder(name, parentId);
  if (existing) return existing;
  return (await createFolder(name, parentId)).id;
}

async function getOrCreateRootFolder() {
  const configuredRoot = env('GOOGLE_DRIVE_ROOT_FOLDER_ID');
  if (configuredRoot) return configuredRoot;
  return ensureFolder('Microscopic Data');
}

export async function ensureLabDriveFolders(labId: string, labName: string) {
  const sql = await getSql();

  if (!googleDriveConfigured()) {
    await sql.query(
      `insert into lab_drive_storage (lab_id, status, last_error)
       values ($1, 'pending', 'Google Drive credentials are not configured')
       on conflict (lab_id) do update set
         status='pending',
         last_error=excluded.last_error,
         updated_at=current_timestamp`,
      [labId],
    );
    return { status: 'pending' as const };
  }

  try {
    const rootId = await getOrCreateRootFolder();
    const labFolderId = await ensureFolder(`${labName} [${labId.slice(0, 8)}]`, rootId);
    const patientsFolderId = await ensureFolder('patients', labFolderId);
    const reportsFolderId = await ensureFolder('reports', labFolderId);
    const pdfFolderId = await ensureFolder('pdf', labFolderId);
    const backupsFolderId = await ensureFolder('backups', labFolderId);

    await sql.query(
      `insert into lab_drive_storage
        (lab_id, lab_folder_id, patients_folder_id, reports_folder_id,
         pdf_folder_id, backups_folder_id, status, last_error, connected_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,'connected',null,current_timestamp,current_timestamp)
       on conflict (lab_id) do update set
         lab_folder_id=excluded.lab_folder_id,
         patients_folder_id=excluded.patients_folder_id,
         reports_folder_id=excluded.reports_folder_id,
         pdf_folder_id=excluded.pdf_folder_id,
         backups_folder_id=excluded.backups_folder_id,
         status='connected',
         last_error=null,
         connected_at=coalesce(lab_drive_storage.connected_at, current_timestamp),
         updated_at=current_timestamp`,
      [labId, labFolderId, patientsFolderId, reportsFolderId, pdfFolderId, backupsFolderId],
    );

    return {
      status: 'connected' as const,
      labFolderId,
      patientsFolderId,
      reportsFolderId,
      pdfFolderId,
      backupsFolderId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Google Drive error';
    await sql.query(
      `insert into lab_drive_storage (lab_id, status, last_error)
       values ($1, 'error', $2)
       on conflict (lab_id) do update set
         status='error',
         last_error=excluded.last_error,
         updated_at=current_timestamp`,
      [labId, message.slice(0, 1000)],
    );
    throw error;
  }
}

export async function getLabDriveStorage(labId: string): Promise<LabDriveStorage | null> {
  const sql = await getSql();
  const rows = await sql<{
    lab_id: string;
    provider: 'google_drive';
    lab_folder_id: string | null;
    patients_folder_id: string | null;
    reports_folder_id: string | null;
    pdf_folder_id: string | null;
    backups_folder_id: string | null;
    status: LabDriveStorage['status'];
    last_error: string | null;
    connected_at: string | Date | null;
    last_sync_at: string | Date | null;
  }>`
    select lab_id, provider, lab_folder_id, patients_folder_id,
           reports_folder_id, pdf_folder_id, backups_folder_id,
           status, last_error, connected_at, last_sync_at
    from lab_drive_storage
    where lab_id = ${labId}
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    labId: row.lab_id,
    provider: row.provider,
    labFolderId: row.lab_folder_id,
    patientsFolderId: row.patients_folder_id,
    reportsFolderId: row.reports_folder_id,
    pdfFolderId: row.pdf_folder_id,
    backupsFolderId: row.backups_folder_id,
    status: row.status,
    lastError: row.last_error,
    connectedAt: row.connected_at ? String(row.connected_at) : null,
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
  };
}

export async function uploadJsonFile(options: {
  folderId: string;
  name: string;
  data: unknown;
  existingFileId?: string | null;
}) {
  const token = await getAccessToken();
  const json = JSON.stringify(options.data, null, 2);

  if (options.existingFileId) {
    const response = await fetch(
      `${UPLOAD_API}/files/${encodeURIComponent(options.existingFileId)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json; charset=utf-8',
        },
        body: json,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GOOGLE_DRIVE_UPLOAD_ERROR:${response.status}:${text.slice(0, 500)}`);
    }

    return (await response.json()) as { id: string };
  }

  const boundary = `microscopic_${randomUUID()}`;
  const metadata = JSON.stringify({
    name: options.name,
    parents: [options.folderId],
    mimeType: 'application/json',
  });
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const response = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GOOGLE_DRIVE_UPLOAD_ERROR:${response.status}:${text.slice(0, 500)}`);
  }

  return (await response.json()) as { id: string; name: string; webViewLink?: string };
}
