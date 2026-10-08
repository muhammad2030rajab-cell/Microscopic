// Electron wrapper for the lab's local program (HUB.md).
// Starts scripts/hub-start.mjs (the gateway + app) with Electron's own Node, waits until it answers,
// then shows it in a window. Data stays in %USERPROFILE%\MicroscopicHub, exactly like hub-start.bat.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const PORT = Number(process.env.HUB_PORT) || 8080;
const BASE = `http://localhost:${PORT}`;
// Packaged: resources/hub.  Dev (npm start in desktop/): the repo root, after `npm run hub:build`.
const hubDir = app.isPackaged ? path.join(process.resourcesPath, "hub") : path.resolve(__dirname, "..");
const dataDir = path.resolve(process.env.HUB_HOME || path.join(os.homedir(), "MicroscopicHub"));

let child = null;
let win = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function startHub() {
  const script = path.join(hubDir, "scripts", "hub-start.mjs");
  const entry = path.join(hubDir, ".output", "server", "index.mjs");
  if (!fs.existsSync(script) || !fs.existsSync(entry)) {
    dialog.showErrorBox("Microscopic", "ملفات البرنامج ناقصة. أعد التثبيت.\n\nMissing: " + (fs.existsSync(script) ? entry : script));
    app.exit(1);
    return false;
  }
  // Keep the program's output in <data folder>\hub.log so problems can be diagnosed.
  fs.mkdirSync(dataDir, { recursive: true });
  const logFile = path.join(dataDir, "hub.log");
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5 * 1024 * 1024) fs.renameSync(logFile, logFile + ".old");
  } catch {
    /* ignore */
  }
  const logFd = fs.openSync(logFile, "a");
  child = spawn(process.execPath, [script], {
    cwd: hubDir,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    // ELECTRON_RUN_AS_NODE: run electron.exe as plain Node. hub-start passes its env on to the app process.
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", HUB_NO_OPEN: "1" },
  });
  child.on("exit", (code) => {
    child = null;
    if (quitting) return;
    // 75 = the program asked to be started again (after a backup was restored from Settings).
    if (code === 75) {
      restartHub();
      return;
    }
    dialog.showErrorBox(
      "Microscopic",
      `البرنامج وقف (code ${code}).\nلو المنفذ ${PORT} مستخدم، اقفل النسخة التانية أو غيّر HUB_PORT.`,
    );
    app.exit(1);
  });
  return true;
}

async function restartHub() {
  if (!startHub()) return;
  try {
    await waitForServer();
  } catch {
    dialog.showErrorBox("Microscopic", "البرنامج اتأخر في إعادة التشغيل. افتحه تاني.");
    app.exit(1);
  }
}

function stopHub() {
  if (!child) return;
  const pid = child.pid;
  try {
    // child.kill() on Windows does not reach the grandchild (the app), so kill the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    else child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
  child = null;
}

function waitForServer(timeoutMs = 90000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ host: "127.0.0.1", port: PORT, path: "/_hub", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      const retry = () => {
        if (Date.now() - started > timeoutMs) reject(new Error("timeout"));
        else setTimeout(tryOnce, 500);
      };
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    tryOnce();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Microscopic",
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#ffffff",
    show: false,
  });
  win.once("ready-to-show", () => win.show());
  // Anything outside the local program (e.g. a link to a website) opens in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(BASE)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.on("closed", () => (win = null));
  win.loadURL(BASE);
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Microscopic",
        submenu: [
          { label: "البرنامج", click: () => win && win.loadURL(BASE) },
          { label: "ربط الموبايل (Mobile link)", click: () => win && win.loadURL(`${BASE}/_hub`) },
          { label: "إعداد أول مرة: إنشاء أدمن المنصة", click: () => win && win.loadURL(`${BASE}/admin/setup`) },
          { label: "فتح مجلد البيانات", click: () => shell.openPath(dataDir) },
          { label: "فتح ملف السجل (hub.log)", click: () => shell.openPath(path.join(dataDir, "hub.log")) },
          { type: "separator" },
          { label: "إعادة تحميل", role: "reload" },
          { label: "خروج", role: "quit" },
        ],
      },
    ]),
  );
}

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  buildMenu();
  if (!startHub()) return;
  try {
    await waitForServer();
  } catch {
    dialog.showErrorBox("Microscopic", "البرنامج اتأخر في التشغيل. جرّب تفتحه تاني.");
    stopHub();
    app.exit(1);
    return;
  }
  createWindow();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  quitting = true;
  stopHub();
});
process.on("exit", stopHub);
