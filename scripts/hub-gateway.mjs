// The hub's front door (see hub-gateway-logic.mjs for the rules). Zero dependencies.
import http from "node:http";
import { CONTROL_PREFIX, PAIR_COOKIE, createDeviceRegistry, createHubState, createPinLimiter, decide, isLoopbackAddress, pairingKey, parseCookies, signPairCookie, stripCookie, verifyPairCookie } from "./hub-gateway-logic.mjs";

const page = (body, title = "Microscopic") => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:light dark;--bg:#f4f7f8;--card:#fff;--fg:#14202b;--mut:#5d6b78;--line:#d8e0e6;--acc:#0d9488;--bad:#c62828}
@media(prefers-color-scheme:dark){:root{--bg:#0e1419;--card:#18212a;--fg:#eef2f5;--mut:#9aa8b4;--line:#2b3946}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,"Segoe UI",Tahoma,sans-serif;padding:20px;line-height:1.6}
main{max-width:640px;margin:0 auto;display:grid;gap:14px}h1{margin:6px 0 0;font-size:24px}p{margin:0}.mut{color:var(--mut);font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;display:grid;gap:12px}
button,.btn{font:inherit;padding:11px 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer;text-decoration:none;text-align:center}
button.p{background:var(--acc);border-color:var(--acc);color:#fff;font-weight:700}button.d{border-color:var(--bad);color:var(--bad)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.pill{padding:3px 12px;border-radius:999px;font-size:13px;font-weight:700}
.on{background:#d1fae5;color:#065f46}.off{background:#e5e7eb;color:#374151}
.pin{font:700 44px/1 ui-monospace,Consolas,monospace;letter-spacing:.3em;text-align:center;direction:ltr;padding:10px}
code{direction:ltr;unicode-bidi:embed;background:rgba(127,127,127,.15);padding:2px 8px;border-radius:8px}
input,select{font:inherit;padding:11px;border-radius:12px;border:1px solid var(--line);background:transparent;color:inherit}
.err{color:var(--bad);font-weight:600}svg{max-width:200px;height:auto;background:#fff;border-radius:12px;padding:8px}
</style></head><body><main>${body}</main></body></html>`;

const pairPage = (error) =>
  page(`<h1>ربط الموبايل</h1><div class="card"><p>اكتب الرقم السري الظاهر على شاشة الكمبيوتر.</p>
<form method="post" action="${CONTROL_PREFIX}/pair" class="card" style="border:0;padding:0">
<input name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" style="text-align:center;font-size:28px;letter-spacing:.3em;direction:ltr" autofocus required>
${error ? `<p class="err">${error}</p>` : ""}<button class="p">ربط</button></form></div>`, "ربط الموبايل");

const lockedPage = () =>
  page(`<h1>الربط مقفول</h1><div class="card"><p>الربط مع الموبايل مقفول حاليًا على الكمبيوتر.</p><p class="mut">اطلب من اللي على الكمبيوتر يشغّل «ربط الموبايل» ويديك الرقم السري.</p></div>`, "الربط مقفول");

const controlPage = () =>
  page(`<h1>مركز المعمل</h1><p class="mut">البرنامج بيشتغل على الكمبيوتر ده وبياناته عليه. من هنا بتتحكم في ربط الموبايل.</p>
<div class="card"><div class="row"><strong>ربط الموبايل</strong><span id="state" class="pill off">مقفول</span></div>
<p class="mut" id="hint">مقفول: الموبايلات مش بتشوف البرنامج. اللي على الكمبيوتر ده بس.</p>
<div class="row" id="offControls"><select id="mins"><option value="30">نص ساعة</option><option value="60">ساعة</option><option value="240" selected>4 ساعات</option><option value="720">12 ساعة</option><option value="0">لحد ما أقفله</option></select><button class="p" id="enable">شغّل ربط الموبايل</button></div>
<div id="onBox" hidden><p class="mut">على الموبايل (نفس الواي فاي) افتح:</p><div id="urls"></div><div id="qr" class="row"></div><p class="mut">وبعدها اكتب الرقم السري:</p><div class="pin" id="pin">······</div><p class="mut" id="left"></p>
<div class="row"><button id="renew">رقم سري جديد (يفصل الأجهزة الحالية)</button><button class="d" id="disable">اقفل الربط وافصل الكل</button></div></div></div>
<div class="card"><strong>الأجهزة الشغالة</strong><div id="devices" class="mut">مفيش أجهزة.</div></div>
<a class="btn" href="/">فتح البرنامج</a>
<script>
const H={"x-hub-control":"1","content-type":"application/json"};
const $=id=>document.getElementById(id);
async function post(p,b){await fetch("${CONTROL_PREFIX}/api/"+p,{method:"POST",headers:H,body:JSON.stringify(b||{})});load();}
$("enable").onclick=()=>post("link",{on:true,minutes:Number($("mins").value)});
$("disable").onclick=()=>post("link",{on:false});
$("renew").onclick=()=>post("renew");
function fmt(ms){const m=Math.max(0,Math.round(ms/60000));return m>=60?Math.floor(m/60)+" ساعة "+(m%60?(m%60)+" دقيقة":""):m+" دقيقة"}
async function load(){
 let s;try{s=await (await fetch("${CONTROL_PREFIX}/api/status")).json()}catch{return}
 $("state").textContent=s.on?"شغّال":"مقفول";$("state").className="pill "+(s.on?"on":"off");
 $("offControls").hidden=s.on;$("onBox").hidden=!s.on;
 $("hint").textContent=s.on?"شغّال: أي موبايل على نفس الواي فاي ومعاه الرقم السري يقدر يدخل.":"مقفول: الموبايلات مش بتشوف البرنامج. اللي على الكمبيوتر ده بس.";
 $("pin").textContent=s.pin||"······";
 $("left").textContent=s.expiresAt?"بيقفل لوحده بعد "+fmt(s.expiresAt-Date.now()):"شغّال لحد ما تقفله بإيدك.";
 const u=$("urls");u.textContent="";for(const x of s.urls){const c=document.createElement("code");c.textContent=x;u.append(c," ")}
 if(!s.urls.length){u.textContent="مفيش عنوان شبكة. وصّل الكمبيوتر بالواي فاي أو الراوتر.";}
 $("qr").innerHTML=s.qr||"";
 const d=$("devices");d.textContent="";
 if(!s.devices.length){d.textContent="مفيش أجهزة."}
 for(const x of s.devices){const r=document.createElement("div");r.textContent=x.ua+" — "+x.ip+" — آخر نشاط من "+fmt(Date.now()-x.lastSeen);d.append(r)}
}
load();setInterval(load,3000);
</script>`, "مركز المعمل");

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

/**
 * @param {object} o
 * @param {number} o.upstreamPort   the app, listening on 127.0.0.1
 * @param {string} o.secret         signs the pairing cookie
 * @param {() => string[]} [o.urls] addresses phones should open (shown on the control page)
 * @param {(url: string) => Promise<string|null>} [o.qrSvg]
 * @param {(req: import("node:http").IncomingMessage) => string} [o.remoteOf] tests only
 */
export function createGateway({ upstreamPort, secret, urls = () => [], qrSvg = async () => null, remoteOf = (req) => req.socket.remoteAddress ?? "", state = createHubState(), now = () => Date.now() }) {
  const key = pairingKey(secret);
  const devices = createDeviceRegistry();
  const limiter = createPinLimiter();
  const remoteSockets = new Set();

  const dropRemote = () => {
    for (const s of remoteSockets) s.destroy();
    remoteSockets.clear();
    devices.clear();
  };

  const send = (res, status, body, type = "text/html; charset=utf-8", headers = {}) => {
    res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
    res.end(body);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://hub");
    const path = url.pathname;
    const ip = remoteOf(req);
    const loopback = isLoopbackAddress(ip);
    const snap = state.snapshot();
    const cookies = parseCookies(req.headers.cookie);
    const paired = snap.on && verifyPairCookie(cookies[PAIR_COOKIE], snap.epoch, key);
    const action = decide({ loopback, path, method: req.method ?? "GET", linkOn: snap.on, paired });

    if (!snap.on && remoteSockets.size) dropRemote(); // the link just ended (switched off or timed out)

    switch (action) {
      case "control": {
        if (path === CONTROL_PREFIX || path === `${CONTROL_PREFIX}/`) return send(res, 200, controlPage());
        if (path === `${CONTROL_PREFIX}/api/status`) {
          const list = snap.on ? urls() : [];
          const qr = snap.on && list[0] ? await qrSvg(list[0]).catch(() => null) : null;
          return send(res, 200, JSON.stringify({ on: snap.on, pin: snap.pin, expiresAt: snap.expiresAt, urls: list, qr, devices: devices.list() }), "application/json");
        }
        if (req.method === "POST" && (path === `${CONTROL_PREFIX}/api/link` || path === `${CONTROL_PREFIX}/api/renew`)) {
          // A web page open in this PC's browser must not be able to switch the link on: the custom header forces a CORS preflight we never answer.
          if (req.headers["x-hub-control"] !== "1") return send(res, 403, "forbidden", "text/plain");
          let body = {};
          try {
            body = JSON.parse((await readBody(req)) || "{}");
          } catch {
            return send(res, 400, "bad request", "text/plain");
          }
          if (path.endsWith("/renew")) {
            state.renewPin();
            dropRemote();
          } else if (body.on === true) {
            state.enable(Number(body.minutes) || 0);
          } else {
            state.disable();
            dropRemote();
          }
          return send(res, 200, "{}", "application/json");
        }
        return send(res, 404, "not found", "text/plain");
      }
      case "hidden":
        return send(res, 404, "not found", "text/plain");
      case "locked":
        return send(res, 403, lockedPage());
      case "pair-page":
        return send(res, 200, pairPage());
      case "pair-submit": {
        if (limiter.blocked(ip, now())) return send(res, 429, pairPage("محاولات كتير. استنى شوية وجرّب تاني."));
        const form = new URLSearchParams(await readBody(req));
        if (snap.on && snap.pin && form.get("pin") === snap.pin) {
          limiter.clear(ip);
          return send(res, 303, "", "text/plain", { location: "/", "set-cookie": `${PAIR_COOKIE}=${signPairCookie(snap.epoch, key)}; Path=/; HttpOnly; SameSite=Lax` });
        }
        limiter.fail(ip, now());
        return send(res, 403, pairPage("الرقم السري غلط."));
      }
      default:
        break;
    }

    // "proxy": hand the request to the app
    if (!loopback) devices.seen(ip, req.headers["user-agent"], now());
    const headers = { ...req.headers, "x-forwarded-for": ip };
    delete headers.connection;
    const cookie = stripCookie(req.headers.cookie, PAIR_COOKIE);
    if (cookie) headers.cookie = cookie;
    else delete headers.cookie;
    const upstream = http.request({ host: "127.0.0.1", port: upstreamPort, method: req.method, path: req.url, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) send(res, 502, page(`<h1>البرنامج بيشتغل…</h1><div class="card"><p>استنى ثواني وحدّث الصفحة.</p></div>`), "text/html; charset=utf-8", { "retry-after": "3" });
      else res.destroy();
    });
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  });

  server.on("connection", (socket) => {
    if (!isLoopbackAddress(remoteOf({ socket }))) {
      remoteSockets.add(socket);
      socket.on("close", () => remoteSockets.delete(socket));
    }
  });
  server.on("upgrade", (_req, socket) => socket.destroy());
  const timer = setInterval(() => {
    if (!state.snapshot().on && remoteSockets.size) dropRemote();
  }, 15_000);
  timer.unref();
  server.on("close", () => clearInterval(timer));

  return { server, state, dropRemote };
}
