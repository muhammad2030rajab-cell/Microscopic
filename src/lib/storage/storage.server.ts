import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { assertPlatformAdmin } from "@/lib/storage/storage-permissions.server";
import {
  ensureLabDriveFolders,
  getLabDriveStorage,
  isGoogleDriveConfigured,
  uploadJsonFile,
} from "./google-drive.server";

/* =========================================================
   DRIVE STATUS
========================================================= */

export const getDriveStatus = createServerFn({
  method: "GET",
})
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await assertPlatformAdmin(context.userId);

    const labs = await sql<{
      id: string;
      name: string;
      is_active: boolean;
    }>`
      select
        id,
        name,
        is_active
      from labs
      order by created_at asc
    `;

    const storage = await Promise.all(
      labs.map(async (lab) => ({
        labId: lab.id,
        labName: lab.name,
        isActive: lab.is_active,
        storage: await getLabDriveStorage(lab.id),
      })),
    );

    return {
      configured: isGoogleDriveConfigured(),
      labs: storage,
    };
  });

/* =========================================================
   INITIALIZE LAB DRIVE
========================================================= */

export const initializeLabDrive = createServerFn({
  method: "POST",
})
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }: {
      context: { userId: string };
      data: { labId: string };
    }) => {
      const sql = await assertPlatformAdmin(context.userId);

      const labs = await sql<{
        id: string;
        name: string;
      }>`
        select
          id,
          name
        from labs
        where id = ${data.labId}
        limit 1
      `;

      if (!labs.length) {
        throw new Error("LAB_NOT_FOUND");
      }

      return ensureLabDriveFolders(
        labs[0].id,
        labs[0].name,
      );
    },
  );

/* =========================================================
   SAVE PATIENT TO GOOGLE DRIVE
========================================================= */

export async function savePatientToDrive(options: {
  labId: string;
  patientId: string;
  patientCode?: string | null;
  fullName: string;
  age: number;
  gender: "ذكر" | "أنثى";
  phone?: string | null;
  notes?: string | null;
  existingFileId?: string | null;
}) {
  const storage = await getLabDriveStorage(
    options.labId,
  );

  /*
   * Google Drive غير مهيأ للمعمل.
   * لا نوقف إنشاء المريض؛ فقط نرجع حالة pending.
   */
  if (
    !storage ||
    storage.status !== "connected" ||
    !storage.patientsFolderId
  ) {
    return {
      status: "pending" as const,
      fileId: null,
    };
  }

  const safePatient = {
    id: options.patientId,
    patientCode: options.patientCode || null,
    fullName: options.fullName,
    age: options.age,
    gender: options.gender,
    phone: options.phone || null,
    notes: options.notes || null,

    /*
     * لا يتم تخزين الرقم القومي داخل ملف Drive الخاص
     * بالمريض من خلال هذه الطبقة.
     */
    syncedAt: new Date().toISOString(),
  };

  const fileName =
    `patient-${options.patientId}.json`;

  try {
    const file = await uploadJsonFile({
      folderId: storage.patientsFolderId,
      name: fileName,
      data: safePatient,
      existingFileId:
        options.existingFileId || null,
    });

    return {
      status: "synced" as const,
      fileId: file.id,
    };
  } catch (error) {
    console.error(
      "Failed to save patient to Google Drive:",
      error,
    );

    return {
      status: "failed" as const,
      fileId: null,
    };
  }
}

/* =========================================================
   GET LAB DRIVE STORAGE
========================================================= */

export async function getStorageForLab(
  labId: string,
) {
  return getLabDriveStorage(labId);
}
