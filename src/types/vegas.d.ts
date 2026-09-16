//Use lib vegas (background slideshow)
declare module "vegas" {
  export interface VegasSlide {
    src?: string;
    color?: string;
    delay?: number;
    align?: "left" | "center" | "right";
    valign?: "top" | "center" | "bottom";
    transition?: string;
    transitionDuration?: number;
    animation?: string;
    animationDuration?: number | "auto";
    cover?: boolean;
  }

  export interface VegasOptions {
    slide?: number;
    delay?: number;
    loop?: boolean;
    preload?: boolean;
    preloadImage?: boolean;
    preloadVideo?: boolean;
    timer?: boolean;
    overlay?: boolean | string;
    autoplay?: boolean;
    shuffle?: boolean;
    cover?: boolean;
    color?: string | null;
    align?: "left" | "center" | "right";
    valign?: "top" | "center" | "bottom";
    transition?: string | null;
    transitionDuration?: number;
    animation?: string | null;
    animationDuration?: number | "auto";
    slidesToKeep?: number;
    slides?: VegasSlide[];
    init?: () => void;
    play?: () => void;
    pause?: () => void;
    walk?: () => void;
  }

  export interface VegasInstance {
    play(): void;
    pause(): void;
    toggle(): void;
    playing(): boolean;
    current(advanced?: boolean): number | VegasSlide;
    jump(index: number): void;
    next(): void;
    previous(): void;
    shuffle(): void;
    options(): VegasOptions;
    options(key: string): unknown;
    options(key: string, value: unknown): VegasOptions;
    destroy(): void;
  }

  export default function vegas(target: string | HTMLElement, options?: VegasOptions): VegasInstance;
}
