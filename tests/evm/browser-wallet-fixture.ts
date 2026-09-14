import { EventEmitter } from "node:events";

import {
  type Address,
  createClient,
  createPublicClient,
  custom,
  type EIP1193Provider,
  type EIP1474Methods,
  type Hash,
  type Hex,
  http,
  type PublicClient,
  rpcSchema,
} from "viem";
import { sepolia } from "viem/chains";
import { vi } from "vitest";

import { BrowserWallet } from "@/lib/evm/wallet/BrowserWallet";
/** Account returned by both authorisation and verification RPC reads. */
export const account: Address = "0x1111111111111111111111111111111111111111";
/** Submission hash used by the extension transport and mined-receipt fixture. */
export const hash: Hash = `0x${"33".repeat(32)}`;

interface Controls {
  chain: string;
  markerCode: Hex;
  accounts: Address[];
  initialEvent: boolean;
  refuseSwitch: boolean;
  requestGate?: Promise<Address[]>;
  sendGate?: Promise<Hex>;
}
/** Keeps extension transport controls separate from the app public RPC client. */
export interface WalletFixture {
  wallet: BrowserWallet;
  publicClient: PublicClient;
  provider: EIP1193Provider;
  controls: Controls;
  calls: string[];
  events: EventEmitter;
  invalidated: ReturnType<typeof vi.fn>;
}
/**
 * @returns A real browser wallet whose extension replies and public RPC can be controlled independently.
 */
export const browserWalletFixture = (): WalletFixture => {
  const events = new EventEmitter();
  const controls: Controls = {
    chain: "0xaa36a7",
    markerCode: "0x",
    accounts: [account],
    initialEvent: false,
    refuseSwitch: false,
  };
  const calls: string[] = [];
  const client = createClient({
    rpcSchema: rpcSchema<EIP1474Methods>(),
    transport: custom(
      {
        request: async ({ method }: { method: string }): Promise<Address[] | string | null> => {
          calls.push(method);
          switch (method) {
            case "eth_requestAccounts":
              if (controls.initialEvent) events.emit("accountsChanged", controls.accounts);
              return await (controls.requestGate ?? Promise.resolve(controls.accounts));
            case "eth_getCode":
              return controls.markerCode;
            case "eth_accounts":
              return controls.accounts;
            case "eth_chainId":
              return controls.chain;
            case "wallet_switchEthereumChain":
              if (controls.refuseSwitch) throw new Error("User rejected Sepolia switch.");
              controls.chain = "0xaa36a7";
              events.emit("chainChanged", controls.chain);
              return null;
            case "eth_sendTransaction":
              return await (controls.sendGate ?? Promise.resolve(hash));
            default:
              throw new Error(`Unexpected RPC method ${method}`);
          }
        },
      },
      { retryCount: 0 },
    ),
  });
  const provider: EIP1193Provider = {
    request: client.request,
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
  };
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http("https://fixture.invalid"),
  });
  vi.spyOn(publicClient, "getChainId").mockResolvedValue(sepolia.id);
  const invalidated = vi.fn();
  const wallet = new BrowserWallet(
    sepolia,
    publicClient,
    { id: "fixture", name: "Fixture", provider },
    invalidated,
  );
  return { wallet, publicClient, provider, controls, calls, events, invalidated };
};
