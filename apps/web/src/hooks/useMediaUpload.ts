import { useState, useCallback } from 'react';
import { uploadMediaFile, type UploadOptions, type UploadResult } from '@/lib/media/upload-client';
import { type ValidationResult } from '@/lib/media/validation';
import { type ConversionProgress, type ConversionResult } from '@/lib/media/conversion';

export interface MediaUploadState {
  isUploading: boolean;
  isValidating: boolean;
  isConverting: boolean;
  progress: number;
  stage: 'idle' | 'validating' | 'converting' | 'uploading' | 'complete' | 'error';
  message: string;
  error?: string;
  result?: UploadResult;
}

export interface UseMediaUploadOptions extends UploadOptions {
  onSuccess?: (result: UploadResult) => void;
  onError?: (error: string) => void;
  silentSuccess?: boolean; // If true, don't show progress for successful uploads
}

export function useMediaUpload(options: UseMediaUploadOptions = {}) {
  const [state, setState] = useState<MediaUploadState>({
    isUploading: false,
    isValidating: false,
    isConverting: false,
    progress: 0,
    stage: 'idle',
    message: '',
  });

  const updateState = useCallback((updates: Partial<MediaUploadState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const uploadFile = useCallback(async (
    file: File,
    overrides: Partial<UploadOptions> = {}
  ): Promise<UploadResult | null> => {
    const mergedOptions = { ...options, ...overrides };
    try {
      // Only show validation UI if we're not in silent mode
      if (!mergedOptions.silentSuccess) {
        updateState({
          isUploading: true,
          isValidating: true,
          stage: 'validating',
          progress: 0,
          message: 'Checking file compatibility...',
          error: undefined,
          result: undefined,
        });
      } else {
        updateState({
          isUploading: true,
          isValidating: true,
          stage: 'idle', // Keep UI hidden
          progress: 0,
          message: '',
          error: undefined,
          result: undefined,
        });
      }

      const uploadOptions: UploadOptions = {
        ...mergedOptions,
        onValidation: (result: ValidationResult) => {
          mergedOptions.onValidation?.(result);
          
          if (!result.isValid && result.canAutoFix) {
            updateState({
              isValidating: false,
              isConverting: true,
              stage: 'converting',
              message: 'This file isn\'t compatible with your selected platform. Converting it now...',
            });
          } else if (result.isValid && !mergedOptions.silentSuccess) {
            updateState({
              isValidating: false,
              stage: 'uploading',
              progress: 30,
              message: 'Uploading file...',
            });
          } else if (result.isValid && mergedOptions.silentSuccess) {
            // File is valid and we want silent upload - keep UI hidden
            updateState({
              isValidating: false,
              stage: 'idle',
              progress: 0,
              message: '',
            });
          }
        },
        onConversionStart: () => {
          mergedOptions.onConversionStart?.();
          updateState({
            isConverting: true,
            stage: 'converting',
            progress: 10,
            message: 'This file isn\'t compatible with your selected platform. Converting it now...',
          });
        },
        onConversionProgress: (progress: ConversionProgress) => {
          mergedOptions.onConversionProgress?.(progress);
          
          const progressPercent = Math.round(10 + (progress.progress * 0.6)); // 10-70%
          updateState({
            progress: progressPercent,
            message: progress.message,
          });
        },
        onConversionComplete: (result: ConversionResult) => {
          mergedOptions.onConversionComplete?.(result);
          
          const savings = result.compressionRatio * 100;
          const message = savings > 5 
            ? `File optimized (${savings.toFixed(0)}% size reduction). Uploading...`
            : 'File converted successfully. Uploading...';
            
          updateState({
            isConverting: false,
            stage: 'uploading',
            progress: 75,
            message,
          });
        },
      };

      const result = await uploadMediaFile(file, uploadOptions);

      if (mergedOptions.silentSuccess && !result.wasConverted) {
        // Silent success - reset to idle without showing success message
        updateState({
          isUploading: false,
          stage: 'idle',
          progress: 0,
          message: '',
          result,
        });
      } else {
        // Show completion only if there was conversion or not in silent mode
        updateState({
          isUploading: false,
          stage: 'complete',
          progress: 100,
          message: result.wasConverted ? 'File optimized and uploaded!' : 'Upload complete!',
          result,
        });
      }

      mergedOptions.onSuccess?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      updateState({
        isUploading: false,
        isValidating: false,
        isConverting: false,
        stage: 'error',
        error: errorMessage,
        message: 'Upload failed',
      });

      mergedOptions.onError?.(errorMessage);
      return null;
    }
  }, [options, updateState]);

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      isValidating: false,
      isConverting: false,
      progress: 0,
      stage: 'idle',
      message: '',
    });
  }, []);

  return {
    ...state,
    uploadFile,
    reset,
  };
}

/**
 * Helper function to get user-friendly status messages
 */
export function getStatusMessage(state: MediaUploadState): string {
  if (state.error) return state.error;
  
  switch (state.stage) {
    case 'validating':
      return state.message || 'Checking file...';
    case 'converting':
      return state.message || 'Optimizing file...';
    case 'uploading':
      return state.message || 'Uploading...';
    case 'complete':
      return 'Upload successful!';
    case 'error':
      return state.error || 'Upload failed';
    default:
      return state.message || 'Ready to upload';
  }
}

/**
 * Helper function to determine if upload is in progress
 */
export function isUploadInProgress(state: MediaUploadState): boolean {
  return state.isUploading || state.isValidating || state.isConverting;
}