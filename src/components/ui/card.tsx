import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "cn";

// Card component styled according to the design system. Supports `asChild` for rendering as a different element.
function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="card"
      className={cn(
        "rounded-lg border border-stone-700 border-t-2 border-t-gold-500 bg-gradient-to-b from-stone-800 to-stone-900 p-6 shadow-warm",
        className,
      )}
      {...props}
    />
  );
}

export { Card };
