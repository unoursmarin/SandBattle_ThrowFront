import { type FocusEvent, type PointerEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { CopyLobbyIdButton } from "./CopyLobbyIdButton";

const CLOSE_DELAY_MS = 150;
const HINT_TRAVEL_PX = 4;
const HINT_DURATION_S = 1.6;
const HINT_REPEAT_COUNT = 4;

// Chevron up icon component from google fonts
function ChevronUpIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      height="24px"
      viewBox="0 -960 960 960"
      width="24px"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z" />
    </svg>
  );
}

export function InviteDrawer({ lobbyId }: { lobbyId: string }) {
  const reduceMotion = useReducedMotion();
  const cardId = useId();
  const [isOpen, setOpen] = useState(false);
  const isPinned = useRef(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => clearTimeout(closeTimeout.current), []);

  // Cleans the card  
  const close = useCallback(() => {
    clearTimeout(closeTimeout.current);
    isPinned.current = false;
    if (containerRef.current?.contains(document.activeElement) && document.activeElement !== buttonRef.current) {
      buttonRef.current?.focus();
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    // Cleans the card when clicked out
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (isPinned.current && !containerRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isOpen, close]);

  // Hover shows the card
  const handlePointerEnter = useCallback((event: PointerEvent) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    clearTimeout(closeTimeout.current);
    setOpen(true);
  }, []);

  // UnHover closes
  const handlePointerLeave = useCallback((event: PointerEvent) => {
    if (event.pointerType !== "mouse" || isPinned.current) {
      return;
    }
    clearTimeout(closeTimeout.current);
    closeTimeout.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [close]);


  // Focuses to pin the card 
  const handleFocus = useCallback((event: FocusEvent) => {
    if (event.target.matches(":focus-visible")) {
      clearTimeout(closeTimeout.current);
      isPinned.current = true;
    }
  }, []);

  // First click just pins the card
  const handleClick = useCallback(() => {
    clearTimeout(closeTimeout.current);
    if (isOpen && isPinned.current) {
      close();
      return;
    }
    isPinned.current = true;
    setOpen(true);
  }, [isOpen, close]);

  const chevronAnimation = reduceMotion
    ? { y: 0, rotate: isOpen ? 180 : 0 }
    : isOpen
      ? { y: 0, rotate: 180 }
      : { y: [0, -HINT_TRAVEL_PX, 0], rotate: 0 };
  const chevronTransition = reduceMotion
    ? { duration: 0 }
    : isOpen
      ? { duration: 0.25, ease: "easeOut" as const }
      : {
          y: { repeat: HINT_REPEAT_COUNT, duration: HINT_DURATION_S, ease: "easeInOut" as const },
          rotate: { duration: 0.25, ease: "easeOut" as const },
        };

  
  // The containers ignors the hover, the card itself handles pointer events.
  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-x-0 bottom-full z-20 mb-1 flex flex-col items-stretch"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
    >
      <motion.div
        id={cardId}
        className={isOpen ? "pointer-events-auto" : undefined}
        initial={false}
        animate={{ opacity: isOpen ? 1 : 0, y: isOpen ? 0 : 10 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28 }}
        // `inert` makes the card non-interactive when closed.
        inert={!isOpen}
      >
        <Card
          role="region"
          className="bg-none bg-stone-900/60 p-4 shadow-none backdrop-blur-md"
          aria-label="Invitation"
        >
          <p className="text-sand-200">
            Partagez cet identifiant pour inviter d'autres joueurs : <CopyLobbyIdButton lobbyId={lobbyId} />
          </p>
        </Card>
      </motion.div>

      <button
        ref={buttonRef}
        type="button"
        className="pointer-events-auto mx-auto mt-1 flex size-8 cursor-pointer items-center justify-center rounded-full text-sand-200 transition-colors duration-150 hover:text-gold-300 focus-visible:text-gold-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
        aria-expanded={isOpen}
        aria-controls={cardId}
        aria-label="Identifiant du lobby"
        onClick={handleClick}
      >
        <motion.span className="flex" initial={false} animate={chevronAnimation} transition={chevronTransition}>
          <ChevronUpIcon />
        </motion.span>
      </button>
    </div>
  );
}
