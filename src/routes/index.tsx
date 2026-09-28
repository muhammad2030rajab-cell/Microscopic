import { createFileRoute, Link } from "@tanstack/react-router";

import { FieldOfView } from "@/components/brand/field-of-view";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: WelcomePage,
});

const HIGHLIGHTS: Array<[string, string]> = [
  ["التقارير", "نتائج مرتبة بجانب المدى الطبيعي، وتنبيه واضح للقيم الحرجة"],
  ["المرضى", "سجل كامل لكل مريض وتقاريره السابقة"],
  ["الفريق", "صلاحيات مستقلة لكل موظف في المعمل"],
  ["التحقق", "رمز QR على التقرير يثبت أنه صادر من معملك"],
];

function WelcomePage() {
  return (
    <main dir="rtl" className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header>
          <span className="font-display text-lg font-semibold" dir="ltr">
            Microscopic System
          </span>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center gap-10 py-10 lg:flex-row lg:gap-16">
          <div className="w-full max-w-xl">
            <h1 className="font-display text-4xl font-semibold leading-[1.25] sm:text-5xl">
              تقارير معملك، منظمة وموثّقة
            </h1>

            <p className="mt-5 max-w-md text-base leading-8 text-ink-soft">
              سجّل بيانات المرضى، أدخل النتائج، واطبع تقريرًا رسميًا عليه رمز
              تحقق.
            </p>

            <Button asChild size="lg" className="mt-8 w-full sm:w-auto sm:min-w-52">
              <Link to="/login">تسجيل الدخول</Link>
            </Button>

            <dl className="mt-10 max-w-md divide-y divide-line border-y border-ink/70">
              {HIGHLIGHTS.map(([term, detail]) => (
                <div key={term} className="flex gap-4 py-3 text-sm">
                  <dt className="w-16 shrink-0 font-semibold">{term}</dt>
                  <dd className="leading-6 text-muted">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="order-first w-full max-w-[19rem] lg:order-none lg:max-w-md">
            <FieldOfView className="h-auto w-full drop-shadow-[0_24px_30px_rgba(12,34,48,0.18)]" />
          </div>
        </section>

        <footer className="border-t border-line pt-4 text-center text-sm text-muted">
          <p>
            فكرة وتصميم وتطوير{" "}
            <span className="font-semibold text-ink">د/ محمد رجب</span>
            ، أخصائي التحاليل الطبية
          </p>
        </footer>
      </div>
    </main>
  );
}
