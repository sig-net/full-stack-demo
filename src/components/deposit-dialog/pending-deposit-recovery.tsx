"use client";

import type * as React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMidnightProgress } from "@/hooks/use-midnight-progress";
import type { TokenConfig } from "@/lib/constants/token-metadata";
import { useMidnightReadiness } from "@/providers/midnight-readiness-context";
import { useVault } from "@/providers/vault-context";
import { useVaultOperations } from "@/providers/vault-operations-context";

/**
 * Recovers a pending deposit for the selected token after the transfer stage.
 *
 * @param root0 - Recovery properties.
 * @param root0.token - Token whose pending request is recovered.
 * @returns The pending recovery controls.
 */
export function PendingDepositRecovery({ token }: { token: TokenConfig }): React.JSX.Element {
  const [recoveryRequestId, setRecoveryRequestId] = useState("");
  const operations = useVaultOperations();
  const readiness = useMidnightReadiness();
  const vault = useVault();
  const progress = useMidnightProgress();
  return (
    <div className="ds-stack-control ds-divider-top ds-top-inset-content">
      <Label htmlFor={`recover-deposit-${token.symbol}`}>Pending deposit request ID</Label>
      <Input
        id={`recover-deposit-${token.symbol}`}
        value={recoveryRequestId}
        onChange={(event) => {
          setRecoveryRequestId(event.target.value);
        }}
        disabled={progress.active}
      />
      <Button
        disabled={
          !readiness.ready || !vault.binding || progress.active || !recoveryRequestId.trim()
        }
        onClick={() =>
          void operations
            .recoverDeposit(token.erc20Address, recoveryRequestId.trim())
            .catch(() => undefined)
        }
      >
        Recover pending deposit
      </Button>
      <p className="ds-body">
        Use the request ID from Activity to finish a deposit after its EVM sweep. The pending
        request supplies the amount.
      </p>
    </div>
  );
}
