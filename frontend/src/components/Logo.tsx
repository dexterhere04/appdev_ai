// components/Logo.tsx
"use client";
import * as React from "react";

type Props = {
  showText?: boolean;
  className?: string;
};

export function Logo({ showText = true, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-label="Builder AI">
      
      {/* Minimal Tech Icon */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 48 48"
        fill="none"
        className="shrink-0"
        role="img"
        aria-hidden="true"
      >
        {/* Background rounded square */}
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="10"
          fill="#1A1A1D"
          stroke="#2F2F33"
          strokeWidth="2"
        />

        {/* Graph-like circuit marks */}
        <g stroke="#E6E6E6" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 30 L24 18 L32 22" opacity="0.9" />
          <path d="M24 18 L24 30" opacity="0.55" />
          <path d="M16 24 L20 22" opacity="0.55" />
          <circle cx="16" cy="30" r="3" fill="#E6E6E6" />
          <circle cx="24" cy="18" r="3" fill="#E6E6E6" />
          <circle cx="32" cy="22" r="3" fill="#E6E6E6" />
          <circle cx="24" cy="30" r="2.5" fill="#E6E6E6" opacity="0.9" />
        </g>
      </svg>

      {/* Wordmark */}
      {showText && (
        <span className="text-base font-semibold text-white/90 tracking-tight">
          DexiForge
        </span>
      )}
    </div>
  );
}
