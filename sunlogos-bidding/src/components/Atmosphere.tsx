export function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-ink" />
      <div className="sunburst absolute -top-[20%] left-1/2 h-[80vw] w-[80vw] -translate-x-1/2 opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(8,6,4,0.55)_70%,rgba(6,4,3,0.92)_100%)]" />
      <div className="grain absolute inset-0 opacity-40 mix-blend-overlay" />
    </div>
  );
}

export function SunMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle cx="32" cy="32" r="11" fill="#e4b049" />
      <circle cx="32" cy="32" r="16" stroke="#e4b049" strokeOpacity="0.45" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x1 = 32 + Math.cos(a) * 20;
        const y1 = 32 + Math.sin(a) * 20;
        const x2 = 32 + Math.cos(a) * 28;
        const y2 = 32 + Math.sin(a) * 28;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e4b049" strokeWidth="1.4" />;
      })}
    </svg>
  );
}

export function Face({
  src,
  name,
  size = "lg",
}: {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const dim =
    size === "sm" ? "h-10 w-10" : size === "md" ? "h-16 w-16" : size === "xl" ? "h-44 w-44" : "h-24 w-24";
  return (
    <div
      className={`${dim} overflow-hidden rounded-full border-2 border-gold/70 bg-ink-2 shadow-glow ring-4 ring-gold/10`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display text-gold">
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
