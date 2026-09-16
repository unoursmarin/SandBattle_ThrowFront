import { useEffect, useState } from "react";

import type { ProjectileType } from "./scene/projectileTypes";
import type { useSubmitRoll } from "./useSubmitRoll";

const PROMPT_VISIBLE_MS = 3000;

function lastRollLabel(pinsFelled: number): string {
  return `Votre dernier lancer : ${pinsFelled} quille${pinsFelled === 1 ? "" : "s"} abattue${pinsFelled === 1 ? "" : "s"}`;
}


export function RollStatus({
  isMyTurn,
  isGameInProgress,
  submitRoll,
  lastRollPinsFelled,
  currentPlayerName,
  projectileType,
}: {
  isMyTurn: boolean;
  isGameInProgress: boolean;
  submitRoll: ReturnType<typeof useSubmitRoll>;
  lastRollPinsFelled: number | null;
  currentPlayerName: string | null;
  projectileType: ProjectileType;
}) {
  const [promptVisible, setPromptVisible] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setPromptVisible(false), PROMPT_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (!isGameInProgress) {
    return null;
  }

  const panelPinned = submitRoll.isPending || submitRoll.isError;

  return (
    <div aria-live="polite" aria-atomic="true" className="m-0 w-[min(260px,calc(100vw-2rem))]">
      {!isMyTurn ? (
        <div className="pointer-events-auto max-w-[260px] rounded-md border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-3 text-sm shadow-warm backdrop-blur-[10px]">
          <p className="text-sand-200">
            {currentPlayerName
              ? `En attente du tour de ${currentPlayerName}…`
              : "En attente du tour d'un autre joueur…"}
          </p>
          {lastRollPinsFelled !== null && (
            <p className="mt-1 font-semibold text-gold-500">{lastRollLabel(lastRollPinsFelled)}</p>
          )}
        </div>
      ) : promptVisible || panelPinned ? (
        <div
          className={`pointer-events-auto max-w-[260px] rounded-md border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-3 text-sm shadow-warm backdrop-blur-[10px]${promptVisible && !panelPinned ? " animate-[roll-status-fade_3s_ease_forwards] motion-reduce:animate-none" : ""}`}
        >
          <h2 className="m-0 mb-1 text-base">À vous de jouer</h2>
          <p className="text-sand-200">
            {projectileType === "stick"
              ? "Attrapez le bâton et lancez-le vers les quilles."
              : "Attrapez la boule et lancez-la vers les quilles."}
          </p>
          {lastRollPinsFelled !== null && (
            <p className="mt-1 font-semibold text-gold-500">{lastRollLabel(lastRollPinsFelled)}</p>
          )}
          {submitRoll.isPending && <p className="mt-2 text-sand-200">Lancer en cours…</p>}
          {submitRoll.isError && (
            <p className="mt-2 text-sm text-error-600" role="alert">
              {submitRoll.error.message}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
