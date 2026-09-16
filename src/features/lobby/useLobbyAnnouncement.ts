import { useEffect, useRef, useState } from "react";

import type { LobbyMemberSnapshot } from "@/lib/api/schemas";

// Lobby announcement hook
export function useLobbyAnnouncement(members: LobbyMemberSnapshot[] | undefined): string {
  const [announcement, setAnnouncement] = useState("");
  const previousRef = useRef<Map<string, LobbyMemberSnapshot> | null>(null);

  useEffect(() => {
    if (!members) return;

    const previous = previousRef.current;
    const current = new Map(members.map((member) => [member.memberId, member]));
    previousRef.current = current;

   
   if (previous === null) return;

    for (const [memberId, member] of current) {
      const before = previous.get(memberId);
      if (!before) {
        setAnnouncement(`${member.displayName} a rejoint le lobby.`);
        return;
      }
      if (before.ready !== member.ready) {
        setAnnouncement(member.ready ? `${member.displayName} est prêt.` : `${member.displayName} n'est plus prêt.`);
        return;
      }
    }
    for (const [memberId, member] of previous) {
      if (!current.has(memberId)) {
        setAnnouncement(`${member.displayName} a quitté le lobby.`);
        return;
      }
    }
  }, [members]);

  return announcement;
}
