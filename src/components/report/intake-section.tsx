import { CLINICAL_FLAGS, SAMPLE_TYPES, type ClinicalFlagKey, type Intake, type SampleTypeKey } from "@/lib/report-intake";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-3.5 text-sm transition-colors",
        on ? "border-ink bg-ink text-paper" : "border-line bg-elevated text-ink-soft hover:border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/**
 * Registration details the front desk records on paper: sample types, fasting, clinical questions,
 * referring entity. Collapsed by default so the fast path (name, age, phone) stays short.
 */
export function IntakeSection({ intake, onChange, gender }: { intake: Intake; onChange: (next: Intake) => void; gender: string }) {
  const set = (patch: Partial<Intake>) => onChange({ ...intake, ...patch });
  const filled = intake.sampleTypes.length + intake.flags.length + (intake.fasting ? 1 : 0) + (intake.referral ? 1 : 0) + (intake.vip ? 1 : 0) + (intake.takenOutside ? 1 : 0);
  const flags = CLINICAL_FLAGS.filter((f) => f.key !== "pregnant" || gender !== "ذكر");

  return (
    <details className="group app-card sm:col-span-2" open={filled > 0}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium">
        <span>بيانات العينة والحالة <span className="text-xs font-normal text-muted">(اختياري)</span></span>
        {filled > 0 ? <span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs text-teal">{filled}</span> : null}
      </summary>

      <div className="space-y-5 border-t border-line p-4">
        <div>
          <p className="mb-2 text-xs font-medium text-ink-soft">نوع العينة</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TYPES.map((s) => (
              <Chip key={s.key} on={intake.sampleTypes.includes(s.key as SampleTypeKey)} onClick={() => set({ sampleTypes: toggle(intake.sampleTypes, s.key as SampleTypeKey) })}>
                {s.ar}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Chip on={intake.fasting} onClick={() => set({ fasting: !intake.fasting, fastingHours: intake.fasting ? null : intake.fastingHours })}>صائم</Chip>
          {intake.fasting ? (
            <div className="w-32">
              <Label htmlFor="fastHours">عدد ساعات الصيام</Label>
              <Input
                id="fastHours"
                inputMode="numeric"
                value={intake.fastingHours ?? ""}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, ""));
                  set({ fastingHours: Number.isFinite(n) && n > 0 ? Math.min(72, n) : null });
                }}
                placeholder="12"
              />
            </div>
          ) : null}
        </div>

        <div>
          <Label htmlFor="referral">جهة الإحالة (مستشفى / عيادة / شركة)</Label>
          <Input id="referral" value={intake.referral} maxLength={80} onChange={(e) => set({ referral: e.target.value })} />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-ink-soft">أسئلة إكلينيكية</p>
          <p className="mb-2 text-[11px] text-muted">للموظفين بس، مش بتتطبع في التقرير.</p>
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <Chip key={f.key} on={intake.flags.includes(f.key as ClinicalFlagKey)} onClick={() => set({ flags: toggle(intake.flags, f.key as ClinicalFlagKey) })}>
                {f.ar}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip on={intake.vip} onClick={() => set({ vip: !intake.vip })}>VIP</Chip>
          <Chip on={intake.takenOutside} onClick={() => set({ takenOutside: !intake.takenOutside })}>العينة اتسحبت خارج المعمل</Chip>
        </div>
      </div>
    </details>
  );
}
