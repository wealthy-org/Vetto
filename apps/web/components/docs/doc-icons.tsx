import type { SVGProps } from "react";

/**
 * Line glyphs for the docs shell, drawn on a 24×24 grid so they all sit on the
 * same optical weight as the reference. Kept local: no icon dependency, nothing
 * fetched at runtime.
 */
const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const DocIcon = {
  welcome: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.6 2.6M15.4 15.4L18 18M18 6l-2.6 2.6M8.6 15.4L6 18" />
    </svg>
  ),
  quickstart: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 20h14" />
      <path d="M8.5 17.5h7" opacity=".55" />
    </svg>
  ),
  read: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M4 6.5h16" />
      <path d="M4 12h11" />
      <path d="M4 17.5h7" />
      <path d="M17.5 9.5l2.5 2.5-2.5 2.5" />
    </svg>
  ),
  swap: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M3 12h5" />
      <path d="M8 12c3.5 0 4.5-6 9.5-6" opacity=".6" />
      <path d="M8 12h11" />
      <path d="M8 12c3.5 0 4.5 6 9.5 6" opacity=".6" />
      <path d="M16.5 9.5L20 12l-3.5 2.5" />
    </svg>
  ),
  key: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3.2M21 12v2.4" />
    </svg>
  ),
  shield: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M12 3.5l7 2.6v5.4c0 4-2.9 7.3-7 8.9-4.1-1.6-7-4.9-7-8.9V6.1z" />
      <path d="M9.2 12.2l2 2 3.6-3.9" />
    </svg>
  ),
  search: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <circle cx="10" cy="10" r="6" />
      <path d="M7.2 8.4a3.4 3.4 0 0 1 3.2-2" opacity=".6" />
      <path d="M14.3 14.3c1.6 1.8 2.2 3.6 1.9 5.2-.3 1.5-1.4 2.3-2.6 2.1" />
    </svg>
  ),
  burner: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <circle cx="9.5" cy="8.5" r="4.5" />
      <path d="M9.5 13v8" />
      <path d="M6 18h7" opacity=".55" />
      <path d="M17 6.5c1.6 0 3 1.4 3 3s-1.4 3-3 3" opacity=".6" />
    </svg>
  ),
  browser: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="14" rx="2.5" />
      <path d="M3 8.5h18" />
      <path d="M6.5 6.4h.01M9 6.4h.01" />
      <path d="M12 21h0" opacity="0" />
      <rect x="3" y="18" width="18" height="3" rx="1.5" opacity=".45" />
    </svg>
  ),
  status: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <path d="M3 12h4l2.5-6 3.5 12 2.5-6H21" />
    </svg>
  ),
  wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" opacity=".5" />
      <circle cx="17" cy="14.5" r="1.3" />
    </svg>
  ),
  faq: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 1 1 3.6 2.5c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  info: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} strokeWidth={2} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  warn: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  ),
  arrow: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  chevronDown: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} strokeWidth={2} {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  ),
  alert: (p: SVGProps<SVGSVGElement>) => (
    <svg {...base} strokeWidth={2} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5h.01" />
    </svg>
  ),
};

export type DocIconName = keyof typeof DocIcon;
