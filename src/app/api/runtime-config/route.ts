import { NextResponse } from 'next/server';
import { serverRuntimeConfiguration } from '@/lib/config/server-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  try {
    return NextResponse.json(serverRuntimeConfiguration());
  } catch {
    return NextResponse.json(
      { error: 'Server deployment configuration is unavailable.' },
      { status: 503 },
    );
  }
}
