import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getGroup, isMember, listMembers } from "../api/groups";
import {
  endSession,
  getActiveSession,
  isNotConfigured,
  joinSession,
  startSession,
} from "../api/audio";
import { useMe } from "../hooks/useMe";
import { seatPosition } from "../utils/agora";
import { ColumnFlute, OilLamp, WaxSeal } from "../components/Motifs";
import { Avatar, Button, ErrorNote, Spinner } from "../components/ui";

/**
 * The Agora — the group audio room.
 *
 * docs/DESIGN.md: participants sit in a circle, not a grid (the one place a
 * spatial metaphor earns its keep); the current speaker gets a subtle --ochre
 * ring that pulses by opacity, which the global prefers-reduced-motion rule
 * flattens to a static ring. The oil lamp marks "room is active".
 *
 * The three calls are deliberately separate: POST creates the bookkeeping row,
 * .../join mints a LiveKit token for the caller, .../end is starter-only.
 *
 * LiveKit credentials aren't configured on the backend yet, so /join answers
 * 503. That is an expected state, not a crash: the room still shows its
 * bookkeeping, and the panel says so in-theme.
 */
export default function Agora() {
  const { groupId } = useParams();
  return <Assembly key={groupId} groupId={groupId} />;
}

// How often to re-check whether the room is still open (and notice if someone
// else opened or closed it). Cheap: one small GET.
const SESSION_POLL_MS = 10_000;

