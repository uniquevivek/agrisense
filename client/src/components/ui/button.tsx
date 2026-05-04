'use client';

import React from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

type ClassesOptions = {
  fullWidth?: boolean;
};

function classes(variant: Variant, size: Size, opts: ClassesOptions = {}) {
  const base = [
    'inline-flex items-center justify-center cursor-pointer select-none',
    'rounded-lg text-sm font-medium',
    'transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ring-offset-white dark:ring-offset-[#121212]',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-[0.98]'
  ].join(' ');

  const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4',
    lg: 'h-12 px-5 text-base',
  };

  const variants: Record<Variant, string> = {
    primary: 'bg-brand text-white shadow-sm hover:shadow-md hover:bg-brand/90',
    secondary: 'bg-secondary text-white shadow-sm hover:shadow-md hover:bg-secondary/90',
    destructive: 'bg-red-600 text-white shadow-sm hover:shadow-md hover:bg-red-700',
    outline: 'border border-gray-300 text-gray-900 bg-white hover:border-brand hover:bg-brand/5 dark:border-gray-700 dark:text-gray-100 dark:bg-transparent',
    ghost: 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-[#222]'
  };

  return [base, sizes[size], variants[variant], opts.fullWidth ? 'w-full' : ''].filter(Boolean).join(' ');
}

export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  href?: string;
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
};

export default function Button({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = `${classes(variant, size, { fullWidth })} ${className}`;
  const isDisabled = (rest as any)?.disabled || loading;

  const Content = (
    <>
      {loading && (
        <svg
          className="mr-2 h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && leftIcon ? <span className="mr-2 inline-flex">{leftIcon}</span> : null}
      <span>{children}</span>
      {!loading && rightIcon ? <span className="ml-2 inline-flex">{rightIcon}</span> : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        role="button"
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        onClick={isDisabled ? (e) => e.preventDefault() : undefined}
        className={`${cls} ${isDisabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : ''}`}
        {...(rest as any)}
      >
        {Content}
      </a>
    );
  }

  return (
    <button className={cls} disabled={isDisabled} aria-busy={loading || undefined} {...rest}>
      {Content}
    </button>
  );
}
