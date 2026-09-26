export type DriveStorageStatus = 'pending' | 'connected' | 'error';

export type LabDriveStorage = {
  labId: string;
  provider: 'google_drive';
  labFolderId: string | null;
  patientsFolderId: string | null;
  reportsFolderId: string | null;
  pdfFolderId: string | null;
  backupsFolderId: string | null;
  status: DriveStorageStatus;
  lastError: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};

export type DriveFileKind = 'patient' | 'report' | 'pdf' | 'backup';
