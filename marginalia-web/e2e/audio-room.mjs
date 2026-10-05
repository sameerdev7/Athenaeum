// End-to-end check of the Agora (LiveKit / WebRTC) and the Scriptorium (WebSocket chat).
//
// Two real Chromium pages, each with a fake microphone, join the same audio room
// against a local LiveKit dev server; then two pages chat and one is knocked off.
// Prerequisites (see docs/ARCHITECTURE.md > Testing live):
//   docker run -d --rm --name lk-dev --network host livekit/livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1
//   backend:  LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret LIVEKIT_URL=ws://127.0.0.1:7880 \
//             RATE_LIMIT_ENABLED=false uv run uvicorn main:app --port 8010
//   frontend: API_PROXY=http://127.0.0.1:8010 npx vite --port 5180
//   then:     node e2e/audio-room.mjs
import crypto from "node:crypto";
import { chromium } from "playwright";

const WEB = process.env.WEB ?? "http://localhost:5180";
const LK = process.env.LK ?? "http://127.0.0.1:7880";
const DEMO_PASSWORD = "vellum-2024";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, { timeout = 15000, every = 250 } = {}) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      /* keep polling */
    }
    await sleep(every);
  }
  return last;
}

async function login(email) {
  const r = await fetch(`${WEB}/api/users/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password: DEMO_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
}
const api = (token, path, init = {}) =>
  fetch(`${WEB}/api${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

// LiveKit's admin API, called directly so the server's view can be checked
// independently of our own UI.
function adminToken(room = "") {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iss: "devkey", sub: "e2e", exp: Math.floor(Date.now() / 1000) + 300, video: { roomList: true, roomAdmin: true, room } });
  const sig = crypto.createHmac("sha256", "secret").update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
async function lk(method, body = {}) {
  const r = await fetch(`${LK}/twirp/livekit.RoomService/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken(body.room ?? "")}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function player(token) {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  await ctx.addInitScript((t) => localStorage.setItem("token", t), token);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    [pageerror]", e.message));
  return { ctx, page };
}

// The speaking ring flickers on and off with Chrome's fake mic, so polling can
// miss it. A MutationObserver records whether it *ever* lit.
const watchSpeaking = (page) =>
  page.evaluate(() => {
    window.__spoke = false;
    new MutationObserver((records) => {
      for (const r of records) if (r.target.dataset?.speaking === "true") window.__spoke = true;
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-speaking"] });
  });
const everSpoke = (page) => page.evaluate(() => window.__spoke === true);

try {
  const mara = await login("mara.linden@athenaeum.app");
  const jonah = await login("jonah.whitfield@athenaeum.app");
  const stamp = Date.now();

  console.log("\n== Setup");
  const group = await (await api(mara, "/groups", { method: "POST", body: JSON.stringify({ name: `E2E ${stamp}` }) })).json();
  const gid = group.id;
  check("group created", Boolean(gid));
  const joined = await api(jonah, `/groups/${gid}/members`, { method: "POST" });
  check("second reader joined the group", joined.status === 201);

  // ---------------------------------------------------------------- audio
  console.log("\n== Agora (WebRTC audio)");
  const A = await player(mara);
  const B = await player(jonah);
  await A.page.goto(`${WEB}/groups/${gid}/agora`);
  await B.page.goto(`${WEB}/groups/${gid}/agora`);
  await watchSpeaking(A.page);

  await A.page.getByTestId("start-session").click();
  check("A opens the Agora", await until(() => A.page.getByTestId("join").isVisible()));
  await A.page.getByTestId("join").click();
  check("A joins the room", await until(() => A.page.getByTestId("leave").isVisible(), { timeout: 20000 }));

  // B only learns about the session through polling (10s) or a reload; reload.
  await B.page.reload();
  await watchSpeaking(B.page);
  check("B sees the live room", await until(() => B.page.getByTestId("join").isVisible()));
  await B.page.getByTestId("join").click();
  check("B joins the room", await until(() => B.page.getByTestId("leave").isVisible(), { timeout: 20000 }));

  const count = (p) => p.getByTestId("participant").count();
  check("A sees two participants", await until(async () => (await count(A.page)) === 2));
  check("B sees two participants", await until(async () => (await count(B.page)) === 2));

  // Each side must have a live remote audio track attached and playing.
  const remoteAudio = (p) =>
    p.evaluate(() => {
      const els = [...document.querySelectorAll('[data-testid="audio-host"] audio')];
      return els.map((el) => {
        const tracks = el.srcObject?.getAudioTracks?.() ?? [];
        return { live: tracks.some((t) => t.readyState === "live" && t.enabled), paused: el.paused, muted: el.muted };
      });
    });
  const aAudio = await until(async () => {
    const r = await remoteAudio(A.page);
    return r.length === 1 ? r : null;
  });
  const bAudio = await until(async () => {
    const r = await remoteAudio(B.page);
    return r.length === 1 ? r : null;
  });
  check("A has exactly one remote <audio> element, live", aAudio?.length === 1 && aAudio[0].live, JSON.stringify(aAudio));
  check("B has exactly one remote <audio> element, live", bAudio?.length === 1 && bAudio[0].live, JSON.stringify(bAudio));
  check("remote audio is actually playing (not paused)", aAudio?.[0] && !aAudio[0].paused && bAudio?.[0] && !bAudio[0].paused);

  // The server's own view: two participants, each publishing one audio track.
  const room = (await lk("ListRooms")).rooms?.[0];
  check("LiveKit server has the room", Boolean(room));
  const parts = (await lk("ListParticipants", { room: room?.name })).participants ?? [];
  check("LiveKit lists two participants", parts.length === 2, String(parts.length));
  check("each participant publishes one audio track", parts.length === 2 && parts.every((p) => (p.tracks ?? []).filter((t) => t.type === "AUDIO").length === 1));
  check("participants carry our user identities + names", parts.some((p) => p.name === "mara_linden") && parts.some((p) => p.name === "jonah_whitfield"));

  // Fake mic beeps => active-speaker detection should flag somebody.
  // Chrome's fake microphone beeps intermittently, so watch both pages for a while.
  const speaking = await until(async () => (await everSpoke(A.page)) || (await everSpoke(B.page)), { timeout: 45000, every: 250 });
  check("speaking indicator lights for the fake microphone", speaking);

  // Mute: A mutes, B sees A as muted, and the server agrees.
  await A.page.getByTestId("mute-toggle").click();
  const aId = String(JSON.parse(Buffer.from(mara.split(".")[1], "base64url").toString()).sub);
  check("B sees A as muted", await until(() => B.page.locator(`[data-testid="participant"][data-identity="${aId}"][data-muted="true"]`).count().then((n) => n === 1)));
  const afterMute = (await lk("ListParticipants", { room: room.name })).participants.find((p) => p.identity === aId);
  check("server reports A's track muted", afterMute?.tracks?.some((t) => t.type === "AUDIO" && t.muted));
  await A.page.getByTestId("mute-toggle").click(); // unmute again
  check("unmute is reflected for B", await until(() => B.page.locator(`[data-testid="participant"][data-identity="${aId}"][data-muted="false"]`).count().then((n) => n === 1)));

  // B leaves; A's roster shrinks and the audio element goes away.
  await B.page.getByTestId("leave").click();
  check("A sees B leave", await until(async () => (await count(A.page)) === 1));
  check("A's remote <audio> is removed", await until(async () => (await remoteAudio(A.page)).length === 0));

  // B can rejoin (no leaked half-state), then the starter ends the session.
  await B.page.getByTestId("join").click();
  check("B can rejoin", await until(() => B.page.getByTestId("leave").isVisible(), { timeout: 20000 }));
  check("A sees two again", await until(async () => (await count(A.page)) === 2));

  // A third reader whose microphone is denied joins as a listener: not stuck
  // half-connected, can still hear, and can leave.
  const theo = await login("theo.baptiste@athenaeum.app");
  await api(theo, `/groups/${gid}/members`, { method: "POST" });
  const E = await player(theo);
  await E.ctx.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await E.page.goto(`${WEB}/groups/${gid}/agora`);
  await E.page.getByTestId("join").click();
  check("mic-denied reader still joins (as a listener)", await until(() => E.page.getByTestId("leave").isVisible(), { timeout: 20000 }));
  check("listener is told they are listening only", await until(() => E.page.getByTestId("agora-notice").innerText().then((t) => /listener/i.test(t))));
  check("listener hears the two speakers", await until(async () => (await remoteAudio(E.page)).filter((a) => a.live).length === 2, { timeout: 20000 }));
  check("others see the listener as muted", await until(() => A.page.locator('[data-testid="participant"][data-muted="true"]').count().then((n) => n >= 1)));
  await E.page.getByTestId("leave").click();
  check("listener can leave cleanly", await until(() => E.page.getByTestId("join").isVisible()));
  await E.ctx.close();
  check("A is back to two participants", await until(async () => (await count(A.page)) === 2));

  await A.page.getByTestId("end-session").click();
  check("ending the session removes the LiveKit room", await until(async () => !((await lk("ListRooms")).rooms ?? []).some((r) => r.name === room.name), { timeout: 15000 }));
  check("B is disconnected when the room is deleted", await until(() => B.page.getByTestId("join").isVisible().then((v) => !v) && B.page.getByTestId("leave").isVisible().then((v) => !v), { timeout: 15000 }));

  await A.ctx.close();
  await B.ctx.close();

  // ----------------------------------------------------------------- chat
  console.log("\n== Scriptorium (WebSocket chat)");
  const C = await player(mara);
  const D = await player(jonah);
  await C.page.goto(`${WEB}/groups/${gid}/chat`);
  await D.page.goto(`${WEB}/groups/${gid}/chat`);
  const textarea = (p) => p.getByLabel("Write a message");
  check("both rooms light up (Live)", await until(async () => (await C.page.getByText("Live", { exact: true }).count()) > 0 && (await D.page.getByText("Live", { exact: true }).count()) > 0));

  await textarea(C.page).fill("hello from mara");
  await textarea(C.page).press("Enter");
  check("D receives C's message live", await until(() => D.page.getByText("hello from mara").isVisible()));
  check("C sees its own message echoed exactly once", await until(async () => (await C.page.getByText("hello from mara").count()) === 1));

  await textarea(D.page).fill("hi mara, jonah here");
  await textarea(D.page).press("Enter");
  check("C receives D's reply", await until(() => C.page.getByText("hi mara, jonah here").isVisible()));

  // Knock D's socket off the server side by blocking the network briefly, then
  // heal: D should say Reconnecting and recover, and catch up on what it missed.
  await D.ctx.setOffline(true);
  await C.page.waitForTimeout(300);
  await textarea(C.page).fill("sent while jonah was offline");
  await textarea(C.page).press("Enter");
  check("C's message lands for C", await until(() => C.page.getByText("sent while jonah was offline").isVisible()));
  await D.ctx.setOffline(false);
  check("D shows live again after the outage", await until(async () => (await D.page.getByText("Live", { exact: true }).count()) > 0, { timeout: 30000 }));
  check("D backfills the message it missed", await until(() => D.page.getByText("sent while jonah was offline").isVisible(), { timeout: 30000 }));
  check("no duplicate after backfill", (await D.page.getByText("hello from mara").count()) === 1);

  // Leaving the group closes the live socket.
  await api(jonah, `/groups/${gid}/members/me`, { method: "DELETE" });
  check("a member who leaves is cut off (no longer Live)", await until(async () => (await D.page.getByText("Live", { exact: true }).count()) === 0, { timeout: 20000 }));

  await C.ctx.close();
  await D.ctx.close();
} catch (err) {
  console.error("\nSCRIPT ERROR:", err);
  results.push({ name: "script completed", ok: false, detail: String(err) });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
