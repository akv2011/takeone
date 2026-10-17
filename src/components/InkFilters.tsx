// SVG filters referenced from CSS (`.ink-wobble`) and inline SVG strokes.
export default function InkFilters() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="ink-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        <filter id="ink-blot" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="9" />
          <feDisplacementMap in="SourceGraphic" scale="9" />
        </filter>
      </defs>
    </svg>
  );
}
