/**
 * Android back button inside the installed app (Capacitor).
 *
 * Without this the WebView does its own thing: a press on the first screen closes the app, and a press after a
 * redirect can drop the person back on the launcher. The rules here:
 *   - on a home screen (dashboard / login): press twice within 2 s to leave, the first press only shows a hint;
 *   - on any other screen: go back one screen inside the app, or to the dashboard when there is nothing to go back to.
 * In a normal browser or the installed PWA there is no Capacitor, so this does nothing.
 */
type PluginHandle = { remove?: () => void | Promise<void> };
type AppPlugin = {
  addListener?: (event: "backButton", cb: (e: { canGoBack?: boolean }) => void) => Promise<PluginHandle> | PluginHandle;
  exitApp?: () => Promise<void> | void;
};
type CapacitorLike = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, AppPlugin | undefined>;
  registerPlugin?: (name: string) => AppPlugin;
};

const HOME_PATHS = new Set(["/", "/lab", "/login"]);

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** True inside the Android app or an installed (home-screen) PWA: the "install the app" advice makes no sense there. */
export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeApp()) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/** True when the router history has an earlier screen of this app (TanStack Router numbers its entries from 0). */
export function hasEarlierScreen(): boolean {
  const index = (window.history.state as { __TSR_index?: number } | null)?.__TSR_index;
  return typeof index === "number" && index > 0;
}

export function isHomePath(pathname: string): boolean {
  return HOME_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}

export function installAndroidBackButton(opts: { pathname: () => string; goHome: () => void; hint: () => void }): () => void {
  if (!isNativeApp()) return () => {};
  const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
  let app: AppPlugin | undefined;
  try {
    app = cap?.Plugins?.App ?? cap?.registerPlugin?.("App");
  } catch {
    app = undefined;
  }
  if (!app?.addListener) return () => {};

  let lastPress = 0;
  let removed = false;
  let handle: PluginHandle | null = null;
  const exitApp = app.exitApp?.bind(app);

  Promise.resolve(
    app.addListener("backButton", () => {
      if (isHomePath(opts.pathname())) {
        const now = Date.now();
        if (now - lastPress < 2000) {
          void exitApp?.();
          return;
        }
        lastPress = now;
        opts.hint();
        return;
      }
      if (hasEarlierScreen()) window.history.back();
      else opts.goHome();
    }),
  )
    .then((h) => {
      handle = h;
      if (removed) void h?.remove?.();
    })
    .catch(() => {});

  return () => {
    removed = true;
    void handle?.remove?.();
  };
}
