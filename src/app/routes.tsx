import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { HomeScreen } from "@/features/lobby/HomeScreen";
import { LobbyRoom } from "@/features/lobby/LobbyRoom";

const GameScreen = lazy(() => import("@/features/game/GameScreen").then((m) => ({ default: m.GameScreen })));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/lobby/:lobbyId" element={<LobbyRoom />} />
      <Route
        path="/game/:gameId"
        element={
          <Suspense fallback={<p className="p-12 text-center">Chargement de la scène…</p>}>
            <GameScreen />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
