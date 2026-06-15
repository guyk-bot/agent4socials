import { NextRequest, NextResponse } from 'next/server';
import { resolveDirectPublishMediaUrl, isDirectPublishMediaUrl } from '@/lib/publish-media-fetch';

export async function POST(request: NextRequest) {
  try {
    const { mediaUrl } = await request.json();
    
    if (!mediaUrl) {
      return NextResponse.json({ error: 'mediaUrl is required' }, { status: 400 });
    }

    // Test URL resolution
    const resolvedUrl = resolveDirectPublishMediaUrl(mediaUrl);
    const isDirect = isDirectPublishMediaUrl(resolvedUrl);
    
    // Test accessibility with timeout
    let accessibilityTest = { accessible: false, status: 0, error: null };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(resolvedUrl, { 
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      accessibilityTest = {
        accessible: response.ok,
        status: response.status,
        error: response.ok ? null : `HTTP ${response.status}`,
      };
    } catch (fetchError) {
      accessibilityTest = {
        accessible: false,
        status: 0,
        error: (fetchError as Error)?.message || 'Fetch failed',
      };
    }

    // Check URL characteristics
    let urlAnalysis = { isHttps: false, isDirectStorage: false, host: '' };
    try {
      const parsed = new URL(resolvedUrl);
      urlAnalysis = {
        isHttps: parsed.protocol === 'https:',
        isDirectStorage: /\.(r2\.dev|cloudflarestorage\.com|amazonaws\.com|s3\.|storage\.googleapis\.com)$/i.test(parsed.hostname),
        host: parsed.hostname,
      };
    } catch (_) {
      urlAnalysis = { isHttps: false, isDirectStorage: false, host: 'invalid-url' };
    }

    return NextResponse.json({
      original: mediaUrl,
      resolved: resolvedUrl,
      changed: mediaUrl !== resolvedUrl,
      isDirect,
      accessibility: accessibilityTest,
      urlAnalysis,
      recommendation: getRecommendation(accessibilityTest, urlAnalysis, isDirect),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error)?.message || 'Unknown error' }, 
      { status: 500 }
    );
  }
}

function getRecommendation(
  accessibility: { accessible: boolean; status: number; error: string | null },
  urlAnalysis: { isHttps: boolean; isDirectStorage: boolean; host: string },
  isDirect: boolean
): string {
  if (!accessibility.accessible) {
    return `❌ URL not accessible to external services (${accessibility.error}). Meta/Facebook cannot fetch this media.`;
  }
  if (!urlAnalysis.isHttps) {
    return '❌ URL must use HTTPS for Meta API compatibility.';
  }
  if (!urlAnalysis.isDirectStorage) {
    return `⚠️ URL (${urlAnalysis.host}) may not be direct storage. Use R2, S3, or CloudFlare for best results.`;
  }
  if (!isDirect) {
    return '⚠️ URL not detected as direct storage URL by our function.';
  }
  return '✅ URL should work with Threads API - publicly accessible, HTTPS, direct storage.';
}