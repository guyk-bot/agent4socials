'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { Upload, Palette, RotateCcw } from 'lucide-react';

export default function SettingsPage() {
  const {
    logoUrl,
    primaryColor,
    backgroundColor,
    textColor,
    appName,
    setLogoUrl,
    setPrimaryColor,
    setBackgroundColor,
    setTextColor,
    setAppName,
    reset,
  } = useWhiteLabel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoUrl);
  const accent = primaryColor || '#525252';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoPreview(dataUrl);
      setLogoUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">White-label (Branding)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload your logo and set colors so the app looks like your own brand.
        </p>
      </div>

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900">Your logo</h2>
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
            {logoPreview ? (
              <img src={logoPreview} alt="Your logo" className="h-full w-full object-contain p-1" />
            ) : (
              <Image src="/logo.svg" alt="Default" width={48} height={48} />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: accent }}
            >
              <Upload size={18} />
              Upload logo
            </button>
            <button
              type="button"
              onClick={() => {
                setLogoPreview(null);
                setLogoUrl(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Use default logo
            </button>
          </div>
        </div>
      </div>

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Palette size={20} />
          App name
        </h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">Display name (sidebar and branding)</label>
          <input
            type="text"
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            placeholder="Agent4Socials"
            className="mt-2 block w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Palette size={20} />
          Colors
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Primary (buttons, links)</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Background</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Text</label>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300"
              />
              <input
                type="text"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCcw size={18} />
          Reset to default
        </button>
      </div>
    </div>
  );
}
