import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { TruncatedText } from "@/components/ui/truncated-text";
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
    render(<TruncatedText text="0x123456" copyable />);
    fireEvent.click(screen.getByRole("button", { name: "Copy 0x123456" }));
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
