import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getGroup, isMember, listMembers } from "../api/groups";
import { listMessages, mergeMessages, normalizeMessage, openChat } from "../api/chat";
import { useMe } from "../hooks/useMe";
import { ColumnFlute, OilLamp } from "../components/Motifs";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorNote,
  Spinner,
  Textarea,
} from "../components/ui";
import { relativeTime } from "../utils/format";

/** How the oil lamp reads, per connection state. */
const LAMP = {
  connecting: { lit: true, label: "Connecting…" },
  reconnecting: { lit: false, label: "Reconnecting…" },
  open: { lit: true, label: "Live" },
  closed: { lit: false, label: "Disconnected" },
  error: { lit: false, label: "Connection error" },
  unauthenticated: { lit: false, label: "Sign in to speak" },
  forbidden: { lit: false, label: "Members only" },
};

/**
 * The Scriptorium — group chat over `WS /{group_id}/ws?token=`.
 *
 * docs/DESIGN.md: each message is a small rectangular "note" (--vellum-deep,
 * no bubbles or pills), sender medallion + username on the first line, body
 * below, relative timestamp small and right-aligned, and new messages settle
 * in over 150ms rather than bouncing. The oil lamp is lit while the socket is
 * open. Chat is for members: history and sending both require membership.
 *
 * Keyed by group id so navigating between groups starts from clean state
 * (no leftover messages or de-dup ids from the previous room).
 */
export default function Scriptorium() {
  const { groupId } = useParams();
  return <Room key={groupId} groupId={groupId} />;
}

