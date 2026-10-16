import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HardDrive, Type, FileVideo, RefreshCw, Scissors, Volume2 } from "lucide-react";

export default function MiniFeaturesGrid() {
  const [activeCycle, setActiveCycle] = useState(0);

  // Auto increment cycles for animations
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCycle((prev) => (prev + 1) % 100);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="w-full py-16 bg-paper max-w-7xl mx-auto px-6 md:px-12">
      
      {/* Section Header */}
      <div className="mb-12 text-left">
        <span className="font-mono text-xs uppercase tracking-widest text-muted px-3 py-1 rounded-full border border-line bg-white">
          Features
        </span>
        <h2 className="font-display font-bold text-4xl md:text-7xl tracking-tight text-ink mt-6 leading-tight max-w-3xl">
          Your footage. <br />
          Your next reel.
        </h2>
        <p className="font-sans text-muted text-lg md:text-xl mt-6 max-w-lg">
          Pick a moment, add captions and shape the soundtrack. These illustrations show the workflow, not a live render.
        </p>
      </div>

      {/* Grid of Miniature UIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* CARD 1: Compression */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Export">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <HardDrive className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Shareable MP4 exports</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Download an MP4 from your dashboard or receive your finished video in Telegram.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex flex-col justify-center h-28 relative overflow-hidden">
            <div className="flex justify-between items-center mb-2">
              <span className="font-mono text-[10px] text-muted">Example export</span>
              <span className="font-mono text-[10px] text-ink font-semibold">MP4</span>
            </div>

            {/* Compressor shrinking visualization */}
            <div className="w-full bg-white border border-line p-3 rounded-xl flex justify-between items-center relative overflow-hidden">
              <div className="flex items-center gap-2 z-10">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-500 font-mono text-[10px] font-bold">
                  MP4
                </div>
                <div className="font-mono text-[10px]">
                  <div>party.mp4</div>
                  <div className="text-muted text-[8px] flex items-center gap-1 mt-0.5">
                    <span className="text-muted">Video</span>
                    <span className="text-go font-bold">Ready to share</span>
                  </div>
                </div>
              </div>

              {/* Compressed label */}
              <div className="px-2 py-0.5 rounded bg-green-50 border border-green-200 text-[8px] font-mono text-go z-10">
                Export
              </div>

              {/* Progress Sweep */}
              <motion.div
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-cue/10 to-transparent pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* CARD 2: Subtitle Burner */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Subtitle">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <Type className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Styled Captions</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Add readable captions timed to the spoken audio. Choose clean, meme or karaoke styles in your instructions.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex items-center justify-center h-28 relative overflow-hidden">
            <div className="w-full h-full rounded-xl bg-ink border border-ink2 p-2 flex flex-col justify-end relative">
              
              {/* Fake visual player grid */}
              <div className="absolute inset-0 flex items-center justify-center opacity-10">
                <div className="w-16 h-16 rounded-full border-2 border-white border-dashed animate-spin" />
              </div>

              {/* Subtitles pulsing word by word */}
              <div className="z-10 text-center w-full pb-1">
                <span className="bg-black/85 text-[9px] font-display text-white border border-white/10 px-2 py-1 rounded inline-block shadow-md">
                  {activeCycle % 3 === 0 && "Let's trim this segment..."}
                  {activeCycle % 3 === 1 && "And speed it up..."}
                  {activeCycle % 3 === 2 && "Directly inside the chat!"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 3: Video-to-GIF Conversion */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Versions">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <FileVideo className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Edit history</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Keep earlier versions and start another edit from a completed video in your Studio.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex items-center justify-center h-28 relative overflow-hidden">
            <div className="w-full flex items-center justify-center gap-3">
              {/* Source MP4 icon */}
              <div className="w-12 h-12 rounded-xl bg-white border border-line flex flex-col items-center justify-center shadow-sm">
                <span className="font-mono text-[9px] text-muted">MP4</span>
                <span className="font-mono text-[8px] text-red-400 font-bold mt-0.5">Original</span>
              </div>

              {/* Arrow transition */}
              <div className="flex flex-col items-center">
                <RefreshCw className="w-4 h-4 text-cueInk animate-spin" />
              </div>

              {/* Target GIF Loop card */}
              <div className="w-16 h-16 rounded-xl bg-ink border border-ink2 flex flex-col items-center justify-center relative overflow-hidden shadow-md">
                {/* Loop badge */}
                <div className="absolute top-1 left-1 bg-go text-black text-[6px] font-mono px-1 rounded">
                  VERSION
                </div>
                <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center mb-1 mt-1">
                  <span className="font-display text-[9px] text-white font-bold">V2</span>
                </div>
                <div className="text-[7px] text-white/40 font-mono">New edit</div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: Convert Format Chain */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Convert">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <RefreshCw className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Choose your canvas</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Make portrait, square or landscape videos for the place you want to share them.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex flex-col justify-center h-28 relative overflow-hidden">
            {/* Conversion sequence indicator */}
            <div className="flex justify-between items-center gap-1.5 px-1.5 font-mono text-[9px] text-muted">
              <span className={activeCycle % 4 === 0 ? "text-cueInk font-bold scale-110" : ""}>9:16</span>
              <span>→</span>
              <span className={activeCycle % 4 === 1 ? "text-cueInk font-bold scale-110" : ""}>1:1</span>
              <span>→</span>
              <span className={activeCycle % 4 === 2 ? "text-cueInk font-bold scale-110" : ""}>16:9</span>
              <span>→</span>
              <span className={activeCycle % 4 === 3 ? "text-cueInk font-bold scale-110" : ""}>MP4</span>
            </div>

            {/* Transcode progress bar */}
            <div className="w-full bg-white rounded-full h-1.5 mt-4 border border-line overflow-hidden">
              <motion.div
                key={activeCycle % 4}
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 1 }}
                className="h-full bg-cue"
              />
            </div>
          </div>
        </div>

        {/* CARD 5: Trim Timeline */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Trim">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <Scissors className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Smart Trimming</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Choose precise start and end times, then preview your cut and speed before applying an edit.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex flex-col justify-center h-28 relative overflow-hidden">
            {/* Timeline with boundaries shrinking */}
            <div className="w-full h-6 bg-white border border-line rounded-lg relative overflow-hidden flex items-center">
              
              {/* Left trim bracket */}
              <motion.div
                animate={{ left: ["5%", "25%", "5%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 bottom-0 w-2.5 bg-cue cursor-ew-resize rounded-l z-10 flex items-center justify-center"
              >
                <div className="w-0.5 h-3 bg-white" />
              </motion.div>

              {/* Trimmed content region */}
              <motion.div
                animate={{ left: ["5%", "25%", "5%"], right: ["5%", "20%", "5%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 bottom-0 bg-blue-50/70 border-y-2 border-ink pointer-events-none"
              />

              {/* Right trim bracket */}
              <motion.div
                animate={{ right: ["5%", "20%", "5%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute top-0 bottom-0 w-2.5 bg-cue cursor-ew-resize rounded-r z-10 flex items-center justify-center"
              >
                <div className="w-0.5 h-3 bg-white" />
              </motion.div>

              <span className="w-full text-center text-[8px] font-mono text-cueInk font-bold z-0">
                0:15 - 0:45
              </span>
            </div>
          </div>
        </div>

        {/* CARD 6: Audio Cleaner */}
        <div className="bg-white border border-line rounded-3xl p-6 flex flex-col justify-between min-h-[300px] hover:shadow-lg transition-shadow duration-300 group hover-trigger" data-cursor-text="Music">
          <div>
            <div className="w-10 h-10 rounded-xl bg-paper flex items-center justify-center text-ink mb-4">
              <Volume2 className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Background music</h3>
            <p className="font-sans text-xs text-muted mt-2">
              Choose from the connected music library. Adjust the level and lower music under speech, or replace all original audio.
            </p>
          </div>

          {/* Mini UI Workspace */}
          <div className="mt-6 border border-line rounded-2xl p-4 bg-paper flex items-center justify-center h-28 relative overflow-hidden">
            {/* Waveform split (Noisy vs Clean) */}
            <div className="w-full flex items-center justify-between gap-[2px] px-2 h-14 relative bg-white border border-line rounded-xl overflow-hidden">
              
              {/* Left half - Spikey red noise */}
              <div className="w-1/2 flex items-center justify-around gap-[1.5px] opacity-40">
                <div className="w-0.5 h-10 bg-red-400" />
                <div className="w-0.5 h-5 bg-red-400" />
                <div className="w-0.5 h-12 bg-red-400" />
                <div className="w-0.5 h-8 bg-red-400" />
                <div className="w-0.5 h-14 bg-red-400" />
                <div className="w-0.5 h-6 bg-red-400" />
                <div className="w-0.5 h-10 bg-red-400" />
              </div>

              {/* Divider scan-bar */}
              <motion.div
                animate={{ left: ["0%", "100%", "0%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 bottom-0 w-0.5 bg-cue shadow-lg shadow-cue z-10"
              />

              {/* Right half - Clean green sine waves */}
              <div className="w-1/2 flex items-center justify-around gap-[1.5px] opacity-80">
                <div className="w-0.5 h-6 bg-go" />
                <div className="w-0.5 h-4 bg-go" />
                <div className="w-0.5 h-7 bg-go" />
                <div className="w-0.5 h-5 bg-go" />
                <div className="w-0.5 h-8 bg-go" />
                <div className="w-0.5 h-6 bg-go" />
                <div className="w-0.5 h-7 bg-go" />
              </div>

              {/* Status Labels */}
              <div className="absolute top-1 left-2 font-mono text-[7px] text-red-500 bg-red-50 px-1 rounded border border-red-100">
                Original audio
              </div>
              <div className="absolute top-1 right-2 font-mono text-[7px] text-go bg-green-50 px-1 rounded border border-green-100">
                Music mix
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
