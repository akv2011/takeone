// A short run of unexposed 35mm frames. `filling` lights them left to right for loading states.
export default function BlankStrip({ frames = 5, filling = false, className = "" }: { frames?: number; filling?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`film-strip mx-auto w-full shadow-film ${className}`}>
      {filling && <style>{"@keyframes frame-fill { 0%, 100% { background-color: #2a2620; } 45% { background-color: #6b5a3e; } }"}</style>}
      <div className="grid gap-[6px]" style={{ gridTemplateColumns: `repeat(${frames}, minmax(0, 1fr))` }}>
        {Array.from({ length: frames }, (_, i) => (
          <span
            key={i}
            className={`block aspect-[9/16] rounded-[2px] bg-[#2a2620] ${filling ? "animate-[frame-fill_1.6s_cubic-bezier(.2,.8,.2,1)_infinite_both] motion-reduce:animate-none" : ""}`}
            style={filling ? { animationDelay: `${i * 0.16}s` } : undefined}
          />
        ))}
      </div>
      <div className="edge-print flex justify-between px-1 pt-[6px] text-[9px]"><span>TAKEONE 5063</span><span>▶ 1</span></div>
    </div>
  );
}
