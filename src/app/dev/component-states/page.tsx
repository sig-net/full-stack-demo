"use client";

import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenAmountDisplay } from "@/components/ui/token-amount-display";
import { Tooltip } from "@/components/ui/tooltip";

/** Keeps development fixture rendering available through a dynamic route. */
export const dynamic = "force-dynamic";

/**
 * Renders interactive states for the shared component library during development.
 *
 * @returns The component state gallery, or no content outside development.
 */
export default function ComponentStates(): React.JSX.Element | null {
  const [count, setCount] = useState(0);
  const [checked, setChecked] = useState(true);
  const [amount, setAmount] = useState("");
  if (process.env.NODE_ENV !== "development") return null;
  const token = {
    erc20Address: "0x0000000000000000000000000000000000000001",
    symbol: "TEST",
    name: "Fixture token",
    decimals: 18,
    chain: "ethereum" as const,
    balance: "123.456789012345678901",
  };
  return (
    <main className="ds-stack-section ds-inset-section">
      <h1>Component states (development fixtures)</h1>
      <p>
        Activations: <output data-testid="activations">{count}</output>
      </p>
      <div className="ds-actions">
        {(["default", "outline", "ghost", "destructive", "secondary"] as const).map((variant) => (
          <Button
            key={variant}
            variant={variant}
            data-testid={`button-${variant}`}
            onClick={() => {
              setCount(count + 1);
            }}
          >
            {variant}
          </Button>
        ))}
        <Button
          disabled
          data-testid="button-disabled"
          onClick={() => {
            setCount(count + 1);
          }}
        >
          Disabled
        </Button>
        <Button disabled aria-busy="true">
          Loading
        </Button>
      </div>
      <Label htmlFor="state-input">Editable field</Label>
      <Input id="state-input" placeholder="Type here" />
      <Label htmlFor="state-invalid">Invalid field</Label>
      <Input id="state-invalid" aria-invalid="true" defaultValue="invalid" />
      <Input aria-label="Disabled field" disabled defaultValue="disabled" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button data-testid="menu-trigger">State menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            data-testid="menu-enabled"
            onSelect={(event) => {
              event.preventDefault();
              setCount(count + 1);
            }}
          >
            Enabled menu item
          </DropdownMenuItem>
          <DropdownMenuItem
            asChild
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            <Button
              variant="menu"
              data-testid="menu-composed"
              onClick={() => {
                setCount(count + 1);
              }}
            >
              Composed menu button
            </Button>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Disabled menu item</DropdownMenuItem>
          <DropdownMenuCheckboxItem
            checked={checked}
            onCheckedChange={setChecked}
            onSelect={(event) => {
              event.preventDefault();
            }}
          >
            Selected item
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip title="Portal tooltip fixture">
        <Button variant="ghost">Tooltip target</Button>
      </Tooltip>
      <div className="ds-stack-content">
        <Feedback tone="error" role="alert">
          Error fixture
        </Feedback>
        <Feedback tone="warning">Warning fixture</Feedback>
        <Feedback tone="success">Success fixture</Feedback>
        <Badge variant="pending">Pending fixture</Badge>
      </div>
      <Card>
        <CardContent>
          <h2>Independent surface A</h2>
          <p className="ds-caption ds-muted" data-testid="shared-caption-a">
            Shared typography A
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2>Independent surface B</h2>
          <p className="ds-caption ds-muted" data-testid="shared-caption-b">
            Shared typography B
          </p>
        </CardContent>
      </Card>
      <TokenAmountDisplay
        value={amount}
        onChange={setAmount}
        tokens={[token]}
        selectedToken={token}
        onTokenSelect={() => undefined}
      />
      <TokenAmountDisplay
        value="1"
        onChange={() => {
          setCount(count + 1);
        }}
        tokens={[token]}
        selectedToken={token}
        onTokenSelect={() => {
          setCount(count + 1);
        }}
        readOnly
      />
      <TokenAmountDisplay
        value="1"
        onChange={() => {
          setCount(count + 1);
        }}
        tokens={[token]}
        selectedToken={token}
        onTokenSelect={() => {
          setCount(count + 1);
        }}
        disabled
      />
      <Button
        onClick={() => {
          toast.error("Themed error fixture");
        }}
      >
        Show toast
      </Button>
    </main>
  );
}
