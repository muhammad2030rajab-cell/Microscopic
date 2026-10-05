import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster, toast } from "sonner";

import { AuthProvider } from "@/lib/auth/provider";
import { registerServiceWorker } from "@/lib/offline/sync";

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
        content: "#f8fafc",
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

      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },

      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },

    ],

    scripts: [
      {
        children:
          '(function(){var l=document.createElement("link");l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap";document.head.appendChild(l);})();',
      },
    ],
  }),

  component: RootComponent,
});

function RootComponent() {
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
