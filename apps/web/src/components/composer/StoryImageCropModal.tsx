'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { STORY_ASPECT_RATIO, STORY_OUTPUT_HEIGHT, STORY_OUTPUT_WIDTH } from '@/lib/story-image-constants';

export type StoryCropResult = { blob: Blob; fileName: string };

type Props = {
  file: File;
  title?: string;
  aspectLabel?: string;
  onCancel: () => void;
  onConfirm: (result: StoryCropResult) => void;
};

export function StoryImageCropModal({
  file,
  title = 'Fit to Story size',
  aspectLabel = '9:16 (1080×1920)',
  onCancel,
  onConfirm,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; ox: number; oy: number }>({
    active: false,
    startX: 0,
    startY: 0,
    ox: 0,
    oy: 0,
  });

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const initScaleForImage = useCallback((imgW: number, imgH: number) => {
    const vw = viewportRef.current?.clientWidth ?? 288;
    const vh = vw / STORY_ASPECT_RATIO;
    const cover = Math.max(vw / imgW, vh / imgH);
    setScale(cover);
    setOffset({ x: 0, y: 0 });
  }, []);

  const exportCrop = useCallback(async () => {
    if (!src || !natural.w || !viewportRef.current) return;
    setExporting(true);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = src;
      });
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const vw = viewportRef.current.clientWidth;
      const outW = STORY_OUTPUT_WIDTH;
      const outH = STORY_OUTPUT_HEIGHT;
      const k = outW / vw;

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      // WYSIWYG: match the editor viewport (black letterbox + image position/zoom).
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outW, outH);

      const drawW = iw * scale * k;
      const drawH = ih * scale * k;
      const drawX = outW / 2 - drawW / 2 + offset.x * k;
      const drawY = outH / 2 - drawH / 2 + offset.y * k;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('Export failed');
      const base = file.name.replace(/\.[^.]+$/, '') || 'story';
      onConfirm({ blob, fileName: `${base}-story.jpg` });
    } finally {
      setExporting(false);
    }
  }, [src, natural.w, scale, offset, file.name, onConfirm]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-crop-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <div>
            <h2 id="story-crop-title" className="text-base font-semibold text-neutral-900 dark:text-white">
              {title}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Drag to reposition. Zoom to fit {aspectLabel}.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div
            ref={viewportRef}
            className="relative mx-auto w-full max-w-[288px] aspect-[9/16] rounded-xl overflow-hidden bg-neutral-900 cursor-grab active:cursor-grabbing touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {src ? (
              <img
                src={src}
                alt=""
                draggable={false}
                className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
                style={{
                  width: natural.w ? natural.w * scale : 'auto',
                  height: natural.h ? natural.h * scale : 'auto',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setNatural({ w: el.naturalWidth, h: el.naturalHeight });
                  initScaleForImage(el.naturalWidth, el.naturalHeight);
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin text-white" size={28} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut size={16} className="text-neutral-400 shrink-0" />
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.02}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 h-2 rounded-full accent-orange-500"
              aria-label="Zoom"
            />
            <ZoomIn size={16} className="text-neutral-400 shrink-0" />
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-600 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void exportCrop()}
            disabled={exporting || !natural.w}
            className="flex-1 py-2.5 rounded-xl bg-[#1C9CFB] hover:bg-[#0B87E8] text-white text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : null}
            {exporting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
