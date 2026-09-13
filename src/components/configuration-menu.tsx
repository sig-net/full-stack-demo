'use client';

import { useId, useState } from 'react';
import { Info, Settings, X } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useRuntimeConfigSections } from '@/hooks/use-runtime-config-sections';

export function ConfigurationMenu() {
  const model = useRuntimeConfigSections();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='size-8 rounded-lg text-stone-500'
          aria-label='Configuration'
          title='Configuration'
        >
          <Settings className='size-4' aria-hidden='true' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        aria-label='Configuration'
        className='max-h-[min(85vh,var(--radix-popover-content-available-height))] w-96 overflow-y-auto rounded-xl p-3'
      >
        <div className='mb-2 flex items-center justify-between'>
          <h2 className='font-semibold'>Configuration</h2>
          <Button
            variant='ghost'
            size='icon'
            className='size-7'
            aria-label='Close configuration'
            onClick={() => setOpen(false)}
          >
            <X className='size-4' />
          </Button>
        </div>
        <Tooltip.Provider delayDuration={200}>
          <form
            className='space-y-4'
            onSubmit={event => {
              event.preventDefault();
              setResult(
                model.apply()
                  ? 'Configuration applied.'
                  : 'Correct the highlighted fields.',
              );
            }}
          >
            {model.sections.map(section => (
              <section
                key={section.title}
                aria-label={`${section.title} configuration`}
              >
                <h3 className='mb-2 text-sm font-semibold'>
                  {section.title === 'Vault' ? 'ERC20 vault' : section.title}
                </h3>
                <div className='space-y-2.5'>
                  {section.fields.map(field => {
                    const fieldId = `${id}-${field.key}`;
                    return (
                      <div key={field.key}>
                        <label
                          className='text-xs text-stone-500'
                          htmlFor={fieldId}
                        >
                          {field.label}
                        </label>
                        <div className='flex items-center gap-1'>
                          {field.options ? (
                            <select
                              id={fieldId}
                              className='h-9 min-w-0 flex-1 rounded-md border bg-white px-3 text-sm'
                              value={field.value}
                              onChange={event => {
                                model.edit(field.key, event.target.value);
                                setResult('');
                              }}
                              aria-invalid={!!field.error}
                              aria-describedby={`${fieldId}-feedback`}
                            >
                              {field.options.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              id={fieldId}
                              className='h-9 min-w-0 flex-1 text-sm'
                              value={field.value}
                              onChange={event => {
                                model.edit(field.key, event.target.value);
                                setResult('');
                              }}
                              aria-invalid={!!field.error}
                              aria-describedby={`${fieldId}-feedback`}
                            />
                          )}
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='size-7 shrink-0 text-stone-500'
                                aria-label={`About ${field.label}`}
                              >
                                <Info className='size-3.5' />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side='left'
                                className='z-[60] max-w-64 rounded-md border bg-white p-2 text-xs shadow-md'
                              >
                                {field.help}
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </div>
                        <div
                          id={`${fieldId}-feedback`}
                          className='text-xs break-words'
                        >
                          {field.error && (
                            <p role='alert' className='text-destructive'>
                              {field.error}
                            </p>
                          )}
                          {field.difference && (
                            <p className='text-amber-800'>
                              {field.difference.message} Wallet value:{' '}
                              {field.difference.walletValue}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {model.walletError && (
              <p role='alert' className='text-destructive text-xs'>
                {model.walletError}
              </p>
            )}
            {model.serverUnavailable && (
              <p
                role='status'
                className='rounded-md bg-amber-50 p-2 text-xs text-amber-900'
              >
                {model.serverUnavailable}
              </p>
            )}
            {result && (
              <p role='status' className='text-sm'>
                {result}
              </p>
            )}
            <div className='flex flex-wrap gap-2 border-t pt-3'>
              <Button type='submit' size='sm'>
                Apply
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  model.discard();
                  setResult('Draft discarded.');
                }}
              >
                Discard
              </Button>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  model.reset();
                  setResult('Startup defaults restored.');
                }}
              >
                Reset to defaults
              </Button>
            </div>
          </form>
        </Tooltip.Provider>
      </PopoverContent>
    </Popover>
  );
}
