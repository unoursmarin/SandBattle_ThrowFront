import { motion, useReducedMotion } from "framer-motion";
import { cn } from "cn";

import type { GameSessionSnapshot, PlayerStateSnapshot } from "@/lib/api/schemas";

import { frameRollSymbols } from "./frameDisplay";

export function Scoreboard({ game, myPlayerId }: { game: GameSessionSnapshot; myPlayerId: string | undefined }) {
  const frameCount = game.players[0]?.frames.length ?? 0;

  return (
    <section aria-labelledby="scoreboard-heading">
      
      <h2 id="scoreboard-heading" className="sr-only">
        Tableau des scores
      </h2>
      {/* Player Grid*/}
      <div className="flex flex-col gap-2" role="table" aria-labelledby="scoreboard-heading">
        <div className="sr-only" role="row">
          <span role="columnheader">Joueur</span>
          {Array.from({ length: frameCount }, (_, i) => (
            <span key={i} role="columnheader">{`Frame ${i + 1}`}</span>
          ))}
          <span role="columnheader">Total</span>
        </div>
        {game.players.map((player) => (
          <PlayerRow
            key={player.playerId}
            player={player}
            isCurrent={player.playerId === game.currentPlayerId}
            isMe={player.playerId === myPlayerId}
          />
        ))}
      </div>
    </section>
  );
}

function PlayerRow({
  player,
  isCurrent,
  isMe,
}: {
  player: PlayerStateSnapshot;
  isCurrent: boolean;
  isMe: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      layout
      role="row"
      className={cn(
        "flex items-center gap-2 overflow-x-auto rounded-md border border-stone-700 bg-stone-900 px-3 py-2",
        isCurrent && "border-terracotta-400 shadow-[0_0_0_1px_var(--color-terracotta-400)]",
      )}
      animate={isCurrent && !reduceMotion ? { scale: [1, 1.01, 1] } : undefined}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="wrap-anywhere w-[4.25rem] flex-[0_0_4.25rem] font-body text-sm font-semibold leading-[1.2]" role="cell">
        {player.displayName}
        {isMe && <span className="mt-[2px] block text-xs text-sand-200">(vous)</span>}
        {isCurrent && (
          <span className="mt-[2px] block font-mono text-xs font-medium uppercase tracking-[0.1em] text-terracotta-400">à toi</span>
        )}
      </div>
      {/* This wrapper only exists for the paging and must not interfare with the row and cells in the accessibility of the table */}
      <div className="flex gap-1" role="presentation">
        {player.frames.map((frame) => (
          <div key={frame.number} className="min-w-[2.1rem] border-l border-stone-700 pl-1 text-center" role="cell">
            <div className="flex justify-center gap-[2px] text-xs text-sand-200">
              {frameRollSymbols(frame.rolls).map((symbol, i) => (
                <span
                  key={i}
                  className={symbol === "X" || symbol === "/" ? "font-bold text-gold-500" : undefined}
                >
                  {symbol}
                </span>
              ))}
            </div>
            <div className="font-mono text-sm font-semibold tabular-nums">
              {frame.status !== "IN_PROGRESS" ? frame.score : "-"}
            </div>
          </div>
        ))}
      </div>
      <div className="ml-auto flex-[0_0_auto] min-w-[2.5rem] text-right font-mono font-medium tabular-nums text-[clamp(1.125rem,1.05rem+0.3vw,1.375rem)] text-gold-500" role="cell">
        {player.totalScore}
      </div>
    </motion.div>
  );
}
