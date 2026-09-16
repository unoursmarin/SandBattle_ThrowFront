import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "cn";

// Label component styled according to the design system.
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("mt-4 mb-1 block text-sm text-sand-200", className)}
      {...props}
    />
  );
}

export { Label };
