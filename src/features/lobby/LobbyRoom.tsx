import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyLobbyIdButton } from "./CopyLobbyIdButton";
import { LobbySlideshowBackground } from "./LobbySlideshowBackground";
import { useLobbyMembership } from "./useLobbyMembership";
import type { LaneSize } from "@/features/game/scene/laneSizes";
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

export function LobbyRoom() {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  if (!lobbyId) {
    throw new Error("lobbyId manquant dans l'URL");
  }

  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  // Tiroir de l'identifiant (voir le bloc "Invitation" plus bas) : fermé
  // par défaut, ouvert au survol/focus/clic de la poignée rainurée.
  const [isInviteOpen, setInviteOpen] = useState(false);
  const { membership, setMembership, clear: clearMembership } = useLobbyMembership(lobbyId);
  const { choice: projectileChoice, setChoice: setProjectileChoice } = useProjectileChoice();
  const { size: laneSize, setSize: setLaneSize } = useLaneSize();

  // Le bâton ne se joue que sur petite piste : basculer sur le bâton
  // réinitialise une taille moyenne/grande déjà choisie, pour ne jamais
  // envoyer en partie une combinaison invalide.
  useEffect(() => {
    if (projectileChoice === "stick" && laneSize !== "small") {
      setLaneSize("small");
    }
  }, [projectileChoice, laneSize, setLaneSize]);

  const laneSizeOptions: { value: LaneSize; label: string }[] =
    projectileChoice === "stick"
      ? [{ value: "small", label: "Petite" }]
      : [
          { value: "small", label: "Petite" },
          { value: "medium", label: "Moyenne" },
          { value: "large", label: "Grande" },
        ];
  const lobbyQuery = useLobbyQuery(lobbyId);
  const setReadyMutation = useSetReadyMutation(lobbyId);
  const startGameMutation = useStartGameMutation(lobbyId);
  const leaveLobbyMutation = useLeaveLobbyMutation(lobbyId);
  // Calculé depuis le query result brut (pas depuis `lobby` plus bas, qui
  // n'existe qu'après les retours anticipés) : les Hooks doivent rester
  // inconditionnels, avant tout `return` — voir react/hooks.md.
  const rosterAnnouncement = useLobbyAnnouncement(lobbyQuery.data?.members);

  async function handleLeave(sessionToken: string) {
    await leaveLobbyMutation.mutateAsync(sessionToken);
    clearMembership();
    navigate("/");
  }

  // Le jeton de session reste valide dans la partie (voir sessionStorage.ts) :
  // on le republie sous une clé scopée au gameId avant de naviguer, pour que
  // l'écran de jeu puisse le retrouver sans connaître le lobbyId.
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
    // goToGame volontairement omis : ne dépendre que du gameSessionId évite de
    // renaviguer si `membership` change de référence sans changer de valeur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.gameSessionId]);

  // Un seul point de sortie (variable `content` ci-dessous, pas des `return`
  // anticipés) : LobbySlideshowBackground doit rester monté à l'identique
  // pendant les transitions chargement → JoinPrompt → salle d'attente,
  // sinon `vegas()` (qui construit son propre DOM dans son élément cible)
  // redémarrerait le diaporama depuis la première image à chaque fois.
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
    const isHost = lobby.hostMemberId === membership.memberId;
    const self = lobby.members.find((m) => m.memberId === membership.memberId);
    const memberCount = lobby.members.length;
    const readyCount = lobby.members.filter((m) => m.ready).length;
    // Solo autorisé délibérément : un hôte seul et prêt doit pouvoir démarrer
    // (retour explicite du produit — ne pas réintroduire de garde-fou sur
    // `memberCount` ici). Le repère "X/Y prêts" ci-dessous reste affiché dans
    // tous les cas : c'est un avertissement informatif, jamais un blocage.
    const allReady = lobby.members.every((m) => m.ready);
    const canStart = allReady;
    const startBlockedReason = !allReady ? "En attente que tout le monde soit prêt…" : null;

    content = (
      <>
        {/* Sortie du flux/centrage de la pile de cartes ci-dessous, ancrée
            au viewport : sinon le h1 réserve de la place juste au-dessus de
            la pile, exactement là où la carte d'invitation doit pouvoir
            sortir entièrement (voir plus bas) sans la chevaucher. */}
        <h1 className="fixed top-6 left-6 z-30 text-xl">Lobby</h1>

        <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center px-4 py-12">
          <div className="relative">
            {/* Poignée toujours présente : seule partie de la carte
                "invitation" qui dépasse au-dessus de la carte "Membres" par
                défaut — le reste (texte + copier) reste invisible (opacity 0,
                pas juste recouvert) tant qu'on n'a pas survolé/activé la
                poignée, pour ne rien laisser transparaître à travers la carte
                Membres désormais translucide ci-dessous. Sa propre rainure
                s'efface au moment où la carte révélée affiche la sienne (juste
                au-dessus) — jamais les deux en même temps, pour ne pas
                dédoubler le motif. `bottom-full` (pas `top-0`) : ancre son
                bord bas pile au bord haut de la carte Membres (le seul enfant
                encore dans le flux normal), pour qu'elle ne chevauche jamais
                cette dernière, quelle que soit sa hauteur. */}
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isInviteOpen}
              aria-label={isInviteOpen ? "Masquer l'identifiant du lobby" : "Afficher l'identifiant du lobby"}
              className="absolute inset-x-4 bottom-full z-20 mb-1 flex h-4 cursor-pointer items-center"
              onClick={() => setInviteOpen((open) => !open)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setInviteOpen((open) => !open);
                }
              }}
              onMouseEnter={() => setInviteOpen(true)}
            >
              <motion.div
                className="h-1.5 w-full rounded-sm opacity-55 bg-[repeating-linear-gradient(135deg,var(--color-terracotta-400)_0_8px,transparent_8px_16px)]"
                initial={false}
                animate={{ opacity: isInviteOpen ? 0 : 0.55 }}
                transition={{ duration: reduceMotion ? 0 : 0.15 }}
              />
            </div>

            {/* Carte "invitation" : glisse vers le haut (slide-in) et devient
                visible/cliquable au survol de la poignée ci-dessus (ou
                d'elle-même, une fois révélée, pour ne pas se refermer pendant
                qu'on vise le bouton copier). `bottom-full` comme la poignée :
                son bord bas reste ancré juste au-dessus de la carte Membres —
                elle grandit/apparaît entièrement vers le HAUT (jamais en
                recouvrant la carte Membres en dessous), quelle que soit sa
                hauteur de contenu. Sa propre rainure en haut (bleed via
                marges négatives, même technique que l'ancien design statique)
                garde la continuité visuelle avec la poignée qui vient de
                s'effacer. Translucide + floutée comme la carte Membres : on
                doit deviner le fond même quand la carte est révélée. */}
            <motion.div
              className={`absolute inset-x-0 bottom-full mb-1${isInviteOpen ? "" : " pointer-events-none"}`}
              style={{ zIndex: isInviteOpen ? 20 : 0 }}
              initial={false}
              animate={{ opacity: isInviteOpen ? 1 : 0, y: isInviteOpen ? 0 : 10 }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
              onMouseEnter={() => setInviteOpen(true)}
              onMouseLeave={() => setInviteOpen(false)}
            >
              <Card
                className="border-t-0 bg-none bg-stone-900/60 p-4 pt-5 shadow-none backdrop-blur-md"
                aria-label="Invitation"
              >
                <div
                  className="-mx-4 -mt-5 mb-3 h-1.5 w-full rounded-sm opacity-55 bg-[repeating-linear-gradient(135deg,var(--color-terracotta-400)_0_8px,transparent_8px_16px)]"
                  aria-hidden="true"
                />
                <p className="text-sand-200">
                  Partagez cet identifiant pour inviter d'autres joueurs :{" "}
                  <CopyLobbyIdButton lobbyId={lobbyId} />
                </p>
              </Card>
            </motion.div>

            {/* Carte "membres" : la surface qu'on regarde vraiment pendant
                l'attente. Translucide + floutée (Tailwind) plutôt que le
                dégradé opaque par défaut de `Card` : laisse deviner le
                diaporama derrière (voir LobbySlideshowBackground) tout en
                gardant le texte lisible. Garde la signature standard (filet
                or en haut, ombre chaude) : c'est la carte "artefact"
                principale de l'écran. Seul enfant encore dans le flux normal
                de `.relative` ci-dessus (poignée et carte invitation sont
                toutes deux `absolute`/`bottom-full`) : sa position définit
                le point d'ancrage des deux autres. */}
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

            {/* Région d'annonce dédiée, cachée visuellement (.sr-only) — pas la
                liste elle-même en aria-live : transformer la liste des membres
                en région live forcerait un lecteur d'écran à relire tous les
                membres à chaque join/leave/bascule prêt, pire que le silence
                actuel. Voir useLobbyAnnouncement.ts. */}
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {rosterAnnouncement}
            </div>

            {/* Visible de tous, pas seulement de l'hôte : donne à chacun le
                même repère de progression ("2/3 prêts") plutôt que de forcer
                un comptage manuel ligne par ligne — voir la critique de cet
                écran (heuristique Flexibilité/Efficacité). `aria-live` sur ce
                statut précis (contenu neuf, pas une reprise de l'existant) :
                annonce le changement aux lecteurs d'écran quand un joueur
                rejoint/se met prêt, sans toucher au reste de la liste. */}
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
                onClick={() => startGameMutation.mutate(membership.sessionToken)}
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

        <Card className="relative z-10 mt-4 bg-none bg-stone-900/60 backdrop-blur-md" aria-label="Taille de la piste">
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-3 font-mono text-xs font-medium uppercase tracking-[0.1em]">Taille de la piste</legend>
            {/* Bâton = petite piste uniquement : les autres tailles ne sont
                pas proposées (voir l'effet de réinitialisation plus haut). */}
            {projectileChoice === "stick" && (
              <p className="mb-3 text-sand-200">Le bâton se joue sur petite piste.</p>
            )}
            <div className="flex flex-col gap-2">
              {laneSizeOptions.map(({ value, label }) => (
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

        {/* `variant="secondary"` (contour visible) plutôt que `ghost` (qui se
            lisait comme un simple lien de texte, pas un bouton) — reste le
            composant shadcn `Button` dans les deux cas, seul l'habillage
            change. `w-auto` : ce bouton n'a pas besoin de la pleine largeur
            réservée aux actions principales du formulaire. */}
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
