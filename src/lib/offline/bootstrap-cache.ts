/**
 * What the "new report" page needs to run with no connection: the lab
 * profile, the lab's test catalog and whether this user may create reports.
 * None of it is patient data. Cleared on sign-out.
 */
const KEY = "rajab:offline:bootstrap:v1";
const LAB_KEY = "rajab:offline:lab-id";

export interface NewReportBootstrap<L = unknown, C = unknown, G = unknown> {
  lab: L;
  catalog: C[];
  /** The lab's test groups (older saved copies have none). */
  groups: G[];
  canCreate: boolean;
  labId: string;
  savedAt: string;
}

export function saveBootstrap<L, C, G = unknown>(data: Omit<NewReportBootstrap<L, C, G>, "savedAt" | "groups"> & { groups?: G[] }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, groups: data.groups ?? [], savedAt: new Date().toISOString() }));
    localStorage.setItem(LAB_KEY, data.labId);
  } catch {
    /* storage full or blocked: offline mode just won't be available */
  }
}

export function loadBootstrap<L = unknown, C = unknown, G = unknown>(): NewReportBootstrap<L, C, G> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewReportBootstrap<L, C, G>;
    if (!parsed || !parsed.labId || !Array.isArray(parsed.catalog)) return null;
    return { ...parsed, groups: Array.isArray(parsed.groups) ? parsed.groups : [] };
  } catch {
    return null;
  }
}

export function getKnownLabId(): string | null {
  try {
    return localStorage.getItem(LAB_KEY);
  } catch {
    return null;
  }
}

export function setKnownLabId(labId: string): void {
  try {
    localStorage.setItem(LAB_KEY, labId);
  } catch {
    /* ignore */
  }
}

export function clearBootstrap(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LAB_KEY);
    localStorage.removeItem("rajab:offline:ready");
  } catch {
    /* ignore */
  }
}
