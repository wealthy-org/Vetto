import Image from "next/image";

export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden align-middle ${className ?? ""}`}
      style={{ width: size, height: size * 0.4 }}
      aria-hidden="true"
    >
      <Image
        src="/logo.png"
        alt=""
        width={Math.ceil(size * 1.35)}
        height={Math.ceil(size * 1.35)}
        sizes={`${Math.ceil(size * 1.35)}px`}
        className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
      />
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <Mark />
      <span>Vetto</span>
    </span>
  );
}
