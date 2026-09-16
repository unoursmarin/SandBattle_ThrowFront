import { type FormEvent, type ReactNode, lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateLobbyMutation, useJoinLobbyMutation } from "./useLobbyMutations";
import { saveMembership } from "@/lib/session/sessionStorage";
import telemisLogoFlat from "@/assets/telemis_logo.jpg";
import "./home-screen.css";

// Canvas three.js/react-three-fiber isolated in its own chunk
const TelemisLogoMedallion = lazy(() =>
  import("./TelemisLogoMedallion").then((m) => ({ default: m.TelemisLogoMedallion })),
);

export function HomeScreen() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  // Local state for the home screen component
  const [activeMode, setActiveMode] = useState<"create" | "join">("create");
  const createLobby = useCreateLobbyMutation();
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinLobbyId, setJoinLobbyId] = useState("");
  const joinLobbyMutation = useJoinLobbyMutation(joinLobbyId);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const membership = await createLobby.mutateAsync(createName.trim());
    saveMembership(membership.lobbyId, membership);
    navigate(`/lobby/${membership.lobbyId}`);
  }

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    const membership = await joinLobbyMutation.mutateAsync(joinName.trim());
    saveMembership(membership.lobbyId, membership);
    navigate(`/lobby/${membership.lobbyId}`);
  }

  return (
    <main className="home-screen relative mx-auto max-w-[960px] px-4 py-12">
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[3fr_2fr] md:gap-12">
        <motion.div
          className="flex flex-col items-center text-center md:items-start md:text-left"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-6 aspect-square w-full max-w-[260px] drop-shadow-[0_8px_16px_rgb(28_20_16_/_0.5)] md:max-w-[340px]">
            <Suspense
              fallback={
                <img
                  src={telemisLogoFlat}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full rounded-full object-cover"
                />
              }
            >
              <TelemisLogoMedallion />
            </Suspense>
          </div>
          <h1>Telemis Bowl</h1>
          <p className="mt-2 max-w-[46ch] text-lg text-sand-200">
            Des fouilles archéologiques récentes ont mis au jour les règles d'un
            jeu ancien, étrangement proche du bowling. Reconstituez-le en temps
            réel avec vos amis.
          </p>
        </motion.div>
        <div className="relative grid grid-cols-1">
          <SwapButton onSwap={() => setActiveMode((mode) => (mode === "create" ? "join" : "create"))} />
          <StackedCard
            isActive={activeMode === "create"}
            onActivate={() => setActiveMode("create")}
            label="Créer une partie"
            reduceMotion={reduceMotion}
          >
            <CardSparkles reduceMotion={reduceMotion} />
            <h2>Créer une partie</h2>
            <TitleGlow reduceMotion={reduceMotion} />
            <form onSubmit={(e) => void handleCreate(e)}>
              <LabelInputContainer>
                <Label htmlFor="create-name" className="mt-0 mb-0">
                  Votre nom
                </Label>
                <Input
                  id="create-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Alice"
                  required
                  minLength={1}
                  pattern=".*\S.*"
                  title="Doit contenir au moins un caractère visible"
                />
              </LabelInputContainer>
              <Button
                type="submit"
                variant="primary"
                className="group/btn relative mt-6 text-white"
                disabled={createLobby.isPending}
              >
                {createLobby.isPending ? "Création…" : "Créer le lobby"}
                <BottomGradient />
              </Button>
              {createLobby.isError && (
                <p className="mt-2 text-sm text-error-600" role="alert">
                  {createLobby.error.message}
                </p>
              )}
            </form>
          </StackedCard>

          <StackedCard
            isActive={activeMode === "join"}
            onActivate={() => setActiveMode("join")}
            label="Rejoindre une partie"
            reduceMotion={reduceMotion}
          >
            <CardSparkles reduceMotion={reduceMotion} />
            <h2>Rejoindre une partie</h2>
            <TitleGlow reduceMotion={reduceMotion} />
            <form onSubmit={(e) => void handleJoin(e)}>
              <LabelInputContainer>
                <Label htmlFor="join-id" className="mt-0 mb-0">
                  Identifiant du lobby
                </Label>
                <Input
                  id="join-id"
                  value={joinLobbyId}
                  onChange={(e) => setJoinLobbyId(e.target.value.trim())}
                  placeholder="Collé depuis le lien partagé"
                  required
                />
              </LabelInputContainer>
              <LabelInputContainer className="mt-4">
                <Label htmlFor="join-name" className="mt-0 mb-0">
                  Votre nom
                </Label>
                <Input
                  id="join-name"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Bob"
                  required
                  minLength={1}
                  pattern=".*\S.*"
                  title="Doit contenir au moins un caractère visible"
                />
              </LabelInputContainer>
              <Button
                type="submit"
                variant="secondary"
                className="group/btn relative mt-6 text-white-600"
                disabled={joinLobbyMutation.isPending}
              >
                {joinLobbyMutation.isPending ? "Connexion…" : "Rejoindre"}
                <BottomGradient />
              </Button>
              {joinLobbyMutation.isError && (
                <p className="mt-2 text-sm text-error-600" role="alert">
                  {joinLobbyMutation.error.message}
                </p>
              )}
            </form>
          </StackedCard>
        </div>
      </div>
    </main>
  );
}

