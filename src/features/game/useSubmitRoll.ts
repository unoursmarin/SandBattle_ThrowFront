import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitRoll } from "@/lib/api/endpoints";

import { gameQueryKey } from "./useGameQuery";
import { applyRollUpdate } from "./gameCache";

export function useSubmitRoll(gameId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { sessionToken: string; pins: number; throwId?: string }) =>
      submitRoll(gameId, args.sessionToken, args.pins, args.throwId),
    onSuccess: (event) => {
      applyRollUpdate(queryClient, gameQueryKey(gameId), event);
    },
  });
}