function Assembly({ groupId }) {
  const { me, ready: meReady } = useMe();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [session, setSession] = useState(null);
  const [noSession, setNoSession] = useState(false);
  const [participants, setParticipants] = useState([]);
  // idle -> joining -> connected <-> reconnecting -> idle
  const [link, setLink] = useState("idle");
  const [micOn, setMicOn] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const roomRef = useRef(null);
  const audioHostRef = useRef(null);
  const membersRef = useRef([]);
  const mountedRef = useRef(true);
  // Bumped on every join/leave/unmount so an in-flight join can tell it was
  // superseded and must tidy up after itself instead of connecting a ghost.
  const joinSeq = useRef(0);
  membersRef.current = members;

  const refreshSession = useCallback(async () => {
    try {
      const active = await getActiveSession(groupId);
      if (!mountedRef.current) return;
      setSession(active);
      setNoSession(false);
    } catch (err) {
      if (!mountedRef.current) return;
      // 404 is the normal "nobody is speaking" answer; anything else (a flaky
      // network) shouldn't flip a live room to "empty", so keep what we know.
      if (/no active audio session/i.test(err.message)) {
        setSession(null);
        setNoSession(true);
      }
    }
  }, [groupId]);

  const load = useCallback(async () => {
    try {
      const [g, m] = await Promise.all([getGroup(groupId), listMembers(groupId)]);
      if (!mountedRef.current) return;
      setGroup(g);
      setMembers(m);
      setError("");
    } catch (err) {
      if (mountedRef.current) setError(err.message);
    }
    await refreshSession();
  }, [groupId, refreshSession]);

  useEffect(() => {
    document.title = "The Agora • Athenaeum";
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refreshSession();
    }, SESSION_POLL_MS);
    return () => clearInterval(id);
  }, [refreshSession]);

  // Tear the media room down on unmount so the mic is released, and make any
  // join still in flight abandon itself.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      joinSeq.current += 1;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  const member = isMember(members, me?.id);
  const starter = Boolean(session && me && session.started_by === me.id);
  const owner = Boolean(group && me && group.owner_id === me.id);
  const canEnd = Boolean(session && (starter || owner));
  const inRoom = link === "connected" || link === "reconnecting";

  /** Rebuild the roster from LiveKit's own state, the single source of truth. */
  function syncParticipants(room) {
    const byId = new Map(membersRef.current.map((m) => [String(m.user?.id), m.user]));
    const describe = (p, local) => ({
      identity: p.identity,
      username: p.name || byId.get(p.identity)?.username || p.identity,
      avatar_url: byId.get(p.identity)?.avatar_url ?? null,
      speaking: Boolean(p.isSpeaking),
      muted: !p.isMicrophoneEnabled,
      local,
    });
    setParticipants([
      describe(room.localParticipant, true),
      ...Array.from(room.remoteParticipants.values()).map((p) => describe(p, false)),
    ]);
    setMicOn(room.localParticipant.isMicrophoneEnabled);
    pruneAudio(room);
  }

  /** Drop <audio> elements whose speaker is gone (or whose track has ended). */
  function pruneAudio(room) {
    const host = audioHostRef.current;
    if (!host) return;
    for (const el of Array.from(host.querySelectorAll("audio"))) {
      const here = room.remoteParticipants.has(el.dataset.identity);
      const live = el.srcObject?.getAudioTracks?.().some((t) => t.readyState === "live");
      if (!here || live === false) el.remove();
    }
  }

  function clearAudio() {
    const host = audioHostRef.current;
    if (host) host.replaceChildren();
  }

  function resetRoomState() {
    setLink("idle");
    setParticipants([]);
    setMicOn(false);
    setAudioBlocked(false);
    clearAudio();
  }

  async function onStart() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSession(await startSession(groupId));
      setNoSession(false);
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onEnd() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      leaveRoom();
      await endSession(groupId, session.id);
      setSession(null);
      setNoSession(true);
      setNotice("The session has ended.");
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    if (!session || inRoom || link === "joining") return;
    setBusy(true);
    setError("");
    setNotice("");
    const attempt = ++joinSeq.current;
    let grant;
    try {
      grant = await joinSession(groupId, session.id);
    } catch (err) {
      // The expected state until LiveKit credentials exist. Say so in the
      // room's own voice rather than surfacing a stack of config advice.
      if (isNotConfigured(err)) setNotice("Audio rooms aren't ready yet.");
      else setError(err.message);
      setBusy(false);
      return;
    }

    setLink("joining");
    try {
      await connectRoom(grant, attempt);
    } catch (err) {
      // Whatever went wrong, never leave a half-joined room behind.
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      if (mountedRef.current && attempt === joinSeq.current) {
        resetRoomState();
        setError(`Couldn't reach the room: ${err.message}`);
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function connectRoom({ token, url, room_name: roomName }, attempt) {
    // livekit-client is ~540 kB and only needed once a caller actually gets a
    // grant, so it's split into its own chunk and fetched on demand.
    const { Room, RoomEvent, Track } = await import("livekit-client");
    const stale = () => !mountedRef.current || attempt !== joinSeq.current;
    if (stale()) return;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const sync = () => !stale() && syncParticipants(room);

    // Remote voices have to be attached to an <audio> element or nobody hears
    // anything; each is parked in a hidden host and removed when the track goes.
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === Track.Kind.Audio && audioHostRef.current) {
        const el = track.attach();
        el.dataset.identity = participant.identity;
        audioHostRef.current.appendChild(el);
      }
      sync();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
      sync();
    });
    for (const event of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantNameChanged,
      RoomEvent.ActiveSpeakersChanged, // p.isSpeaking is current by the time this fires
    ]) {
      room.on(event, sync);
    }
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!stale()) setAudioBlocked(!room.canPlaybackAudio);
    });
    room.on(RoomEvent.Reconnecting, () => !stale() && setLink("reconnecting"));
    room.on(RoomEvent.Reconnected, () => {
      if (stale()) return;
      setLink("connected");
      syncParticipants(room);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current === room) roomRef.current = null;
      if (!mountedRef.current) return;
      resetRoomState();
      setNotice("You've left the Agora.");
    });

    await room.connect(url, token);
    if (stale()) {
      room.disconnect();
      return;
    }

    // Autoplay policy: the Join click is our user gesture. If the browser still
    // blocks playback the "Enable audio" button below finishes the job.
    try {
      await room.startAudio();
    } catch {
      /* surfaced via AudioPlaybackStatusChanged */
    }
    setAudioBlocked(!room.canPlaybackAudio);

    // The mic is optional: if it's denied or missing, you join as a listener.
    let listenOnly = false;
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      listenOnly = true;
    }
    if (stale()) {
      room.disconnect();
      return;
    }

    setLink("connected");
    syncParticipants(room);
    setNotice(
      listenOnly
        ? `Connected to ${roomName} as a listener. Allow the microphone to speak.`
        : `Connected to ${roomName}.`,
    );
  }

  function leaveRoom() {
    joinSeq.current += 1; // abandon any join still in flight
    const room = roomRef.current;
    roomRef.current = null;
    room?.disconnect();
    resetRoomState();
    setNotice("");
  }

  async function toggleMic() {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
      setNotice("");
    } catch {
      setNotice("Couldn't use the microphone. Check the browser's permission for this site.");
    }
    syncParticipants(room);
  }

  async function enableAudio() {
    try {
      await roomRef.current?.startAudio();
    } catch {
      /* the button stays visible until playback is allowed */
    }
    setAudioBlocked(!(roomRef.current?.canPlaybackAudio ?? true));
  }

  if (!group) return <Spinner />;

  const active = Boolean(session);

  return (
    <div>
      <header className="border-b border-stone bg-vellum-deep">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link
            to={`/groups/${groupId}`}
            className="small-caps text-caption text-verdigris"
          >
            ← {group.name}
          </Link>
          <div className="mt-2 flex items-center gap-2.5">
            <OilLamp lit={active} size={18} />
            <h1 className="font-display text-section text-ink">The Agora</h1>
            {active && (
              <span className="small-caps text-caption text-tyrian">
                room is live
              </span>
            )}
          </div>
          <p className="mt-2 text-uitext italic text-ink-soft">
            A room for talking out loud.{" "}
            {active && starter && "You opened this one."}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="py-6">
          <ColumnFlute />
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16">
        <ErrorNote error={error} className="mb-4" />

        {notice && (
          <p
            role="status"
            data-testid="agora-notice"
            className="mb-4 rounded-lg border border-verdigris bg-verdigris-soft px-3 py-2 text-uitext text-verdigris"
          >
            {notice}
          </p>
        )}
        {link === "reconnecting" && (
          <p role="status" className="mb-4 rounded-lg border border-stone bg-vellum-deep px-3 py-2 text-uitext text-ink-soft">
            Connection dropped. Trying to get you back in…
          </p>
        )}
        {audioBlocked && inRoom && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-ochre/50 bg-vellum-deep px-3 py-2 text-uitext text-ink">
            <span>Your browser is blocking audio playback.</span>
            <Button size="sm" onClick={enableAudio} data-testid="enable-audio">
              Enable audio
            </Button>
          </div>
        )}

        {/* Remote voices are attached here as hidden <audio> elements. */}
        <div ref={audioHostRef} data-testid="audio-host" className="hidden" aria-hidden="true" />

        {/* The assembly itself. Participants sit in a ring, not a grid. */}
        <div className="agora-ring" data-live={active ? "true" : "false"}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="font-display text-section text-stone">
                {active ? "Agora" : "Empty"}
              </p>
              <p className="mt-1 text-caption italic text-ink-soft">
                {active
                  ? `${plural(participants.length, "voice")} in the ring`
                  : "No assembly is convened"}
              </p>
            </div>
          </div>

          {participants.map((p, i) => {
            const { x, y } = seatPosition(i, participants.length);
            return (
              <div
                key={p.identity}
                className="agora-seat"
                style={{ "--x": `${x}%`, "--y": `${y}%` }}
                data-testid="participant"
                data-identity={p.identity}
                data-speaking={p.speaking ? "true" : "false"}
                data-muted={p.muted ? "true" : "false"}
              >
                <span className={`relative rounded-full ${p.speaking ? "speaker-ring" : ""}`}>
                  <Avatar user={p} size={48} ring={p.speaking ? 0 : 2} />
                  {p.muted && (
                    <span
                      title="Muted"
                      className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-stone bg-vellum-deep text-[0.65rem] text-ink-soft"
                    >
                      🔇
                    </span>
                  )}
                </span>
                <span className="max-w-[6rem] truncate text-caption text-ink-soft">
                  {p.local ? `${p.username} (you)` : p.username}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          {inRoom ? (
            <>
              <Button variant="secondary" onClick={toggleMic} data-testid="mute-toggle">
                {micOn ? "Mute" : "Unmute"}
              </Button>
              <Button variant="secondary" onClick={leaveRoom} disabled={busy} data-testid="leave">
                Leave the Agora
              </Button>
            </>
          ) : !active ? (
            member ? (
              <Button onClick={onStart} disabled={busy} data-testid="start-session">
                {busy ? "Opening…" : "Open the Agora"}
              </Button>
            ) : (
              <p className="text-uitext italic text-ink-soft">
                Join the group to open the Agora.
              </p>
            )
          ) : member ? (
            <Button onClick={onJoin} disabled={busy || link === "joining"} data-testid="join">
              {busy || link === "joining" ? "Joining…" : "Join the Agora"}
            </Button>
          ) : (
            <p className="text-uitext italic text-ink-soft">
              This room is for members of the group.
            </p>
          )}

          {/* The starter or the group's owner may end it; the backend enforces it too. */}
          {canEnd && (
            <Button variant="destructive" onClick={onEnd} disabled={busy} data-testid="end-session">
              {busy ? "Closing…" : "End the session"}
            </Button>
          )}
        </div>

        {active && (
          <div className="mt-10">
            <h2 className="font-display text-section text-ink">This session</h2>
            <dl className="mt-4 flex flex-col gap-2 text-uitext text-ink">
              <div className="flex items-center gap-2">
                <dt className="text-ink-soft">Opened by</dt>
                <dd className="flex items-center gap-1.5">
                  {starter ? (
                    <WaxSeal initial="◆" title="You opened this session" />
                  ) : null}
                  {members.find((m) => m.user?.id === session.started_by)?.user
                    ?.username ?? "A member"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink-soft">Room</dt>
                <dd className="nums break-all text-caption">{session.room_name}</dd>
              </div>
            </dl>
          </div>
        )}

        {!active && noSession && meReady && !me && (
          <p className="mt-6 text-uitext italic text-ink-soft">
            <Link to="/login" className="text-verdigris">
              Sign in
            </Link>{" "}
            to open the Agora.
          </p>
        )}
      </div>
    </div>
  );
}

function plural(n, one) {
  return `${n} ${n === 1 ? one : `${one}s`}`;
}
