export default function TakeOneLogo({ className = "w-8 h-8 text-ink" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      fill="currentColor" 
      className={className} 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Tall capsule on the left */}
      <rect x="20" y="10" width="14" height="48" rx="7" />
      
      {/* Small rounded square at the bottom left */}
      <rect x="20" y="64" width="14" height="14" rx="4" />
      
      {/* 5 Audio waveform bars to the right of the square */}
      {/* Center line of bottom square is y = 71 */}
      {/* Bar 1 (Small) */}
      <rect x="40" y="67" width="4" height="8" rx="2" />
      
      {/* Bar 2 (Medium) */}
      <rect x="48" y="65" width="4" height="12" rx="2" />
      
      {/* Bar 3 (Tallest) */}
      <rect x="56" y="60" width="4" height="22" rx="2" />
      
      {/* Bar 4 (Medium) */}
      <rect x="64" y="65" width="4" height="12" rx="2" />
      
      {/* Bar 5 (Small) */}
      <rect x="72" y="67" width="4" height="8" rx="2" />
    </svg>
  );
}
