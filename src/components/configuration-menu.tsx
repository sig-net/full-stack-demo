"use client";

import { Info, Settings, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PublicIdentifier } from "@/components/ui/public-identifier";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRuntimeConfigSections } from "@/hooks/use-runtime-config-sections";

/**
 * Owns draft configuration editing and applies validated values from the popover form.
 *
 * @returns The configuration popover.
 */
export function ConfigurationMenu(): React.JSX.Element {
  const model = useRuntimeConfigSections();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Configuration" title="Configuration">
          <Settings className="size-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Configuration" size="wide">
        <div className="ds-row ds-after-control justify-between">
          <h2 className="ds-label">Configuration</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close configuration"
            onClick={() => {
              setOpen(false);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
        <TooltipProvider delayDuration={200}>
          <form
            className="ds-stack-content"
            onSubmit={(event) => {
              event.preventDefault();
              setResult(
                model.apply() ? "Configuration applied." : "Correct the highlighted fields.",
              );
            }}
          >
            {model.sections.map((section) => (
              <section key={section.title} aria-label={`${section.title} configuration`}>
                <h3 className="ds-body ds-label ds-after-control">
                  {section.title === "Vault" ? "ERC20 vault" : section.title}
                </h3>
                <div className="ds-stack-control">
                  {section.fields.map((field) => {
                    const fieldId = `${id}-${field.key}`;
                    return (
                      <div key={field.key}>
                        <Label htmlFor={fieldId}>{field.label}</Label>
                        <div className="ds-row ds-tight">
                          {field.options ? (
                            <NativeSelect
                              id={fieldId}
                              className="min-w-0 flex-1"
                              value={field.value}
                              onChange={(event) => {
                                model.edit(field.key, event.target.value);
                                setResult("");
                              }}
                              aria-invalid={!!field.error}
                              aria-describedby={`${fieldId}-feedback`}
                            >
                              {field.options.map((option) => (
                                <NativeSelectOption key={option.value} value={option.value}>
                                  {option.label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          ) : (
                            <Input
                              id={fieldId}
                              className="min-w-0 flex-1"
                              value={field.value}
                              onChange={(event) => {
                                model.edit(field.key, event.target.value);
                                setResult("");
                              }}
                              aria-invalid={!!field.error}
                              aria-describedby={`${fieldId}-feedback`}
                            />
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`About ${field.label}`}
                              >
                                <Info className="size-3.5" />
                              </Button>
                            </TooltipTrigger>

                            <TooltipContent side="left">{field.help}</TooltipContent>
                          </Tooltip>
                        </div>
                        {(field.key === "contractAddress" ||
                          field.key === "mpcPubkey" ||
                          field.key === "signetContractAddress") && (
                          <div className="ds-before-control">
                            <p className="ds-caption">Applied {field.label}</p>
                            <PublicIdentifier
                              value={field.appliedValue}
                              label={`Applied ${field.label}`}
                              explorer={field.appliedExplorer}
                            />
                          </div>
                        )}
                        <div id={`${fieldId}-feedback`} className="ds-caption break-words">
                          {field.difference && (
                            <p className="ds-warning">
                              {field.difference.message} Wallet value:{" "}
                              {field.difference.walletValue}
                            </p>
                          )}
                          {field.error && (
                            <Feedback tone="error" role="alert">
                              {field.error}
                            </Feedback>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {model.pending && (
              <p role="status">
                Unapplied draft changes. Connected network: {model.applied.midnight.networkId}.
              </p>
            )}
            {model.failure && (
              <Feedback tone="error" role="alert">
                {model.failure}
              </Feedback>
            )}
            {model.walletError && (
              <Feedback tone="error" role="alert">
                {model.walletError}
              </Feedback>
            )}
            {result && (
              <p role="status" className="ds-body">
                {result}
              </p>
            )}
            <div className="ds-control-gap ds-divider-top ds-top-inset-content flex flex-wrap">
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  model.discard();
                  setResult("Draft discarded.");
                }}
              >
                Discard
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  model.reset();
                  setResult("Network defaults prepared. Apply to commit them.");
                }}
              >
                Reset to network defaults
              </Button>
            </div>
          </form>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  );
}