type StackedCardProps = {
  isActive: boolean;
  onActivate: () => void;
  label: string;
  reduceMotion: boolean | null;
  children: ReactNode;
};


function StackedCard({ isActive, onActivate, label, reduceMotion, children }: StackedCardProps) {
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 280, damping: 24, zIndex: { duration: 0 } };

  return (
    <motion.div
      className="[grid-area:1/1]"
      style={{ transformOrigin: "85% 15%" }}
      animate={{
        x: isActive ? 0 : 32,
        y: isActive ? 0 : 12,
        rotate: isActive ? 0 : 7,
        scale: isActive ? 1 : 0.94,
        zIndex: isActive ? 20 : 10,
        filter: isActive ? "brightness(100%) grayscale(0%)" : "brightness(35%) grayscale(60%)",
      }}
      transition={transition}
      onClick={onActivate}
      role={isActive ? undefined : "button"}
      tabIndex={isActive ? undefined : 0}
      aria-label={isActive ? undefined : label}
      onKeyDown={
        isActive
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate();
              }
            }
      }
    >
      <Card
        className={cn(
          "relative overflow-hidden rounded-xl",
          isActive ? "cursor-default" : "cursor-pointer shadow-none",
        )}
        {...(isActive ? {} : { inert: true })}
      >
        {children}
      </Card>
    </motion.div>
  );
}

const SPARKLE_POSITIONS = [
  { top: "12%", left: "18%", duration: 3.2, delay: 0 },
  { top: "28%", left: "82%", duration: 2.6, delay: 0.6 },
  { top: "68%", left: "12%", duration: 3.6, delay: 1.1 },
  { top: "80%", left: "70%", duration: 2.9, delay: 0.3 },
  { top: "45%", left: "92%", duration: 3.1, delay: 1.6 },
] as const;

//spakles on cards
function CardSparkles({ reduceMotion }: { reduceMotion: boolean | null }) {
  if (reduceMotion) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {SPARKLE_POSITIONS.map((sparkle, index) => (
        <motion.span
          key={index}
          className="absolute h-[3px] w-[3px] rounded-full bg-gold-300"
          style={{ top: sparkle.top, left: sparkle.left }}
          animate={{ opacity: [0, 1, 0], scale: [0.5, 1.3, 0.5] }}
          transition={{ duration: sparkle.duration, delay: sparkle.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/** Title glow effect */
function TitleGlow({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <motion.div
      aria-hidden="true"
      className="my-3 h-px w-full bg-gradient-to-r from-transparent via-gold-500 to-transparent"
      animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
      transition={reduceMotion ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** Groups Label + Input with a tight and consistent vertical rhythm. */
function LabelInputContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex w-full flex-col gap-2", className)}>{children}</div>;
}

/** Bottom gradient effect for buttons on hover/focus. */
function BottomGradient() {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-terracotta-400 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
}

/** Circular button overlaid on the stack — toggles Create/Join on click,
 * lights up and rotates the icon on hover/focus to indicate that the user
 * can choose the other card without having to aim for the thin strip of
 * the grayed-out card underneath (see StackedCard).
 */
function SwapButton({ onSwap }: { onSwap: () => void }) {
  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label="Basculer entre Créer une partie et Rejoindre une partie"
      className="group absolute -top-3 -right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-gold-500 bg-stone-900 text-gold-500 shadow-warm transition-[color,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-gold-300 hover:text-gold-300 hover:shadow-[0_0_18px_2px_rgb(201_154_62_/_0.6)] focus-visible:border-gold-300 focus-visible:text-gold-300 focus-visible:shadow-[0_0_18px_2px_rgb(201_154_62_/_0.6)]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
        className="size-5 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-180 group-focus-visible:rotate-180"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button>
  );
}
