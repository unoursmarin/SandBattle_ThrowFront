import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InviteDrawer } from "./InviteDrawer";
import { LobbySlideshowBackground } from "./LobbySlideshowBackground";
import { useLobbyMembership } from "./useLobbyMembership";
import { laneSizeFor, type LaneSize } from "@/features/game/scene/laneSizes";
import { useLaneSize } from "./useLaneSize";
import { useProjectileChoice } from "./useProjectileChoice";
import { useLobbyQuery } from "./useLobbyQuery";
import {
  useJoinLobbyMutation,
  useLeaveLobbyMutation,
  useSetReadyMutation,
  useStartGameMutation,
} from "./useLobbyMutations";
import { useLobbyAnnouncement } from "./useLobbyAnnouncement";
import { useLobbyStompEvents } from "./useLobbyStompEvents";
import { saveGameSessionToken } from "@/lib/session/sessionStorage";

// Only for Balls
const LANE_SIZE_OPTIONS: { value: LaneSize; label: string }[] = [
  { value: "small", label: "Petite" },
  { value: "medium", label: "Moyenne" },
  { value: "large", label: "Grande" },
];

export function LobbyRoom() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  if (!lobbyId) {
    throw new Error("lobbyId manquant dans l'URL");
  }

  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { membership, setMembership, clear: clearMembership } = useLobbyMembership(lobbyId);
  const { choice: projectileChoice, setChoice: setProjectileChoice } = useProjectileChoice();
  const { size: laneSize, setSize: setLaneSize } = useLaneSize();

  const lobbyQuery = useLobbyQuery(lobbyId);
  const setReadyMutation = useSetReadyMutation(lobbyId);
  const startGameMutation = useStartGameMutation(lobbyId);
  const leaveLobbyMutation = useLeaveLobbyMutation(lobbyId);

  // Unconditionnal Hook : must be called on every render, before any early return.
  const rosterAnnouncement = useLobbyAnnouncement(lobbyQuery.data?.members);

  async function handleLeave(sessionToken: string) {
    await leaveLobbyMutation.mutateAsync(sessionToken);
    clearMembership();
    navigate("/");
  }

  // Valid token remains within the game we copy the key scoped to the gameId before navigationg
  const goToGame = useCallback(
    (gameSessionId: string) => {
      if (membership) {
        saveGameSessionToken(gameSessionId, membership.sessionToken);
      }
      navigate(`/game/${gameSessionId}`);
    },
    [membership, navigate],
  );
  useLobbyStompEvents(lobbyId, goToGame);

  const lobby = lobbyQuery.data;

  useEffect(() => {
    if (lobby?.gameSessionId) {
      goToGame(lobby.gameSessionId);
    }

    // GoToGame is ommited on purpose we only need to depend on gamesessionId
  }, [lobby?.gameSessionId]);


  //  Only one way out, no return. Lobby stays mounted throughout the component's lifecycle.

  let content: ReactNode;

  if (lobbyQuery.isPending) {
    content = <p className="py-12 text-center">Chargement du lobby…</p>;
  } else if (lobbyQuery.isError) {
    content = (
      <p className="py-12 text-center text-error-600" role="alert">
        {lobbyQuery.error.message}
      </p>
    );
  } else if (!lobby) {
    content = null;
  } else if (!membership) {
    content = <JoinPrompt lobbyId={lobbyId} onJoined={setMembership} />;
  } else {
    // Const of lobby, immutables
    const isHost = lobby.hostMemberId === membership.memberId;
    const self = lobby.members.find((m) => m.memberId === membership.memberId);
    const memberCount = lobby.members.length;
    const readyCount = lobby.members.filter((m) => m.ready).length;
    const allReady = lobby.members.every((m) => m.ready);
    const canStart = allReady;
    const startBlockedReason = !allReady ? "En attente que tout le monde soit prêt…" : null;

    content = (
      <>

        <h1 className="fixed top-6 left-6 z-30 text-xl">Lobby</h1>

        <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center px-4 pb-12 pt-64 sm:pt-[clamp(12rem,20dvh,14rem)]">
          <div className="relative">
            <InviteDrawer lobbyId={lobbyId} />

            {/* membres */}
            <Card
              className="relative z-10 bg-none bg-stone-900/60 backdrop-blur-md"
              aria-label="Membres du lobby"
            >
            <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0">
              <AnimatePresence initial={false}>
                {lobby.members.map((member) => (
                  <motion.li
                    key={member.memberId}
                    layout={!reduceMotion}
                    initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0 }}
                    className="flex items-center justify-between rounded-md border border-stone-700 bg-stone-900 px-4 py-3"
                  >
                    <span>
                      {member.displayName}
                      {member.memberId === lobby.hostMemberId && (
                        <span className="ml-2 font-mono text-xs font-medium uppercase tracking-[0.1em] text-gold-500">hôte</span>
                      )}
                    </span>
                    <span
                      className={`font-mono text-xs uppercase tracking-[0.1em] ${member.ready ? "font-semibold text-ok-500" : "font-medium text-sand-200"}`}
                    >
                      {member.ready ? "Prêt" : "En attente"}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/*  That's where we keep the players, hidden for users just to send to srv each time there's an update */}
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {rosterAnnouncement}
            </div>

            {/* Visible to everyone in order to see who's ready and who's not */}
            <p className="text-sand-200" aria-live="polite">
              <span className="font-mono tabular-nums">
                {readyCount}/{memberCount}
              </span>{" "}
              prêt{readyCount > 1 ? "s" : ""}.{startBlockedReason ? ` ${startBlockedReason}` : ""}
            </p>

            {self && (
              <Button
                type="button"
                variant={self.ready ? "active" : "secondary"}
                className="mt-6"
                onClick={() =>
                  setReadyMutation.mutate({ sessionToken: membership.sessionToken, ready: !self.ready })
                }
                disabled={setReadyMutation.isPending}
              >
                {self.ready ? "Je ne suis plus prêt" : "Je suis prêt"}
              </Button>
            )}

            {isHost && (
              <Button
                type="button"
                variant="primary"
                className="mt-6"
                disabled={!canStart || startGameMutation.isPending}
                onClick={() =>
                  startGameMutation.mutate({
                    sessionToken: membership.sessionToken,
                    projectile: projectileChoice,
                    laneSize: laneSizeFor(projectileChoice, laneSize),
                  })
                }
              >
                {startGameMutation.isPending ? "Démarrage…" : "Démarrer la partie"}
              </Button>
            )}
            {startGameMutation.isError && (
              <p className="mt-2 text-sm text-error-600" role="alert">
                {startGameMutation.error.message}
              </p>
            )}
          </Card>
        </div>

        {/* The host picks the projectile and the lane for the whole game: a replay is only right on the lane it was thrown on. */}
        {isHost ? (
          <>
        <Card className="relative z-10 mt-4 bg-none bg-stone-900/60 backdrop-blur-md" aria-label="Objet de lancer">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.1em]">Objet de lancer</legend>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-stone-700 bg-stone-900 px-4 py-3">
                <span>Boule de bowling</span>
                <input
                  type="radio"
                  name="projectile"
                  value="ball"
                  checked={projectileChoice === "ball"}
                  onChange={() => setProjectileChoice("ball")}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-stone-700 bg-stone-900 px-4 py-3">
                <span>Bâton de lancer</span>
                <input
                  type="radio"
                  name="projectile"
                  value="stick"
                  checked={projectileChoice === "stick"}
                  onChange={() => setProjectileChoice("stick")}
                />
              </label>
            </div>
          </fieldset>
        </Card>

        {projectileChoice === "ball" ? (
          <Card className="relative z-10 mt-4 bg-none bg-stone-900/60 backdrop-blur-md" aria-label="Taille de la piste">
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.1em]">Taille de la piste</legend>
              <div className="flex flex-col gap-2">
                {LANE_SIZE_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-stone-700 bg-stone-900 px-4 py-3"
                  >
                    <span>{label}</span>
                    <input
                      type="radio"
                      name="lane-size"
                      value={value}
                      checked={laneSize === value}
                      onChange={() => setLaneSize(value)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        ) : (
          <p className="relative z-10 mt-4 text-sm text-sand-200">Le bâton se joue sur la petite piste.</p>
        )}
          </>
        ) : (
          <p className="relative z-10 mt-4 text-sm text-sand-200">
            L'hôte choisit l'objet de lancer et la piste pour toute la partie.
          </p>
        )}

        {/*
        Mutable leave button depending on readiness state
         */}
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-auto"
          disabled={leaveLobbyMutation.isPending}
          onClick={() => void handleLeave(membership.sessionToken)}
        >
          {leaveLobbyMutation.isPending ? "Départ…" : "Quitter le lobby"}
        </Button>
          {leaveLobbyMutation.isError && (
            <p className="mt-2 text-sm text-error-600" role="alert">
              {leaveLobbyMutation.error.message}
            </p>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <LobbySlideshowBackground />
      {content}
    </>
  );
}

function JoinPrompt({
  lobbyId,
  onJoined,
}: {
  lobbyId: string;
  onJoined: (membership: { lobbyId: string; memberId: string; displayName: string; sessionToken: string }) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const joinMutation = useJoinLobbyMutation(lobbyId);

  // Submit to serv users 
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const membership = await joinMutation.mutateAsync(displayName.trim());
    onJoined(membership);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center px-4 py-12">
      <h1>Rejoindre le lobby</h1>
      <Card asChild>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <Label htmlFor="join-display-name">Votre nom</Label>
          <Input
            id="join-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={1}
          />
          <Button type="submit" variant="primary" className="mt-6 text-white-600" disabled={joinMutation.isPending}>
            {joinMutation.isPending ? "Connexion…" : "Rejoindre"}
          </Button>
          {joinMutation.isError && (
            <p className="mt-2 text-sm text-error-600" role="alert">
              {joinMutation.error.message}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}
