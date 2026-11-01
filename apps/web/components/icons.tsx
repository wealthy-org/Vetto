type P = { className?: string };
const base = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconSwap = ({ className }: P) => (<svg {...base} className={className}><path d="M7 7h12l-3-3M17 17H5l3 3" /></svg>);
export const IconLock = ({ className }: P) => (<svg {...base} className={className}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const IconShield = ({ className }: P) => (<svg {...base} className={className}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>);
export const IconKey = ({ className }: P) => (<svg {...base} className={className}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2" /></svg>);
export const IconBrowser = ({ className }: P) => (<svg {...base} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></svg>);
export const IconArrow = ({ className }: P) => (<svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconCheck = ({ className }: P) => (<svg {...base} className={className}><path d="m5 12 5 5 9-10" /></svg>);
