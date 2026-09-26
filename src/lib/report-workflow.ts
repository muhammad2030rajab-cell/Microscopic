export const reportStatusLabels = {
  draft: "مسودة",
  pending_review: "في انتظار المراجعة",
  approved: "معتمد",
  cancelled: "ملغي",
} as const;

export const reportStatusClasses = {
  draft: "bg-paper-2 text-muted",
  pending_review: "bg-high/10 text-high",
  approved: "bg-ok/10 text-ok",
  cancelled: "bg-muted/10 text-muted",
} as const;
