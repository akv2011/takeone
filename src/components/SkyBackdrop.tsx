// Fixed morning sky behind every page. Marketing pages get the full sky; working screens get a quieter wash.
export default function SkyBackdrop({ calm = false }: { calm?: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-top transition-opacity duration-700 ease-paper"
        style={{ backgroundImage: "url(/sky.jpg)", opacity: calm ? 0.42 : 1 }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-paper" />
    </div>
  );
}
