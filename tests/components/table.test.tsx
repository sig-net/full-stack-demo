import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

afterEach(cleanup);

describe("shared table keyboard activation", () => {
  it("activates a focused clickable row with Enter and Space", () => {
    const activate = vi.fn();
    render(
      <Table>
        <TableBody>
          <TableRow onClick={activate}>
            <TableCell>Activity</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    const row = screen.getByRole("row");
    expect(row.tabIndex).toBe(0);
    expect(fireEvent.keyDown(row, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(row, { key: " " })).toBe(false);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it("leaves nested control keyboard events to the control", () => {
    const activate = vi.fn();
    render(
      <Table>
        <TableBody>
          <TableRow onClick={activate}>
            <TableCell>
              <a href="#receipt">Receipt</a>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(fireEvent.keyDown(screen.getByRole("link", { name: "Receipt" }), { key: "Enter" })).toBe(
      true,
    );
    expect(activate).not.toHaveBeenCalled();
  });

  it("keeps passive rows outside the tab order", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Activity</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByRole("row").hasAttribute("tabindex")).toBe(false);
  });
});
