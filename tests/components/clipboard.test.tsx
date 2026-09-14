import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PublicIdentifier } from "@/components/ui/public-identifier";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("copies with the modern API, clears feedback and ignores reset or unmounted completions", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("isSecureContext", true);
  const first = Promise.withResolvers<undefined>();
  const second = Promise.withResolvers<undefined>();
  const writeText = vi
    .fn<(text: string) => Promise<void>>()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(undefined)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const hook = renderHook(() => useCopyToClipboard(2000));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = hook.result.current.copyToClipboard("first secret");
  });
  act(() => {
    hook.result.current.reset();
  });
  await act(async () => {
    first.resolve(undefined);
    await pending;
  });
  expect(hook.result.current.isCopied).toBe(false);
  await act(async () => {
    await hook.result.current.copyToClipboard("second secret");
  });
  expect(writeText).toHaveBeenNthCalledWith(2, "second secret");
  expect(hook.result.current.isCopied).toBe(true);
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(hook.result.current.isCopied).toBe(false);
  act(() => {
    pending = hook.result.current.copyToClipboard("third secret");
  });
  hook.unmount();
  await act(async () => {
    second.resolve(undefined);
    await pending;
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(document.querySelector("textarea")).toBeNull();
});

it.each(["insecure", "unavailable", "denied"] as const)(
  "shows actionable %s clipboard feedback through the real copy control",
  async (mode) => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error("Clipboard permission denied"));
    vi.stubGlobal("isSecureContext", mode !== "insecure");
    vi.stubGlobal("navigator", { clipboard: mode === "unavailable" ? undefined : { writeText } });
    render(<PublicIdentifier value="0x123456" label="address" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    const feedback = await screen.findByRole("alert");
    expect(feedback.textContent).toBe(
      mode === "denied"
        ? "Clipboard permission denied"
        : "Clipboard access is unavailable. Open this app on HTTPS or localhost, then try again.",
    );
    expect(writeText).toHaveBeenCalledTimes(mode === "denied" ? 1 : 0);
    expect(document.querySelector("textarea")).toBeNull();
  },
);

it.each([
  "0xFBdC76c2aaB313484d1b8E63B75D38efD0537680",
  `mn_shield-addr_undeployed1${"abc012".repeat(25)}`,
  `0x${"AB12".repeat(16)}`,
  "ab12".repeat(16),
  "0x1234",
])("copies the complete public value and reveals selectable text: %s", async (value) => {
  vi.stubGlobal("isSecureContext", true);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(<PublicIdentifier value={value} label="identifier" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy identifier" }));
  expect((await screen.findByRole("status")).textContent).toBe("Copied identifier");
  expect(writeText).toHaveBeenCalledWith(value);
  fireEvent.click(screen.getByRole("button", { name: "Show full identifier" }));
  expect(screen.getByRole("dialog", { name: "Full identifier" }).textContent).toContain(value);
});

it("does not render copy controls for an absent value", () => {
  render(<PublicIdentifier value="" label="identifier" />);
  expect(screen.getByText("Not available")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("clears copied feedback and rejects late clipboard completion when the value changes", async () => {
  vi.stubGlobal("isSecureContext", true);
  const pending = Promise.withResolvers<undefined>();
  const writeText = vi
    .fn<(text: string) => Promise<void>>()
    .mockResolvedValueOnce(undefined)
    .mockReturnValueOnce(pending.promise);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const view = render(<PublicIdentifier value="first" label="identifier" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy identifier" }));
  await screen.findByRole("status");
  view.rerender(<PublicIdentifier value="second" label="identifier" />);
  expect(screen.queryByRole("status")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy identifier" }));
  view.rerender(<PublicIdentifier value="third" label="identifier" />);
  await act(async () => {
    pending.resolve(undefined);
    await pending.promise;
  });
  expect(screen.queryByRole("status")).toBeNull();
});

it("isolates identifier copy and reveal from Activity row activation and form submission", async () => {
  vi.stubGlobal("isSecureContext", true);
  const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const rowClick = vi.fn();
  const submit = vi.fn();
  render(
    <form onSubmit={submit}>
      <Table>
        <TableBody>
          <TableRow onClick={rowClick}>
            <TableCell>
              <PublicIdentifier value="0xabcdef1234567890" label="address" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </form>,
  );
  const copy = screen.getByRole("button", { name: "Copy address" });
  copy.focus();
  expect(document.activeElement).toBe(copy);
  fireEvent.keyDown(copy, { key: "Enter" });
  fireEvent.click(copy);
  await screen.findByRole("status");
  fireEvent.click(screen.getByRole("button", { name: "Show full address" }));
  expect(screen.getByRole("dialog", { name: "Full address" })).toBeTruthy();
  expect(rowClick).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});
