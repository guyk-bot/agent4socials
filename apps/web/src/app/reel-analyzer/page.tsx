'use client';

import React, { useState, useRef } from 'react';
import { Video, Upload, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { ReelAnalyzer } from '@/components/ReelAnalyzer';

function displayUrl(fileUrl: string): string {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('http')) return fileUrl;
  if (fileUrl.includes('r2.dev') || fileUrl.includes('cloudflarestorage.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
  }
  return fileUrl;
}

export default function ReelAnalyzerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [metadata, setMetadata] = useState<{ durationSec: number; width: number; height: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('video/')) {
      setUploadError('Please choose a video file (e.g. MP4, MOV).');
      return;
    }
    setUploadError(null);
    setFile(selectedFile);
    setFileUrl(null);
    setMetadata(null);
    setUploading(true);
    try {
      const res = await api.post<{ uploadUrl: string; fileUrl: string }>('/media/upload-url', {
        fileName: selectedFile.name,
        contentType: selectedFile.type || 'video/mp4',
      });
      const { uploadUrl, fileUrl } = res.data;
      await fetch(uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: { 'Content-Type': selectedFile.type || 'video/mp4' },
      });
      setFileUrl(fileUrl);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upload failed. Try again.';
      setUploadError(msg);
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const onVideoLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !fileUrl) return;
    const durationSec = v.duration;
    const width = v.videoWidth;
    const height = v.videoHeight;
    if (durationSec > 0 && width > 0 && height > 0) {
      setMetadata({ durationSec, width, height });
    }
  };

  const clearVideo = () => {
    setFile(null);
    setFileUrl(null);
    setMetadata(null);
    setUploadError(null);
  };

  const preventDefault = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    preventDefault(e);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="border-b border-neutral-200 bg-white px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100">
              <Video className="w-7 h-7 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Reel Analyzer</h1>
              <p className="text-sm text-neutral-500 mt-0.5">
                Upload a short-form video to get a performance score, breakdown, and optimization tips. Best for 9:16 vertical reels, 5–90 seconds.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {!fileUrl ? (
            <>
              <div
                onDragOver={preventDefault}
                onDragLeave={preventDefault}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className="relative rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50/80 hover:bg-neutral-100/80 transition-colors cursor-pointer flex flex-col items-center justify-center py-16 px-6 min-h-[280px]"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                {uploading ? (
                  <>
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-neutral-700">Uploading video…</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-neutral-400 mb-3" />
                    <p className="text-sm font-medium text-neutral-700">Drop your reel here or click to upload</p>
                    <p className="text-xs text-neutral-500 mt-1">MP4, MOV, or other video. Vertical 9:16 works best.</p>
                  </>
                )}
              </div>
              {uploadError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {uploadError}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Hidden video to read metadata */}
              <video
                ref={videoRef}
                src={displayUrl(fileUrl)}
                preload="metadata"
                crossOrigin="anonymous"
                onLoadedMetadata={onVideoLoadedMetadata}
                className="hidden"
              />

              <div className="flex items-start justify-between gap-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-4 flex items-center gap-4 min-w-0">
                  <div className="w-20 h-28 rounded-lg bg-neutral-100 overflow-hidden shrink-0 aspect-[9/16]">
                    <video
                      src={displayUrl(fileUrl)}
                      className="w-full h-full object-contain"
                      controls
                      preload="metadata"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{file?.name ?? 'Video'}</p>
                    {metadata && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {metadata.width}×{metadata.height} · {(metadata.durationSec).toFixed(1)}s
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearVideo}
                  className="p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 shrink-0"
                  title="Remove video"
                >
                  <X size={20} />
                </button>
              </div>

              {metadata ? (
                <ReelAnalyzer
                  videoUrl={fileUrl}
                  caption=""
                  metadata={{
                    durationSec: metadata.durationSec,
                    width: metadata.width,
                    height: metadata.height,
                  }}
                  videoPreviewUrl={displayUrl(fileUrl)}
                  standalone
                  className="border-0 shadow-sm"
                />
              ) : (
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-neutral-600">Loading video metadata to enable analysis…</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
