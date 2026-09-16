import { type MouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const PARTICLE_COUNT = 8;

type ParticleConfig = {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
};

function generateParticles(): ParticleConfig[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * (2 * Math.PI);
    const radius = 16 + Math.random() * 10;

    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.75,
      size: 3 + Math.random() * 2.5,
      duration: 0.5 + Math.random() * 0.2,
      delay: i * 0.035,
    };
  });
}

// Golden particle burst on click same  as the `MotionToggle` component
function ParticleBurst({ particles, origin }: { particles: ParticleConfig[]; origin: { x: number; y: number } }) {
  const BURST_GLOW_SIZE = 28;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <motion.div
        className="absolute rounded-full"
        style={{
          left: origin.x - BURST_GLOW_SIZE / 2,
          top: origin.y - BURST_GLOW_SIZE / 2,
          width: BURST_GLOW_SIZE,
          height: BURST_GLOW_SIZE,
          background: "radial-gradient(circle, var(--color-gold-500) 0%, transparent 70%)",
        }}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.8, 1.6], opacity: [0, 0.3, 0] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className="absolute rounded-full bg-gold-300"
          style={{
            left: origin.x - particle.size / 2,
            top: origin.y - particle.size / 2,
            width: particle.size,
            height: particle.size,
            filter: "blur(0.5px)",
          }}
          initial={{ scale: 0, opacity: 0.6, x: 0, y: 0 }}
          animate={{
            scale: [0, 1.1, 0],
            opacity: [0.6, 0.9, 0],
            x: [0, particle.x],
            y: [0, particle.y],
          }}
          transition={{ duration: particle.duration, delay: particle.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

//Copy session id in lobby
export function CopyLobbyIdButton({ lobbyId }: { lobbyId: string }) {
  const [copied, setCopied] = useState(false);
  const [burstCount, setBurstCount] = useState(0);
  const [burstOrigin, setBurstOrigin] = useState({ x: 0, y: 0 });
  const [bubblePosition, setBubblePosition] = useState<{ top: number; left: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dismissTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const particles = useMemo(() => (reduceMotion ? [] : generateParticles()), [reduceMotion]);

  useEffect(() => () => clearTimeout(dismissTimeout.current), []);

  useLayoutEffect(() => {
    if (!copied || !buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setBubblePosition({ top: rect.top, left: rect.left + rect.width / 2 });
  }, [copied]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lobbyId);
    } catch {
      return;
    }

    setCopied(true);
    setBurstCount((count) => count + 1);
    clearTimeout(dismissTimeout.current);
    dismissTimeout.current = setTimeout(() => setCopied(false), 1600);
  }, [lobbyId]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const hasPointerCoords = event.clientX !== 0 || event.clientY !== 0;
      setBurstOrigin({
        x: hasPointerCoords ? event.clientX - rect.left : rect.width / 2,
        y: hasPointerCoords ? event.clientY - rect.top : rect.height / 2,
      });
      void handleCopy();
    },
    [handleCopy],
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        aria-label={`Copier l'identifiant du lobby ${lobbyId}`}
        className="relative inline-flex items-center gap-1.5 rounded-sm bg-stone-800 px-2 py-1 font-mono text-gold-300 transition-colors duration-150 hover:bg-stone-700 focus-visible:bg-stone-700"
      >
        <span className="[overflow-wrap:anywhere]">{lobbyId}</span>
        {copied ? <CheckIcon className="size-4 shrink-0" /> : <CopyIcon className="size-4 shrink-0" />}
        {burstCount > 0 && particles.length > 0 && (
          <ParticleBurst key={burstCount} particles={particles} origin={burstOrigin} />
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {copied && bubblePosition && (
            <motion.span
              role="status"
              initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.9 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
              style={{ position: "fixed", top: bubblePosition.top, left: bubblePosition.left }}
              className="z-[100] -translate-x-1/2 translate-y-[calc(-100%-10px)] whitespace-nowrap rounded-md border border-gold-500/40 bg-stone-950 px-2.5 py-1 text-xs font-medium text-gold-300 shadow-warm"
            >
              Identifiant copié !
            </motion.span>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
