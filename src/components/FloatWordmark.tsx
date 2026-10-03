import React from 'react';

export interface FloatWordmarkProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  height?: number | string;
  id?: string;
}

/**
 * Official FLOAT Wordmark (Logotype)
 * Replicates the custom geometric typographic branding of FLOAT (F L O Λ T).
 */
export function FloatWordmark({ 
  className = 'h-5 w-auto text-slate-900 dark:text-white', 
  height, 
  id = 'float-brand-wordmark',
  ...props 
}: FloatWordmarkProps) {
  return (
    <svg
      id={id}
      viewBox="0 0 422 100"
      fill="currentColor"
      aria-label="FLOAT"
      role="img"
      className={`inline-block select-none shrink-0 ${className}`}
      style={height ? { height, width: 'auto' } : undefined}
      {...props}
    >
      <title>FLOAT</title>
      {/* Letter F */}
      <path d="M 0,100 L 0,22 A 22,22 0 0 1 22,0 L 62,0 L 62,19 L 19,19 L 19,44 L 54,44 L 54,63 L 19,63 L 19,100 Z" />
      {/* Letter L */}
      <path d="M 84,0 L 103,0 L 103,81 L 144,81 L 144,100 L 106,100 A 22,22 0 0 1 84,78 Z" />
      {/* Letter O */}
      <path 
        d="M 190,0 L 218,0 A 24,24 0 0 1 242,24 L 242,76 A 24,24 0 0 1 218,100 L 190,100 A 24,24 0 0 1 166,76 L 166,24 A 24,24 0 0 1 190,0 Z M 190,19 L 218,19 A 5,5 0 0 1 223,24 L 223,76 A 5,5 0 0 1 218,81 L 190,81 A 5,5 0 0 1 185,76 L 185,24 A 5,5 0 0 1 190,19 Z" 
        fillRule="evenodd" 
      />
      {/* Letter A (stylized caret / inverted V) */}
      <path d="M 262,100 L 296,2 Q 300,0 304,2 L 338,100 L 316,100 L 300,44 L 284,100 Z" />
      {/* Letter T */}
      <path d="M 358,0 L 422,0 L 422,19 L 399.5,19 L 399.5,100 L 380.5,100 L 380.5,19 L 358,19 Z" />
    </svg>
  );
}
