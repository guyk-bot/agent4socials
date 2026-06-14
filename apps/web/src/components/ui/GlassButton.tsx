'use client';

import React from 'react';

type Variant = 'primary' | 'secondary' | 'lime';
type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'btn-glass-sm px-3 py-1.5 text-xs',
  md: 'btn-glass-md px-4 py-2 text-sm',
  lg: 'btn-glass-lg px-6 py-3 text-base',
};

const variantClass: Record<Variant, string> = {
  primary: 'btn-glass-primary',
  secondary: 'btn-glass-secondary',
  lime: 'btn-glass-lime',
};

export type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

export function GlassButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}: GlassButtonProps) {
  return (
    <button
      type={type}
      className={[
        'btn-glass',
        variantClass[variant],
        sizeClass[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
