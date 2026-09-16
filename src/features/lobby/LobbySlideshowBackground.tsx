import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import vegas from "vegas";
import "vegas/dist/vegas.css";


const slideModules = import.meta.glob("../../assets/slider/*.jpg", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const slides = Object.values(slideModules).map((src) => ({ src }));


export function LobbySlideshowBackground() {
  const targetRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const target = targetRef.current;
    if (!target || slides.length === 0) {
      return;
    }

    const instance = vegas(target, {
      slides,
      shuffle: true,
      cover: true,
      delay: 7000,
      transition: "fade2",
      transitionDuration: 2200,
      animation: reduceMotion ? undefined : "kenburns",
      animationDuration: "auto",
      timer: false,
      overlay: false,
    });

    return () => instance.destroy();
  }, [reduceMotion]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div ref={targetRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-stone-950/80 via-stone-950/55 to-stone-950/90" />
    </div>
  );
}
