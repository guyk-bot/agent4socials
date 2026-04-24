'use client';

import React, { useRef } from 'react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { Upload, Type, RotateCcw } from 'lucide-react';

/** Shown when no custom upload is saved (matches tab favicon + header default). */
const OFFICIAL_LOGO_SRC = '/a4s-tab.svg?v=12';

export default function SettingsPage() {
  const {
    logoUrl,
    appName,
    setLogoUrl,
    setAppName,
    reset,
  } = useWhiteLabel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoPreview = logoUrl ?? OFFICIAL_LOGO_SRC;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">White-label (Branding)</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload your logo so the app reflects your brand.
        </p>
      </div>

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900">Your logo</h2>
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
            <img src={logoPreview} alt="" className="h-full w-full object-contain p-1" />
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
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              <Upload size={18} />
              Upload logo
            </button>
            <button
              type="button"
              onClick={() => setLogoUrl(null)}
              className="text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Use official logo
            </button>
          </div>
        </div>
      </div>

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Type size={20} className="text-neutral-600 shrink-0" aria-hidden />
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
