import api, { API_MEDIA_UPLOAD_TIMEOUT_MS, R2_DIRECT_UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { validateFileForPlatform, getValidationErrorMessage, type ValidationResult } from './validation';
import { convertMediaFile, supportsCanvasConversion, estimateConversionTime, type ConversionProgress, type ConversionResult } from './conversion';

/** Vercel serverless body limit; same-origin route avoids R2 CORS for small files. */
export const MEDIA_API_ROUTE_MAX_BYTES = 4 * 1024 * 1024;

function uploadErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  const rawMsg =
    err &&
    typeof err === 'object' &&
    'response' in err &&
    (err as { response?: { data?: { message?: string }; status?: number } }).response?.data?.message;
  if (typeof rawMsg === 'string' && rawMsg.trim()) return rawMsg.trim();
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 503) return 'Media storage is not configured on the server.';
  if (status === 401) return 'Session expired. Sign in again, then retry the upload.';
  if (status === 413) return 'File is too large for direct upload. Try a shorter video or compress the file.';
  const raw = String((err as Error)?.message ?? '');
  if (/failed to fetch|network error|load failed/i.test(raw)) {
    return 'Upload failed (network). Try again, use a smaller file, or check your connection.';
  }
  return fallback;
}

async function uploadFileViaApi(file: File, safeName: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, safeName);
  const res = await api.post<{ fileUrl: string; message?: string }>('/media/upload', form, {
    timeout: API_MEDIA_UPLOAD_TIMEOUT_MS,
  });
  if (!res.data?.fileUrl) {
    throw new Error(res.data?.message || 'Upload did not return a file URL.');
  }
  return res.data.fileUrl;
}

async function uploadFileViaPresignedPut(file: File, safeName: string, contentType: string): Promise<string> {
  const res = await api.post<{ uploadUrl: string; fileUrl: string }>(
    '/media/upload-url',
    { fileName: safeName, contentType },
    { timeout: API_MEDIA_UPLOAD_TIMEOUT_MS }
  );
  const { uploadUrl, fileUrl } = res.data;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), R2_DIRECT_UPLOAD_TIMEOUT_MS);
  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
      signal: ac.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Upload timed out. Try a smaller file or check your connection.');
    }
    throw new Error(
      'Storage upload failed (network). Large files need R2 CORS configured, or use a file under 4 MB.'
    );
  } finally {
    clearTimeout(timer);
  }
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => '');
    throw new Error(
      `Storage upload failed (${putRes.status})${detail ? `: ${detail.slice(0, 120)}` : ''}`
    );
  }
  return fileUrl;
}

export interface UploadOptions {
  platform?: string;
  postType?: 'feed' | 'story' | 'shorts';
  onValidation?: (result: ValidationResult) => void;
  onConversionStart?: () => void;
  onConversionProgress?: (progress: ConversionProgress) => void;
  onConversionComplete?: (result: ConversionResult) => void;
  autoConvert?: boolean; // Default: true
  /** Skip the Vercel /media/upload proxy and PUT straight to R2 (faster for chat attachments). */
  directUpload?: boolean;
}

export interface UploadResult {
  fileUrl: string;
  originalFile: File;
  finalFile: File;
  wasConverted: boolean;
  validationResult?: ValidationResult;
  conversionResult?: ConversionResult;
}

/** Upload a file to R2 with platform validation and auto-conversion */
export async function uploadMediaFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
  const { platform, postType, autoConvert = true } = options;
  
  let finalFile = file;
  let validationResult: ValidationResult | undefined;
  let conversionResult: ConversionResult | undefined;
  let wasConverted = false;

  // Validate against platform constraints if platform is specified
  if (platform) {
    validationResult = await validateFileForPlatform(file, platform, postType);
    options.onValidation?.(validationResult);

    // If validation fails and auto-conversion is enabled
    if (!validationResult.isValid && validationResult.canAutoFix && autoConvert) {
      if (!supportsCanvasConversion()) {
        throw new Error('File needs conversion but your browser doesn\'t support it. Please try a different file.');
      }

      if (!validationResult.suggestedFixes) {
        throw new Error(getValidationErrorMessage(validationResult, platform, false));
      }

      options.onConversionStart?.();

      try {
        conversionResult = await convertMediaFile(
          file,
          validationResult.suggestedFixes,
          options.onConversionProgress
        );
        
        finalFile = conversionResult.file;
        wasConverted = true;
        
        options.onConversionComplete?.(conversionResult);

        // Re-validate the converted file
        const newValidation = await validateFileForPlatform(finalFile, platform, postType);
        if (!newValidation.isValid) {
          throw new Error(getValidationErrorMessage(newValidation, platform, false));
        }
      } catch (conversionError) {
        throw new Error(
          conversionError instanceof Error 
            ? `Conversion failed: ${conversionError.message}` 
            : 'File conversion failed'
        );
      }
    } else if (!validationResult.isValid) {
      // Cannot auto-fix or auto-convert disabled
      throw new Error(getValidationErrorMessage(validationResult, platform, autoConvert));
    }
  }

  // Upload the final file
  const fileUrl = await uploadFileCore(finalFile, options.directUpload === true);

  return {
    fileUrl,
    originalFile: file,
    finalFile,
    wasConverted,
    validationResult,
    conversionResult
  };
}

/** Legacy function for backward compatibility */
export async function uploadMediaFileSimple(file: File): Promise<string> {
  const result = await uploadMediaFile(file, { autoConvert: false });
  return result.fileUrl;
}

/** Core upload logic (internal) */
async function uploadFileCore(file: File, preferDirectUpload = false): Promise<string> {
  const contentType =
    file.type?.split(';')[0]?.trim() ||
    (file.name.toLowerCase().match(/\.(mp4|mov|webm|m4v)$/) ? 'video/mp4' : 'image/jpeg');
  const safeName =
    (file.name || (contentType.startsWith('video/') ? 'video.mp4' : 'image.jpg'))
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200) || (contentType.startsWith('video/') ? 'video.mp4' : 'image.jpg');

  const canUseApiRoute = file.size <= MEDIA_API_ROUTE_MAX_BYTES;

  if (canUseApiRoute && !preferDirectUpload) {
    try {
      return await uploadFileViaApi(file, safeName);
    } catch (err) {
      try {
        return await uploadFileViaPresignedPut(file, safeName, contentType);
      } catch (e2) {
        throw new Error(uploadErrorMessage(e2, 'Upload failed. Try again.'));
      }
    }
  }

  try {
    return await uploadFileViaPresignedPut(file, safeName, contentType);
  } catch (err) {
    if (canUseApiRoute) {
      try {
        return await uploadFileViaApi(file, safeName);
      } catch (e2) {
        throw new Error(uploadErrorMessage(e2, 'Upload failed. Try again.'));
      }
    }
    throw new Error(
      uploadErrorMessage(
        err,
        'Upload failed. Files over 4 MB need storage CORS configured, or compress the file first.'
      )
    );
  }
}

export function mediaTypeFromUrl(url: string): 'IMAGE' | 'VIDEO' {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(url) ? 'VIDEO' : 'IMAGE';
}
