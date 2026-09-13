"use client";

import { type RuntimeFieldDefinition, runtimeFields } from "@/lib/config/runtime";
import { useMidnightConnection } from "@/providers/midnight-wallet-context";
import { useRuntimeConfig } from "@/providers/runtime-config-context";

interface ConfigurationField extends RuntimeFieldDefinition {
  value: string;
  appliedValue: string;
  error: string | undefined;
  difference: { kind: "network" | "endpoint"; walletValue: string; message: string } | undefined;
  options: { value: string; label: string }[] | undefined;
}

interface ConfigurationSections extends ReturnType<typeof useRuntimeConfig> {
  walletError: ReturnType<typeof useMidnightConnection>["error"];
  sections: { title: RuntimeFieldDefinition["section"]; fields: ConfigurationField[] }[];
}

/**
 * Pairs editable sections with endpoint differences reported by the connected browser wallet.
 *
 * @returns Draft values, validation feedback and reported wallet differences grouped for the editor.
 */
export function useRuntimeConfigSections(): ConfigurationSections {
  const runtime = useRuntimeConfig();
  const { wallet, error } = useMidnightConnection();
  const reported = wallet?.kind === "browser" ? wallet.configuration : undefined;
  const fields = runtimeFields.map((field) => {
    const walletValue =
      field.key === "proofServerUrl"
        ? wallet?.reportedProofServerUrl
        : reported &&
            (field.key === "networkId" ||
              field.key === "indexerUrl" ||
              field.key === "indexerWsUrl" ||
              field.key === "nodeUrl")
          ? reported[field.key]
          : undefined;
    const difference =
      walletValue && walletValue !== runtime.applied.fields[field.key]
        ? {
            kind: field.key === "networkId" ? ("network" as const) : ("endpoint" as const),
            walletValue,
            message:
              field.key === "networkId"
                ? "The wallet network differs. Reconnect on the configured network."
                : "The wallet uses a different endpoint. Both endpoints may serve the same network. App vault reads and proofs use the applied configuration.",
          }
        : undefined;
    return {
      ...field,
      value: runtime.draft[field.key],
      appliedValue: runtime.applied.fields[field.key],
      error: runtime.errors[field.key],
      difference,
      options:
        field.key === "networkId"
          ? [
              {
                value: runtime.owner.defaults.fields.networkId,
                label: runtime.owner.defaults.fields.networkId,
              },
            ]
          : field.key === "chainId"
            ? [{ value: "11155111", label: "Sepolia (11155111)" }]
            : undefined,
    };
  });
  return {
    ...runtime,
    walletError: error,
    sections: (["Vault", "Midnight", "EVM"] as const).map((title) => ({
      title,
      fields: fields.filter((field) => field.section === title),
    })),
  };
}
