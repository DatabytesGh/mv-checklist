import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Admin",
    frontdesk: "Front Desk",
    housekeeping: "Housekeeping",
    kitchen: "Kitchen",
    cyberbar: "Cyber Bar",
    it_staff: "IT Staff",
    manager: "Manager",
  };
  return labels[role] ?? role;
}

export function statusColor(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
    case "submitted":
      return "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40";
    case "na":
      return "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/50";
    case "rejected":
      return "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40";
    case "in_progress":
      return "bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/40";
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-600/40";
  }
}
