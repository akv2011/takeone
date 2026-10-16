const tools = [
  { name: "Captions", detail: "Fix a misheard word, change the style or font, and move the line to the top, middle or bottom." },
  { name: "Trim and speed", detail: "Mark the start and end to the millisecond and play it back before you render. Speed goes up to 3x." },
  { name: "Reframe", detail: "Switch between 9:16, 1:1 and 16:9. Crop to fill the frame, or fit to keep all of it in view." },
  { name: "Music", detail: "Add a track you own and TakeOne lowers it under the speech, or replace the original audio." },
  { name: "Brand kits", detail: "Save your fonts, caption colours and logo once, then apply them to any video." },
  { name: "Versions", detail: "Every change saves as a new version. Open an earlier one and edit from there." },
];

export default function StudioTools() {
  return (
    <section aria-labelledby="studio-heading" className="px-4 py-20 sm:px-6 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <h2 id="studio-heading" className="text-balance font-display text-5xl font-extrabold leading-[0.9] text-ink md:text-6xl">Then finish it in Studio.</h2>
          <p className="mt-5 text-lg leading-8 text-muted">Each render opens in Studio, where you can change it before you download.</p>
        </div>
        <ul className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <li key={tool.name} className="border-t-2 border-ink pt-4">
              <h3 className="text-lg font-bold text-ink">{tool.name}</h3>
              <p className="mt-2 max-w-sm text-base leading-7 text-muted">{tool.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
