import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Serve the 4S logo as the favicon so /favicon.ico always returns the correct image
 * and caches can be bypassed via Cache-Control.
 */
export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'logo-48.png');
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
