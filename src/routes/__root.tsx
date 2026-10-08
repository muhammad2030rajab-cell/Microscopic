import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";

import { AuthProvider } from "@/lib/auth/provider";
import { registerServiceWorker } from "@/lib/offline/sync";
import { installAndroidBackButton } from "@/lib/native-back";
import { NavProgress } from "@/components/nav-progress";

import appCss from "../styles.css?url";

const APP_NAME = "Microscopic System";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },

      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover",
      },

      {
        title: APP_NAME,
      },

      {
        name: "theme-color",
        content: "#0f2942",
      },

      {
        name: "description",
        content:
          "Microscopic System — نظام متكامل لإدارة معامل التحاليل الطبية",
      },
    ],

    links: [
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },

      {
        rel: "apple-touch-icon",
        href: "/icon-180.png",
      },

      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },

      {
        rel: "stylesheet",
        href: appCss,
      },

    ],

  }),

  component: RootComponent,
});

function RootComponent() {
  const router = useRouter();
  // Android app only: back goes one screen back, and leaving the app needs two presses on a home screen.
  useEffect(
    () =>
      installAndroidBackButton({
        pathname: () => router.state.location.pathname,
        goHome: () => void router.navigate({ to: "/lab" }),
        hint: () => toast("اضغط رجوع مرة تانية للخروج", { duration: 2000 }),
      }),
    [router],
  );

  useEffect(() => {
    registerServiceWorker(() => toast.success("التطبيق جاهز للعمل بدون إنترنت"));
  }, []);

  return (
    <html
      lang="ar"
      dir="rtl"
      className="antialiased"
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>

      <body>
        <AuthProvider>
          <NavProgress />
          <Outlet />

          <Toaster
            position="top-center"
            dir="rtl"
            toastOptions={{
              className: "font-sans",
            }}
          />
        </AuthProvider>

        <Scripts />
      </body>
    </html>
  );
}
