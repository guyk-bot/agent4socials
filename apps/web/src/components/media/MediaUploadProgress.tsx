'use client';

import React from 'react';
import { CheckCircle, AlertCircle, Loader2, FileImage, FileVideo } from 'lucide-react';
import { type MediaUploadState, getStatusMessage, isUploadInProgress } from '@/hooks/useMediaUpload';
import { type UploadResult } from '@/lib/media/upload-client';

interface MediaUploadProgressProps {
  state: MediaUploadState;
  className?: string;
  showDetails?: boolean;
}

export function MediaUploadProgress({ 
  state, 
  className = '',
  showDetails = true 
}: MediaUploadProgressProps) {
  const inProgress = isUploadInProgress(state);
  const statusMessage = getStatusMessage(state);

  if (state.stage === 'idle') {
    return null;
  }

  return (
    <div className={`rounded-lg border p-4 ${className}`}>
      {/* Status Header */}
      <div className="flex items-center space-x-3">
        <StatusIcon state={state} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {statusMessage}
          </p>
          {inProgress && (
            <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Conversion Details */}
      {showDetails && state.result?.wasConverted && state.result.conversionResult && (
        <ConversionDetails result={state.result} />
      )}

      {/* Error Details */}
      {state.stage === 'error' && state.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ state }: { state: MediaUploadState }) {
  switch (state.stage) {
    case 'validating':
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    case 'converting':
      return <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />;
    case 'uploading':
      return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
    case 'complete':
      return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    default:
      return null;
  }
}

function ConversionDetails({ result }: { result: UploadResult }) {
  if (!result.wasConverted || !result.conversionResult) return null;

  const { conversionResult } = result;
  const isImage = result.originalFile.type.startsWith('image/');
  const isVideo = result.originalFile.type.startsWith('video/');

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const compressionPercent = Math.round(conversionResult.compressionRatio * 100);

  return (
    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
      <div className="flex items-start space-x-3">
        {isImage ? (
          <FileImage className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        ) : isVideo ? (
          <FileVideo className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
        ) : null}
        
        <div className="flex-1 text-sm">
          <p className="font-medium text-green-800 mb-1">
            File optimized for upload
          </p>
          
          <div className="space-y-1 text-green-700">
            <div className="flex justify-between">
              <span>Original size:</span>
              <span className="font-medium">{formatFileSize(conversionResult.originalSize)}</span>
            </div>
            <div className="flex justify-between">
              <span>Optimized size:</span>
              <span className="font-medium">{formatFileSize(conversionResult.newSize)}</span>
            </div>
            {compressionPercent > 0 && (
              <div className="flex justify-between">
                <span>Space saved:</span>
                <span className="font-medium text-green-600">{compressionPercent}%</span>
              </div>
            )}
          </div>

          {conversionResult.conversionsApplied.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-green-600 mb-1">Applied optimizations:</p>
              <ul className="text-xs text-green-700 space-y-0.5">
                {conversionResult.conversionsApplied.map((conversion, index) => (
                  <li key={index} className="flex items-center">
                    <span className="w-1 h-1 bg-green-600 rounded-full mr-2 flex-shrink-0" />
                    {conversion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for inline display
 */
export function MediaUploadProgressCompact({ state }: { state: MediaUploadState }) {
  const inProgress = isUploadInProgress(state);

  if (state.stage === 'idle') return null;

  return (
    <div className="flex items-center space-x-2 text-sm">
      <StatusIcon state={state} />
      <span className={`
        ${state.stage === 'error' ? 'text-red-600' : ''}
        ${state.stage === 'complete' ? 'text-green-600' : ''}
        ${inProgress ? 'text-blue-600' : 'text-gray-600'}
      `}>
        {getStatusMessage(state)}
      </span>
      {inProgress && (
        <span className="text-xs text-gray-500">
          {state.progress}%
        </span>
      )}
    </div>
  );
}