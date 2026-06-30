// Electron main process (CommonJS — `.cjs` overrides the package's "type":"module").
//
// Two runtimes, one engine:
//   - DEV  (CO_ELECTRON_DEV=1, run `npm run dev` separately): load the Next dev server.
//   - PROD (packaged): spawn the Next `standalone` server as a managed child on a
//     fixed loopback port, wait until it answers, then load it in a BrowserWindow.
//
// THE ffmpeg GOTCHA (media-pipeline skill): ffmpeg-static / ffprobe-static binaries
// cannot execute from inside an asar archive. forge.config.cjs `asarUnpack`s them;
// here we rewrite the resolved path from app.asar -> app.asar.unpacked and hand it
// to the server via FFMPEG_PATH / FFPROBE_PATH so the core resolver uses the real file.

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const DEV = process.env.CO_ELECTRON_DEV === "1" || !app.isPackaged;
const DEV_URL = process.env.CO_DEV_URL || "http://localhost:3000";
const PROD_HOST = "127.0.0.1";
const PROD_PORT = Number(process.env.CO_PROD_PORT || 3765);

/** Rewrite an app.asar path to app.asar.unpacked (binaries can't run inside asar). */
function unpacked(p) {
  return p ? p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : p;
}

/** Resolve the bundled binary paths, unpacked when packaged. */
function resolveBinaryEnv() {
  const env = { ...process.env };
  try {
    const ffmpeg = unpacked(require("ffmpeg-static"));
    if (ffmpeg) env.FFMPEG_PATH = env.FFMPEG_PATH || ffmpeg;
  } catch {
    /* resolved lazily by the core layer if absent here */
  }
  try {
    const ffprobe = unpacked(require("ffprobe-static").path);
    if (ffprobe) env.FFPROBE_PATH = env.FFPROBE_PATH || ffprobe;
  } catch {
    /* ditto */
  }
  return env;
}

let serverChild = null;

function startStandaloneServer() {
  const serverJs = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ".next",
    "standalone",
    "server.js",
  );
  const env = resolveBinaryEnv();
  env.PORT = String(PROD_PORT);
  env.HOSTNAME = PROD_HOST;
  serverChild = spawn(process.execPath, [serverJs], {
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "inherit",
  });
  serverChild.on("exit", (code) => {
    if (code && code !== 0) console.error(`[co] standalone server exited ${code}`);
  });
}

/** Poll the server until it answers, then resolve. */
function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("server did not start in time"));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#101418",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  if (DEV) {
    await waitForServer(DEV_URL).catch(() => {});
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    startStandaloneServer();
    const url = `http://${PROD_HOST}:${PROD_PORT}`;
    await waitForServer(url);
    await win.loadURL(url);
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverChild && !serverChild.killed) serverChild.kill();
});