function Room({ groupId }) {
  const { me, ready: meReady } = useMe();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState(() => new Set());

  const chatRef = useRef(null);
  const bottomRef = useRef(null);

  // Group + roster. Cancelled if the room is left before they arrive.
  useEffect(() => {
    document.title = "The Scriptorium • Athenaeum";
    let live = true;
    Promise.all([getGroup(groupId), listMembers(groupId)])
      .then(([g, m]) => {
        if (!live) return;
        setGroup(g);
        setMembers(m);
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [groupId]);

  // History is merged, never assigned, so a live message that lands first
  // can't be wiped by the (slower) history response. Also used to backfill
  // after a reconnect.
  const loadHistory = useCallback(async () => {
    try {
      const rows = (await listMessages(groupId)).map(normalizeMessage).filter(Boolean);
      setMessages((prev) => mergeMessages(prev, rows));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [groupId]);

  // The roster decides whether to open the socket at all. A non-member is
  // rejected at the handshake (the backend closes 4403 *before* accepting),
  // which a browser surfaces as a failed upgrade, not a close code, so the
  // "members only" state has to come from the roster, not from onclose.
  const member = isMember(members ?? [], me?.id);
  const knowWho = meReady && members !== null;
  const allowed = member;

  // History first (members only), then the live socket.
  useEffect(() => {
    if (!knowWho || !allowed) return;
    loadHistory();
  }, [knowWho, allowed, loadHistory]);

  useEffect(() => {
    if (!knowWho || !allowed) return undefined;
    const chat = openChat(groupId, {
      onStatus: setStatus,
      onMessage: (message) => {
        setMessages((prev) => mergeMessages(prev, [message]));
        setFresh((prev) => new Set(prev).add(message.id));
      },
      onReconnected: loadHistory, // backfill what was said while we were away
      onError: (detail) => setNotice(detail),
    });
    chatRef.current = chat;
    return () => {
      chat.close();
      chatRef.current = null;
    };
  }, [groupId, knowWho, allowed, loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const canSend = member && status === "open" && Boolean(me) && draft.trim().length > 0;

  function onSend(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setNotice("");
    // Only clear the draft once the line has actually gone out.
    if (chatRef.current?.send(body)) setDraft("");
    else setNotice("Not connected yet, so that wasn't sent. It'll work once the lamp is lit.");
  }

  // A non-member never gets a socket, so report that state explicitly rather
  // than letting the lamp sit on "Connecting…".
  const gated = knowWho && !allowed;
  const lamp = gated ? LAMP.forbidden : (LAMP[status] ?? LAMP.closed);

  return (
    <div>
      <header className="border-b border-stone bg-vellum-deep">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link
            to={`/groups/${groupId}`}
            className="small-caps text-caption text-verdigris"
          >
            ← {group?.name ?? "Group"}
          </Link>
          <div className="mt-2 flex items-center gap-2.5">
            {/* Lit in --tyrian while the socket is open, unlit otherwise */}
            <OilLamp lit={lamp.lit} size={18} />
            <h1 className="font-display text-section text-ink">
              The Scriptorium
            </h1>
            <span className="text-caption italic text-ink-soft">
              {lamp.label}
            </span>
          </div>
          <p className="mt-2 text-uitext italic text-ink-soft">
            Where the group talks it over, line by line.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="py-6">
          <ColumnFlute />
        </div>
      </div>

      <div className="mx-auto max-w-[640px] px-4 pb-16">
        <ErrorNote error={error} className="mb-4" />
        {notice && (
          <p role="status" className="mb-4 rounded-lg border border-stone bg-vellum-deep px-3 py-2 text-uitext text-ink-soft">
            {notice}
          </p>
        )}

        {gated && (
          <p className="mb-4 text-uitext italic text-ink-soft">
            {me ? "This room is for members. " : "Chat is for group members. "}
            <Link to={`/groups/${groupId}`} className="text-verdigris">
              {me ? "Join the group" : "Go to the group hall"}
            </Link>{" "}
            to take part.
          </p>
        )}

        {messages.length === 0 ? (
          <EmptyState
            className="mt-4"
            message="No one has written anything yet — start the conversation."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                // 150ms fade-and-settle, never a bouncy slide-in
                className={`tablet-edge-solid rounded bg-vellum-deep p-3 ${
                  fresh.has(m.id) ? "note-settle" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <Avatar user={m.user} size={24} />
                  <span className="truncate text-uitext font-semibold text-ink">
                    {m.user.username}
                  </span>
                  <time
                    dateTime={m.created_at}
                    title={new Date(m.created_at).toLocaleString()}
                    className="nums ml-auto shrink-0 text-caption text-ink-soft"
                  >
                    {relativeTime(m.created_at)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-uitext text-ink">
                  {m.body}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div ref={bottomRef} />

        {me && member ? (
          <form onSubmit={onSend} className="mt-6">
            <Textarea
              aria-label="Write a message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) onSend(e);
                }
              }}
              rows={2}
              placeholder={
                status === "open"
                  ? "Write to the room…"
                  : status === "reconnecting"
                    ? "Reconnecting, your message will wait here…"
                    : "Waiting for the connection…"
              }
            />
            <div className="mt-3 flex items-center gap-3">
              <Button type="submit" disabled={!canSend}>
                {busyLabel(status)}
              </Button>
              {status !== "open" && (
                <Button type="button" variant="secondary" onClick={() => chatRef.current?.reconnectNow()}>
                  Reconnect now
                </Button>
              )}
            </div>
          </form>
        ) : meReady && !me ? (
          <p className="mt-6 text-uitext italic text-ink-soft">
            <Link to="/login" className="text-verdigris">
              Sign in
            </Link>{" "}
            to speak in this room.
          </p>
        ) : status === "connecting" && meReady && !gated ? (
          // A gated member (logged in, not a member) never gets a socket at
          // all — see the `allowed` effect above — so without this check the
          // spinner would sit on "connecting" forever instead of the "gated"
          // message above ever taking over.
          <Spinner className="mt-6" />
        ) : null}
      </div>
    </div>
  );
}

function busyLabel(status) {
  if (status === "open") return "Send";
  if (status === "connecting") return "Connecting…";
  if (status === "reconnecting") return "Reconnecting…";
  return "Offline";
}
