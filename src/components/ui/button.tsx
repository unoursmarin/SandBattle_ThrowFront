import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";


const buttonVariants = cva(
  "inline-flex w-full items-center justify-center gap-2 rounded-md border border-transparent px-6 py-3 text-base font-semibold transition-[transform,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] disabled:cursor-not-allowed disabled:opacity-60 active:not-disabled:translate-y-px active:not-disabled:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-terracotta-700 text-sand-50 shadow-[inset_0_1px_0_rgb(217_122_82_/_0.35)] hover:not-disabled:-translate-y-px hover:not-disabled:shadow-[inset_0_1px_0_rgb(217_122_82_/_0.45),0_6px_16px_-4px_rgb(143_63_34_/_0.6)] active:not-disabled:shadow-[inset_0_1px_4px_rgb(28_20_16_/_0.4)]",
        secondary: "border-gold-500 bg-transparent text-gold-300 hover:not-disabled:bg-gold-500/10",
        active: "border-gold-500 bg-gold-500 text-stone-950",
        ghost:
          "w-auto bg-transparent px-3 py-2 font-medium text-sand-200 hover:not-disabled:text-error-600",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

function Button({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}

export { Button, buttonVariants };
