/**
 * What the "new report" page needs to run with no connection: the lab
 * profile, the lab's test catalog and whether this user may create reports.
 * None of it is patient data. Cleared on sign-out.
 */
const KEY = "rajab:offline:bootstrap:v1";
const LAB_KEY = "rajab:offline:lab-id";

export interface NewReportBootstrap<L = unknown, C = unknown> {
  lab: L;
  catalog: C[];
  canCreate: boolean;
  labId: string;
  savedAt: string;
}

export function saveBootstrap<L, C>(data: Omit<NewReportBootstrap<L, C>, "savedAt">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
    localStorage.setItem(LAB_KEY, data.labId);
  } catch {
    /* storage full or blocked: offline mode just won't be available */
  }
}

export function loadBootstrap<L = unknown, C = unknown>(): NewReportBootstrap<L, C> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NewReportBootstrap<L, C>;
    return parsed && parsed.labId && Array.isArray(parsed.catalog) ? parsed : null;
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
