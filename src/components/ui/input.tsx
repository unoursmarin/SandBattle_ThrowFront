import * as React from "react";
import { cn } from "cn";

// Input component styled according to the design system.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full rounded-md border border-stone-700 bg-stone-950 px-4 py-3 text-base text-sand-100 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-sand-200 focus-visible:border-gold-500 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
