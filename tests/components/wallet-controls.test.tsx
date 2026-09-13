import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeedWalletDialog } from "@/components/seed-wallet-dialog";
import { WalletMark } from "@/components/wallet-mark";
import { WalletMenu } from "@/components/wallet-menu";

afterEach(cleanup);

function SeedHarness({
  chainName,
  onInstall,
  onClose,
}: {
  chainName: string;
  onInstall: (seed: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={returnFocus}
        onClick={() => {
          setOpen(true);
        }}
      >
        Open seed dialog
      </button>
      <SeedWalletDialog
        chainName={chainName}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) onClose();
        }}
        onInstall={onInstall}
        returnFocus={returnFocus}
      />
    </>
  );
}

describe("wallet controls", () => {
  it.each(["Midnight", "EVM"])(
    "clears the seed field and restores focus across close paths for %s",
    async (chainName) => {
      for (const path of ["dialog", "cancel", "submit"]) {
        const installed: string[] = [];
        let closed = 0;
        render(
          <SeedHarness
            chainName={chainName}
            onInstall={(seed) => {
              installed.push(seed);
            }}
            onClose={() => {
              closed += 1;
            }}
          />,
        );
        const trigger = screen.getByRole("button", { name: "Open seed dialog" });
        fireEvent.click(screen.getByRole("button", { name: "Open seed dialog" }));
        const input = screen.getByLabelText(`${chainName} seed`);
        fireEvent.change(input, { target: { value: "  001122  " } });
        expect(input.getAttribute("value")).toBe("  001122  ");
        const focus = vi.spyOn(HTMLElement.prototype, "focus");
        focus.mockClear();
        if (path === "dialog") fireEvent.click(screen.getByRole("button", { name: /close/i }));
        if (path === "cancel") fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        if (path === "submit")
          fireEvent.click(screen.getByRole("button", { name: `Install ${chainName} seed wallet` }));
        await waitFor(() => {
          expect(screen.queryByRole("dialog")).toBeNull();
          expect(closed).toBe(1);
          expect(focus.mock.instances).toContain(trigger);
        });
        fireEvent.click(screen.getByRole("button", { name: "Open seed dialog" }));
        expect(screen.getByLabelText(`${chainName} seed`).getAttribute("value")).toBe("");
        expect(installed).toEqual(path === "submit" ? ["001122"] : []);
        focus.mockRestore();
        cleanup();
      }
    },
  );

  it("falls back after a broken wallet image and renders a replacement source", () => {
    const view = render(<WalletMark iconUrl="https://fixture.invalid/broken.png" />);
    const image = screen.getByRole("presentation", { hidden: true });
    fireEvent.error(image);
    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
    view.rerender(<WalletMark iconUrl="https://fixture.invalid/replacement.png" />);
    expect(screen.getByRole("presentation", { hidden: true })).toBeTruthy();
  });

  it("delegates wallet menu actions and keeps status independent of balance errors", async () => {
    const connect = vi.fn();
    const disconnect = vi.fn();
    const onOpenChange = vi.fn();
    const choiceName = "<script>fixture</script>";
    const view = render(
      <WalletMenu
        chainName="EVM"
        wallet={null}
        connecting={false}
        error={null}
        choices={[{ id: "fixture", name: choiceName, connect }]}
        onOpenChange={onOpenChange}
        refresh={vi.fn()}
        installSeed={vi.fn()}
        disconnect={disconnect}
      />,
    );
    const trigger = screen.getByRole("button", { name: "EVM wallet: not connected" });
    fireEvent.pointerDown(trigger, { button: 0 });
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /connect/i })).toBeTruthy();
    });
    const choice = screen.getByRole("menuitem", { name: /connect/i });
    expect(choice.textContent).toContain(choiceName);
    expect(choice.querySelector("script")).toBeNull();
    fireEvent.click(choice);
    expect(connect).toHaveBeenCalledTimes(1);

    expect(trigger.getAttribute("aria-label")).toBe("EVM wallet: not connected");
    expect(onOpenChange).toHaveBeenCalledWith(true);
    fireEvent.pointerDown(trigger, { button: 0 });

    view.rerender(
      <WalletMenu
        chainName="EVM"
        wallet={{ kind: "seed", name: "Fixture seed", accountDetail: "0x1234", id: "fixture-seed" }}
        connecting={false}
        error="Balances unavailable"
        choices={[]}
        onOpenChange={onOpenChange}
        refresh={vi.fn()}
        installSeed={vi.fn()}
        disconnect={disconnect}
      />,
    );
    const connectedTrigger = screen.getByRole("button", { name: "EVM wallet: connected" });
    fireEvent.pointerDown(connectedTrigger, { button: 0 });
    expect(screen.getByText("Fixture seed")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Disconnect EVM wallet" }));
    expect(disconnect).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(connectedTrigger, { button: 0 });

    view.rerender(
      <WalletMenu
        chainName="EVM"
        wallet={null}
        connecting
        progress="Waiting"
        choices={[]}
        onOpenChange={onOpenChange}
        refresh={vi.fn()}
        installSeed={vi.fn()}
        disconnect={disconnect}
      />,
    );
    expect(screen.getByRole("button", { name: "EVM wallet: connecting" })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "EVM wallet: connecting" }), {
      button: 0,
    });
    expect(screen.getByRole("status").textContent).toContain("Waiting");
    expect(screen.getByText(/No EVM wallet extension found/)).toBeTruthy();
  });
});
