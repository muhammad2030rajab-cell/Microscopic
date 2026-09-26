import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstall = Event & { prompt: () => Promise<void> };

export function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstall | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setStandalone(isStandalone);
    setIos(/iphone|ipad|ipod/i.test(nav.userAgent));

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setStandalone(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone) return null;

  return (
    <aside className="mt-6 rounded-lg border border-line bg-elevated p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-teal text-teal-fg">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">ثبّت التطبيق على هاتفك</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            يفتح من الشاشة الرئيسية بدون متصفح — نفس تقارير المختبر على الموبايل.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {promptEvent ? (
              <Button
                type="button"
                onClick={async () => {
                  await promptEvent.prompt();
                  setPromptEvent(null);
                }}
              >
                <Download className="size-4" />
                تثبيت الآن
              </Button>
            ) : ios ? (
              <Button type="button" variant="secondary" onClick={() => setShowIos((v) => !v)}>
                <Share className="size-4" />
                خطوات الآيفون
              </Button>
            ) : (
              <Button type="button" variant="secondary" asChild>
                <a href="/?install=1">
                  <Download className="size-4" />
                  دليل التثبيت
                </a>
              </Button>
            )}
          </div>
          {showIos ? (
            <ol className="mt-3 list-decimal space-y-1 pe-5 text-sm text-ink-soft">
              <li>افتح الصفحة من سفاري (ليس كروم).</li>
              <li>
                اضغط زر المشاركة <Share className="mx-0.5 inline size-3.5" /> أسفل الشاشة.
              </li>
              <li>اختر «إضافة إلى الشاشة الرئيسية» ثم إضافة.</li>
            </ol>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
