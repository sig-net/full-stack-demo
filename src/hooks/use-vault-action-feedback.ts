"use client";

import { useLayoutEffect, useRef } from "react";

interface VaultActionFeedback {
  begin: () => number | null;
  isCurrent: (ticket: number) => boolean;
  finish: (ticket: number) => boolean;
}

/**
 * Limits widget feedback to its committed inputs while the shared owner retains submission control.
 *
 * @param scope - Public binding and runtime identity.
 * @param revision - User input revision, including changes back to an earlier value.
 * @returns Admission and completion guards for one local pending action.
 */
export function useVaultActionFeedback(scope: string, revision: number): VaultActionFeedback {
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const mounted = useRef(false);
  const committed = useRef<{ scope: string; revision: number } | null>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    committed.current = { scope, revision };
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [scope, revision]);
  return {
    begin: () => {
      if (
        !mounted.current ||
        pending.current !== null ||
        committed.current?.scope !== scope ||
        committed.current.revision !== revision
      )
        return null;
      generation.current += 1;
      pending.current = generation.current;
      return generation.current;
    },
    isCurrent: (ticket) => mounted.current && generation.current === ticket,
    finish: (ticket) => {
      if (pending.current !== ticket) return false;
      pending.current = null;
      return mounted.current;
    },
  };
}
