'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { flow, PHASE_MESSAGE, type FlowState } from '@/lib/midnight/flow';

// Midnight deposit/withdraw progress as a single updating toast (mirrors the base app's
// transaction-status-tracker), so flows are dismissible and progress shows like EVM/Solana.
const TOAST_ID = 'midnight-flow-progress';

export function MidnightProgressToaster() {
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const onState = (s: FlowState) => {
      const kind =
        s.kind === 'withdraw'
          ? 'Withdrawal'
          : s.kind === 'swap'
            ? 'Swap'
            : s.kind === 'supply'
              ? 'Supply'
              : s.kind === 'redeem'
                ? 'Redeem'
                : 'Deposit';

      if (s.error) {
        prevPhase.current = null;
        // duration: Infinity — sonner's default error lifetime is 4 s, which after a flow that
        // waited minutes on the MPC is easy to miss entirely. A failure stays until dismissed.
        toast.error(`${kind} failed`, {
          id: TOAST_ID,
          description: s.error,
          duration: Infinity,
        });
        return;
      }
      if (!s.phase) {
        prevPhase.current = null;
        // Cleared state (flow.reset()) must clear the UI too: the toast is keyed by TOAST_ID and
        // otherwise survives on screen, so the previous run's terminal toast would linger into
        // the next one and read as a fresh failure.
        toast.dismiss(TOAST_ID);
        return;
      }
      if (s.phase === 'done') {
        prevPhase.current = null;
        if (s.refunded) {
          toast.warning(`${kind} didn't execute on-chain — tokens refunded`, {
            id: TOAST_ID,
          });
          return;
        }
        toast.success(
          s.kind === 'withdraw'
            ? 'Withdrawal complete'
            : s.kind === 'swap'
              ? 'Swap complete — shielded token minted'
              : 'Deposit complete — shielded token minted',
          { id: TOAST_ID },
        );
        return;
      }
      if (s.phase !== prevPhase.current) {
        prevPhase.current = s.phase;
        toast.loading(`${kind}: ${PHASE_MESSAGE[s.phase] ?? 'Working…'}`, {
          id: TOAST_ID,
        });
      }
    };
    return flow.subscribe(onState);
  }, []);

  return null;
}
