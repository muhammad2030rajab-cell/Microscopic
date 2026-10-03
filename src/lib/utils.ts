import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function formatArDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatEnDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatSlashDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd} / ${mm} / ${d.getFullYear()}`;
}

export function visitIdFrom(id: string) {
  let n = 0;
  for (const ch of id) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return String(n).padStart(10, "0").slice(-10);
}

/** Today's items show the time, older ones the date — what a lab tech scans a list for. */
export function formatListDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) {
      return `اليوم ${new Intl.DateTimeFormat("ar-EG", { hour: "numeric", minute: "2-digit" }).format(d)}`;
    }
  } catch {
    /* fall through to the plain date */
  }
  return formatArDate(iso);
}
