import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Resolves conditional classes and lets later Tailwind utilities replace conflicting earlier ones.
 *
 * @param inputs - Class values accepted by clsx.
 * @returns The merged class string used by shared components.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
