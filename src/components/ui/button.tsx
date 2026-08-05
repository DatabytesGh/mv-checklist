import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
}

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  icon,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      "border-accent-500/60 bg-accent-500 text-white hover:bg-accent-400",
    soft: "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800",
    ghost:
      "border-transparent bg-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
    danger: "border-red-500/50 bg-red-600/80 text-white hover:bg-red-500",
  };
  const sizes = {
    sm: "px-3 py-2 text-xs min-h-[36px]",
    md: "px-4 py-2.5 text-sm min-h-[44px]",
    lg: "px-5 py-3 text-base min-h-[48px]",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-target",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
