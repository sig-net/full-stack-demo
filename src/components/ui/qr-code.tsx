'use client';

import { useEffect, useRef, useState, ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import QRCodeStyling from 'qr-code-styling';
import React from 'react';

import { cn } from '@/lib/utils';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

interface BaseQRCodeProps {
  value: string;
  size?: number;
  className?: string;
  errorCorrectionLevel?: ErrorCorrectionLevel;
  margin?: number;
}

interface QRCodeWithIcon extends BaseQRCodeProps {
  icon: ReactElement;
  iconUrl?: never;
}

interface QRCodeWithIconUrl extends BaseQRCodeProps {
  icon?: never;
  iconUrl: string;
}

interface QRCodeWithoutIcon extends BaseQRCodeProps {
  icon?: never;
  iconUrl?: never;
}

type QRCodeProps = QRCodeWithIcon | QRCodeWithIconUrl | QRCodeWithoutIcon;

async function convertIconToDataUrl(
  icon: ReactElement,
): Promise<string | undefined> {
  try {
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText =
      'position:absolute;left:-9999px;width:64px;height:64px';
    document.body.appendChild(tempDiv);

    const { createRoot } = await import('react-dom/client');
    const root = createRoot(tempDiv);

    const clonedIcon = React.cloneElement(icon, {
      width: 64,
      height: 64,
    } as React.SVGProps<SVGSVGElement>);

    root.render(clonedIcon);
    await new Promise(resolve => setTimeout(resolve, 50));

    const svg = tempDiv.querySelector('svg');
    let imageDataUrl: string | undefined;

    if (svg) {
      const svgString = new XMLSerializer().serializeToString(svg);
      imageDataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
    }

    root.unmount();
    document.body.removeChild(tempDiv);

    return imageDataUrl;
  } catch (error) {
    console.warn('Failed to convert icon to data URL:', error);
    return undefined;
  }
}

export function QRCode({
  value,
  size = 160,
  className,
  icon,
  iconUrl,
  errorCorrectionLevel = 'H',
  margin = 16,
}: QRCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    const generateQR = async () => {
      if (!value || !containerRef.current) return;

      try {
        setIsGenerating(true);
        setError(null);
        containerRef.current.innerHTML = '';

        let imageDataUrl: string | undefined;
        if (iconUrl) {
          imageDataUrl = iconUrl;
        } else if (icon) {
          imageDataUrl = await convertIconToDataUrl(icon);
        }

        const qrCode = new QRCodeStyling({
          width: size,
          height: size,
          type: 'svg',
          data: value,
          image: imageDataUrl,
          margin,
          qrOptions: { errorCorrectionLevel },
          dotsOptions: { color: '#000000', type: 'dots' },
          backgroundOptions: { color: '#ffffff' },
          cornersSquareOptions: { color: '#000000', type: 'square' },
          cornersDotOptions: { color: '#000000', type: 'square' },
          imageOptions: imageDataUrl
            ? {
                crossOrigin: 'anonymous',
                margin: 8,
                imageSize: 0.4,
                hideBackgroundDots: true,
              }
            : undefined,
        });

        if (!abortController.signal.aborted && containerRef.current) {
          qrCode.append(containerRef.current);
        }
      } catch (err) {
        console.error('QR Code generation failed:', err);
        if (!abortController.signal.aborted) {
          setError(
            err instanceof Error ? err.message : 'Failed to generate QR code',
          );
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsGenerating(false);
        }
      }
    };

    generateQR();
    return () => abortController.abort();
  }, [value, size, icon, iconUrl, errorCorrectionLevel, margin]);

  if (error) {
    return (
      <div
        className={cn(
          'ds-stack ds-round ds-frame ds-dot-error ds-inset-content items-center justify-center',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <div className='ds-caption ds-label ds-error text-center'>
          QR Code Error
        </div>
        <div className='ds-caption ds-error ds-before-control text-center'>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {isGenerating && (
        <div className='ds-surface ds-stack ds-round ds-frame absolute inset-0 items-center justify-center'>
          <Loader2 className='ds-spinner' size={24} />
          <div className='ds-muted ds-caption ds-label'>Generating QR</div>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn('', isGenerating ? 'opacity-0' : 'opacity-100')}
        style={{
          visibility: isGenerating ? 'hidden' : 'visible',
          maxWidth: '100%',
          height: 'auto',
        }}
      />
    </div>
  );
}
