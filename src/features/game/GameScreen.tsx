import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { loadGameSessionToken } from "@/lib/session/sessionStorage";
import { loadLaneSize, loadProjectileChoice } from "@/lib/session/sessionStorage";

import { RollStatus } from "./RollStatus";
import { Scoreboard } from "./Scoreboard";
import { BowlingScene } from "./scene/BowlingScene";
import { lastConfirmedRollPinsFelled, pinsRemainingForFrame } from "./frameDisplay";
import { useCelebrationEvents } from "./useCelebrationEvents";
import { useGameQuery, useWhoAmIQuery } from "./useGameQuery";
import { useGameStompEvents } from "./useGameStompEvents";
import { useSubmitRoll } from "./useSubmitRoll";

export function GameScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  if (!gameId) {
    throw new Error("gameId manquant dans l'URL");
  }

  const navigate = useNavigate();
  const sessionToken = loadGameSessionToken(gameId);
  const gameQuery = useGameQuery(gameId);
  const meQuery = useWhoAmIQuery(gameId, sessionToken);
  const submitRoll = useSubmitRoll(gameId);
  useGameStompEvents(gameId);
  const myPlayerId = meQuery.data?.playerId;
  const me = gameQuery.data?.players.find((p) => p.playerId === myPlayerId);
  const celebration = useCelebrationEvents(me);

  if (gameQuery.isPending) {
    return <p className="p-12 text-center">Chargement de la partie…</p>;
  }
  if (gameQuery.isError) {
    return (
      <p className="p-12 text-center mt-2 text-sm text-error-600" role="alert">
        {gameQuery.error.message}
      </p>
    );
  }

  const game = gameQuery.data;
  const isMyTurn = game.status === "IN_PROGRESS" && game.currentPlayerId === myPlayerId;
  const currentPlayerName = game.players.find((p) => p.playerId === game.currentPlayerId)?.displayName ?? null;
  const currentFrame = me?.frames.find((f) => f.status === "IN_PROGRESS");
  const pinsStanding = currentFrame ? pinsRemainingForFrame(currentFrame.rolls) : 15;
  const totalRollsSoFar = me?.frames.reduce((sum, f) => sum + f.rolls.length, 0) ?? 0;
  const canThrow = Boolean(sessionToken) && isMyTurn && !submitRoll.isPending;
  const lastRollPinsFelled = me ? lastConfirmedRollPinsFelled(me.frames) : null;
  const projectileType = loadProjectileChoice();

  function handleRollComplete(pinsFelled: number) {
    if (!sessionToken) return;
    submitRoll.mutate({ sessionToken, pins: pinsFelled });
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-stone-950">
      <BowlingScene
        pinsStanding={pinsStanding}
        rollSequence={totalRollsSoFar}
        canThrow={canThrow}
        onRollComplete={handleRollComplete}
        celebration={celebration}
        projectileType={projectileType}
        laneSize={projectileType === "stick" ? "small" : loadLaneSize()}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto rounded-lg border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-4 shadow-warm backdrop-blur-[10px] absolute top-4 left-4 max-w-[60vw] max-sm:top-1/2 max-sm:left-1/2 max-sm:-translate-x-1/2 max-sm:-translate-y-1/2 max-sm:max-w-[calc(100vw-2rem)] max-sm:p-0 max-sm:border-none max-sm:bg-transparent max-sm:shadow-none max-sm:backdrop-blur-none max-sm:text-center max-sm:pointer-events-none">
          <h1 className="m-0 text-[clamp(1.5rem,1.3rem+0.8vw,2rem)] max-sm:hidden">
            {game.status === "COMPLETED" ? "Partie terminée" : "Partie en cours"}
          </h1>
          {game.status === "COMPLETED" && (
            <p
              className="mt-2 font-display text-base text-gold-500 max-sm:inline-block max-sm:m-0 max-sm:px-6 max-sm:py-4 max-sm:text-[clamp(1.5rem,1.3rem+0.8vw,2rem)] max-sm:text-gold-300 max-sm:[text-shadow:0_1px_8px_rgb(0_0_0_/_0.6)] max-sm:bg-stone-950/88 max-sm:border max-sm:border-gold-500 max-sm:rounded-lg max-sm:shadow-warm"
              role="status"
            >
              La partie est terminée, bien joué !
            </p>
          )}
        </div>

        <div className="pointer-events-auto rounded-lg border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-4 shadow-warm backdrop-blur-[10px] absolute top-4 right-4 w-[min(440px,calc(100vw-2rem))] max-h-[min(55vh,calc(100vh-2rem))] overflow-y-auto max-sm:top-4 max-sm:left-4 max-sm:right-4 max-sm:w-auto max-sm:max-h-[28vh] max-sm:opacity-55 max-sm:transition-opacity max-sm:duration-200 max-sm:hover:opacity-100 max-sm:focus-within:opacity-100">
          <Scoreboard game={game} myPlayerId={myPlayerId} />
        </div>

        <div className="absolute right-4 bottom-4 flex justify-end">
          {sessionToken ? (
            <RollStatus
              key={`${game.currentPlayerId ?? "none"}-${totalRollsSoFar}`}
              isMyTurn={isMyTurn}
              isGameInProgress={game.status === "IN_PROGRESS"}
              submitRoll={submitRoll}
              lastRollPinsFelled={lastRollPinsFelled}
              currentPlayerName={currentPlayerName}
              projectileType={projectileType}
            />
          ) : (
            <p
              className="pointer-events-auto rounded-lg border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-4 shadow-warm backdrop-blur-[10px] m-0 w-[min(260px,calc(100vw-2rem))] text-sm text-error-600"
              role="alert"
            >
              Jeton de session introuvable pour cette partie. Retournez au lobby pour le retrouver.
            </p>
          )}
        </div>

        <div className="absolute left-4 bottom-4 pointer-events-auto">
 
          <Button
            type="button"
            variant="secondary"
            className="w-auto mt-0 bg-stone-950/82 shadow-warm backdrop-blur-[10px] hover:not-disabled:bg-gold-500 hover:not-disabled:text-stone-950"
            onClick={() => navigate("/")}
          >
            Quitter
          </Button>
        </div>
      </div>
    </main>
  );
}
