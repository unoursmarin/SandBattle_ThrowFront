// FICHIER TEMPORAIRE — utilisé uniquement pour les captures d'écran du README.
// Monte la scène 3D avec des props simulées (aucun backend requis).
// À SUPPRIMER après la génération des screenshots.
import { BowlingScene } from "@/features/game/scene/BowlingScene";
import { Scoreboard } from "@/features/game/Scoreboard";
import { RollStatus } from "@/features/game/RollStatus";
import type { GameSessionSnapshot } from "@/lib/api/schemas";

const GAME_ID = "00000000-0000-0000-0000-000000000000";
const MY_ID = "11111111-1111-1111-1111-111111111111";
const ALICE_ID = "22222222-2222-2222-2222-222222222222";

function mockGame(pinsStanding: number): GameSessionSnapshot {
  return {
    gameId: GAME_ID,
    status: "IN_PROGRESS",
    currentPlayerId: MY_ID,
    players: [
      {
        playerId: MY_ID,
        displayName: "Vous",
        complete: false,
        totalScore: 42,
        frames: [
          { number: 1, rolls: [10], status: "STRIKE", score: 24 },
          { number: 2, rolls: [6, 4], status: "SPARE", score: 18 },
          { number: 3, rolls: [8, 1], status: "OPEN", score: 9 },
          { number: 4, rolls: [pinsStanding === 15 ? 0 : 10 - pinsStanding], status: pinsStanding === 15 ? "IN_PROGRESS" : "OPEN", score: -1 },
        ],
        // @ts-expect-error - temporaire
        totalRolls: 7,
      },
      {
        playerId: ALICE_ID,
        displayName: "Alice",
        complete: false,
        totalScore: 38,
        frames: [
          { number: 1, rolls: [7, 2], status: "OPEN", score: 9 },
          { number: 2, rolls: [10], status: "STRIKE", score: 30 },
          { number: 3, rolls: [5, 3], status: "OPEN", score: 8 },
          { number: 4, rolls: [], status: "IN_PROGRESS", score: -1 },
        ],
        // @ts-expect-error - temporaire
        totalRolls: 6,
      },
    ],
  };
}

const FAKE_SUBMIT_ROLL = {
  isPending: false,
  isError: false,
  mutate: () => undefined,
  mutateAsync: () => Promise.resolve(undefined),
  data: null,
  error: null,
  reset: () => undefined,
  isIdle: true,
  isSuccess: false,
  status: "idle",
  failureCount: 0,
  failureReason: null,
  variables: null,
  context: null,
  submittedAt: 0,
} as unknown as ReturnType<typeof import("@/features/game/useSubmitRoll").useSubmitRoll>;

export function PreviewPage({
  projectileType,
  laneSize,
}: {
  projectileType: "ball" | "stick";
  laneSize: "small" | "medium" | "large";
}) {
  const game = mockGame(15);

  return (
    <main className="fixed inset-0 overflow-hidden bg-stone-950">
      <BowlingScene
        pinsStanding={15}
        rollSequence={0}
        canThrow
        onRollComplete={() => undefined}
        celebration={null}
        projectileType={projectileType}
        laneSize={projectileType === "stick" ? "small" : laneSize}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto rounded-lg border border-stone-700 border-t-2 border-t-gold-500 bg-stone-950/82 p-4 shadow-warm backdrop-blur-[10px] absolute top-4 right-4 w-[min(440px,calc(100vw-2rem))]">
          <Scoreboard game={game} myPlayerId={MY_ID} />
        </div>
        <div className="absolute right-4 bottom-4 flex justify-end">
          <RollStatus
            key="preview"
            isMyTurn
            isGameInProgress
            submitRoll={FAKE_SUBMIT_ROLL}
            lastRollPinsFelled={null}
            currentPlayerName="Vous"
            projectileType={projectileType}
          />
        </div>
      </div>
    </main>
  );
}