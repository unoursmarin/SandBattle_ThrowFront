import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitRoll } from "@/lib/api/endpoints";
import type { GameSessionSnapshot } from "@/lib/api/schemas";

import { gameQueryKey } from "./useGameQuery";
import { mergeRollUpdate } from "./gameCache";

export function useSubmitRoll(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { sessionToken: string; pins: number }) =>
      submitRoll(gameId, args.sessionToken, args.pins),
    onSuccess: (event) => {
      queryClient.setQueryData<GameSessionSnapshot>(gameQueryKey(gameId), (prev) => mergeRollUpdate(prev, event));
    },
  });
}
