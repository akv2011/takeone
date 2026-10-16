import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Send, CheckCircle2, Video, Wifi, Battery } from "lucide-react";
import TakeOneLogo from "./TakeOneLogo";

type Scene = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export default function InteractiveWorkspace() {
  const [scene, setScene] = useState<Scene>(0);
  const [stepIndex, setStepIndex] = useState(-1);
  const [captionIndex, setCaptionIndex] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Detect mobile for slower animation timing
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const bubbleDuration = isMobile ? 0.65 : 0.4;

  // Core Timeline Controller
  useEffect(() => {
    let timer: number;
    let stepTimer: number;
    let captionTimer: number;

    // Detect mobile for slower animation timing
    const isMobile = window.innerWidth < 768;
    const t = (ms: number) => (isMobile ? ms * 1.6 : ms); // 60% slower on mobile

    const runTimeline = () => {
      // Scene 0: Waiting state; coordinate with Hero typography entrance
      setScene(0);
      setStepIndex(-1);
      setCaptionIndex(0);

      // Scene 1: Raw Video Upload
      timer = window.setTimeout(() => {
        setScene(1);

        // Scene 2: User Prompt
        timer = window.setTimeout(() => {
          setScene(2);

          // Scene 3: TakeOne options (7.5s - 10.0s)
          timer = window.setTimeout(() => {
            setScene(3);

            // Scene 4: User Taps Option
            timer = window.setTimeout(() => {
              setScene(4);

              // Scene 5: TakeOne Processing Checklist
              timer = window.setTimeout(() => {
                setScene(5);
                
                // Animate steps ticking off in Scene 5
                setStepIndex(0);
                stepTimer = window.setInterval(() => {
                  setStepIndex((prev) => {
                    if (prev >= 3) {
                      clearInterval(stepTimer);
                      return 3;
                    }
                    return prev + 1;
                  });
                }, isMobile ? 1200 : 800);

                // Scene 6: Vertical Reel Plays
                timer = window.setTimeout(() => {
                  setScene(6);
                  clearInterval(stepTimer);
                  setStepIndex(3);

                  // Animate subtitles during Scene 6 playback
                  setCaptionIndex(0);
                  captionTimer = window.setInterval(() => {
                    setCaptionIndex((prev) => (prev + 1) % 3);
                  }, isMobile ? 1600 : 1100);

                  // Scene 7: TakeOne final completion and download button
                  timer = window.setTimeout(() => {
                    setScene(7);
                    clearInterval(captionTimer);

                    // Restart loop after showing final download screen
                    timer = window.setTimeout(() => {
                      runTimeline();
                    }, t(3500));

                  }, t(3500)); // Scene 6 duration

                }, t(3500)); // Scene 5 duration

              }, t(1000)); // Scene 4 duration

            }, t(2500)); // Scene 3 duration

          }, t(2500)); // Scene 2 duration

        }, t(2500)); // Scene 1 duration

      }, 2500); // Scene 0 duration
    };

    runTimeline();

    return () => {
      clearTimeout(timer);
      clearInterval(stepTimer);
      clearInterval(captionTimer);
    };
  }, []);

  // Autoscroll chat screen inside mock container without scrolling the main browser page
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [scene, stepIndex]);

  // Captions for Scene 6
  const captions = [
    "YOUR NEXT REEL",
    "CRAZY PARTY ENERGY 🎉",
    "TAKEONE AUTOMATED IT 🚀"
  ];

  return (
    <div className="w-full relative flex flex-col items-center">

      {/* iPhone 16 Pro Mockup Frame (Responsive heights: 480px/520px/570px) with 3deg premium tilt and hover straightening */}
      <motion.div 
        style={{ rotate: 3, transformOrigin: "center" }}
        whileHover={{ rotate: 0, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative mx-auto w-[230px] lg:w-[250px] xl:w-[275px] h-[480px] lg:h-[520px] xl:h-[570px] bg-ink2 rounded-[40px] xl:rounded-[48px] border-[4px] xl:border-[5px] border-muted shadow-2xl p-[5px] xl:p-[7px] flex flex-col ring-1 ring-black/40 overflow-hidden select-none cursor-pointer"
      >
        
        {/* Speaker / Ambient reflection overlay */}
        <div className="absolute top-0 inset-x-0 h-4 bg-gradient-to-b from-white/10 to-transparent pointer-events-none rounded-t-[40px]" />
        
        {/* Bezel details */}
        <div className="absolute left-[3px] top-[140px] w-[3px] h-[45px] bg-ink2 border-l border-muted/50 rounded-l" />
        <div className="absolute left-[3px] top-[200px] w-[3px] h-[45px] bg-ink2 border-l border-muted/50 rounded-l" />
        <div className="absolute right-[3px] top-[160px] w-[3px] h-[65px] bg-ink2 border-r border-muted/50 rounded-r" />

        {/* Display Screen */}
        <div className="w-full h-full bg-paper rounded-[32px] xl:rounded-[38px] relative overflow-hidden flex flex-col justify-between border border-black/10 shadow-inner">
          
          {/* Top Status Bar Wrapper */}
          <div className="w-full h-12 px-6 pt-3 flex justify-between items-center text-[10px] font-semibold font-sans text-ink z-30 select-none">
            <span>9:41</span>
            
            {/* Dynamic Island Notching */}
            <motion.div 
              animate={scene === 5 ? { width: 130, height: 24 } : { width: 85, height: 20 }}
              transition={{ type: "spring", stiffness: 220, damping: 25 }}
              className="absolute left-1/2 -translate-x-1/2 top-2 bg-black rounded-full flex items-center justify-between px-3 text-[8px] font-mono text-white overflow-hidden shadow-md z-50 cursor-pointer"
            >
              {scene === 5 ? (
                <>
                  <span className="text-go animate-pulse">●</span>
                  <span className="scale-90 opacity-90">Processing...</span>
                  <div className="w-2.5 h-2.5 rounded-full border border-dashed border-ink animate-spin" />
                </>
              ) : (
                <div className="w-full flex justify-center items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                  <span className="text-[7px] text-white/40 tracking-wider">TAKEONE</span>
                </div>
              )}
            </motion.div>

            <div className="flex items-center gap-1">
              <Wifi className="w-3 h-3 stroke-[2.5]" />
              <Battery className="w-4 h-4" />
            </div>
          </div>

          {/* TakeOne Header Navigation */}
          <div className="w-full bg-white border-b border-line py-2 px-5 flex items-center gap-2.5 z-20">
            <div className="w-7 h-7 rounded-full bg-ink/5 flex items-center justify-center">
              <TakeOneLogo className="w-4 h-4 text-ink" />
            </div>
            <div>
              <h4 className="font-display font-bold text-[11px] text-ink leading-none">takeone</h4>
              <span className="text-[8px] font-mono text-muted flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-go animate-pulse" />
                Example conversation
              </span>
            </div>
          </div>

          {/* Chat Logs Screen Area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2.5 flex flex-col justify-start relative select-none scrollbar-none">
            
            {/* Ambient subtle noise overlay inside screen */}
            <div className="absolute inset-0 noise-overlay opacity-[0.015] pointer-events-none" />

            <AnimatePresence>
              {/* Scene 1: Upload Raw Video */}
              {(scene === 1 || scene === 2) && (
                <motion.div
                  key="uploaded-video"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-white border border-line p-2 rounded-2xl rounded-tr-sm self-end max-w-[85%] text-[10px] shadow-sm flex flex-col gap-2 relative overflow-hidden"
                >
                  <div className="w-full aspect-[16/10] rounded-xl bg-ink/5 border border-ink/10 relative overflow-hidden flex items-center justify-center">
                    <Video className="w-5 h-5 text-ink/30" />
                    <div className="absolute top-1.5 left-2 flex gap-0.5">
                      <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[6px] font-mono text-red-500 uppercase tracking-widest font-bold">Raw Clip</span>
                    </div>
                    <span className="absolute bottom-1 right-2 text-[7px] font-mono text-ink/60 bg-white/80 px-1 rounded">0:45</span>
                  </div>
                  <div className="flex items-center justify-between text-[8px] font-mono text-muted px-0.5">
                    <span>party-video.mov</span>
                    <span className="text-go font-bold flex items-center gap-0.5">Uploaded</span>
                  </div>
                </motion.div>
              )}

              {/* Scene 2: Send Prompt */}
              {(scene >= 2 && scene <= 4) && (
                <motion.div
                  key="editing-prompt"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-white border border-line px-2.5 py-1.5 rounded-xl rounded-tr-sm self-end max-w-[85%] text-[10px] font-sans text-ink font-medium shadow-sm leading-tight"
                >
                  "Turn this into a viral 15-second reel."
                </motion.div>
              )}

              {/* Scene 3: TakeOne options */}
              {(scene >= 3 && scene <= 5) && (
                <motion.div
                  key="hook-options"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-ink text-white p-2.5 rounded-xl rounded-tl-sm self-start max-w-[85%] text-[10px] space-y-1.5 border border-white/10 shadow-md relative overflow-hidden"
                >
                  <p className="font-mono text-[7px] text-muted tracking-widest uppercase">TAKEONE AGENT</p>
                  <p className="leading-tight text-[9.5px]">Here are 3 viral hooks. Select one:</p>
                  <div className="space-y-1 pt-0.5 relative">
                    
                    {/* Simulated hand cursor tap on Option 1 */}
                    {scene === 4 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 2 }}
                        animate={{ opacity: 1, scale: [1, 0.8, 1.1] }}
                        className="absolute top-3 left-2 w-4 h-4 rounded-full bg-cue/30 border border-ink flex items-center justify-center z-20 pointer-events-none"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-cue" />
                      </motion.div>
                    )}

                    <motion.div 
                      animate={scene >= 4 ? { borderColor: "rgba(37, 99, 235, 0.5)", backgroundColor: "rgba(37, 99, 235, 0.15)" } : {}}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[8.5px] leading-tight flex items-center justify-between"
                    >
                      <span>⚡ Option 1: Fast cut + drop</span>
                      {scene >= 4 && <span className="text-[6px] bg-cue text-white px-1 py-0.5 rounded font-mono uppercase">Selected</span>}
                    </motion.div>
                    
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[8.5px] leading-tight opacity-30">
                      🎬 Option 2: Cinematic setup
                    </div>
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[8.5px] leading-tight opacity-30">
                      🎤 Option 3: Commentary cut
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Scene 5: Processing Checklist */}
              {(scene === 5 || scene === 6) && (
                <motion.div
                  key="processing-checklist"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-white border border-line p-2.5 rounded-xl rounded-tl-sm self-start max-w-[85%] text-[9px] space-y-2 shadow-sm w-full"
                >
                  <div className="font-mono text-[7px] text-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-cue animate-pulse" />
                    TAKEONE PIPELINE
                  </div>
                  
                  <div className="space-y-1.5 font-mono text-[8.5px] text-ink">
                    <div className="flex items-center gap-2">
                      {stepIndex >= 0 ? <CheckCircle2 className="w-3 h-3 text-go" /> : <div className="w-3 h-3 rounded-full border-2 border-dashed border-muted/30 animate-spin" />}
                      <span className={stepIndex >= 0 ? "text-ink font-semibold" : "text-muted"}>Writing hook...</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stepIndex >= 1 ? (
                        <CheckCircle2 className="w-3 h-3 text-go" />
                      ) : stepIndex === 0 ? (
                        <div className="w-3 h-3 rounded-full border-2 border-dashed border-muted/30 animate-spin" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-line" />
                      )}
                      <span className={stepIndex >= 1 ? "text-ink font-semibold" : "text-muted"}>Generating captions...</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stepIndex >= 2 ? (
                        <CheckCircle2 className="w-3 h-3 text-go" />
                      ) : stepIndex === 1 ? (
                        <div className="w-3 h-3 rounded-full border-2 border-dashed border-muted/30 animate-spin" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-line" />
                      )}
                      <span className={stepIndex >= 2 ? "text-ink font-semibold" : "text-muted"}>Cropping 9:16 aspect...</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {stepIndex >= 3 ? (
                        <CheckCircle2 className="w-3 h-3 text-go" />
                      ) : stepIndex === 2 ? (
                        <div className="w-3 h-3 rounded-full border-2 border-dashed border-muted/30 animate-spin" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-line" />
                      )}
                      <span className={stepIndex >= 3 ? "text-ink font-semibold" : "text-muted"}>Exporting pipeline...</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Scene 6: Vertical Reel Plays */}
              {(scene === 6 || scene === 7) && (
                <motion.div
                  key="video-preview"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-white border border-line p-1.5 rounded-2xl rounded-tr-sm self-end max-w-[85%] shadow-sm flex flex-col gap-1.5 relative overflow-hidden"
                >
                  {/* Simulated 9:16 Vertical Video Screen */}
                  <div className="w-[155px] xl:w-[175px] h-[205px] xl:h-[235px] rounded-xl bg-ink relative overflow-hidden flex flex-col justify-between p-3 select-none">
                    
                    {/* Glowing color blobs simulating video playback */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-cue/40 via-go/20 to-[#F97316]/30 opacity-80" />
                    
                    <motion.div
                      animate={{ 
                        scale: [1, 1.08, 1],
                        rotate: [0, 1, -1, 0]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <div className="w-28 h-28 rounded-full bg-cue/20 blur-xl" />
                      <div className="w-24 h-24 rounded-full bg-go/20 blur-2xl ml-8" />
                    </motion.div>

                    {/* Top status overlays */}
                    <div className="z-10 flex justify-between items-center text-[7px] text-white/70 font-mono">
                      <span>9:16 Crop</span>
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
                        PREVIEW
                      </span>
                    </div>

                    {/* Subtitle Burn-In Overlay */}
                    <div className="z-10 text-center w-full flex flex-col items-center gap-1.5 py-4">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={captionIndex}
                          initial={{ opacity: 0, scale: 0.85, y: 5 }}
                          animate={{ opacity: 1, scale: 1.05, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 300, damping: 18 }}
                          className="bg-yellow-400 text-ink px-2.5 py-1.5 rounded-lg font-display font-extrabold text-[10px] tracking-tight uppercase shadow-lg border border-yellow-300 text-center"
                        >
                          {captions[captionIndex]}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Bottom audio / layout overlays */}
                    <div className="z-10 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[8px] text-white font-sans">
                        <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[7px]">R</div>
                        <span className="font-semibold">@takeone_agent</span>
                      </div>
                      
                      {/* Audio waveform */}
                      <div className="flex gap-0.5 items-end h-5 pt-1.5 overflow-hidden opacity-90">
                        {Array.from({ length: 28 }).map((_, i) => (
                          <motion.div
                            key={i}
                            animate={{ height: [4, Math.random() * 12 + 6, 4] }}
                            transition={{ duration: 0.6 + i * 0.02, repeat: Infinity, ease: "easeInOut" }}
                            className="flex-1 bg-white/80 rounded-full"
                            style={{ height: 4 }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[8px] font-mono text-muted px-1">
                    <span>Reel completed</span>
                    <span className="text-cueInk font-bold flex items-center gap-0.5">15s Export</span>
                  </div>
                </motion.div>
              )}

              {/* Scene 7: Final Completion Reply & Download */}
              {scene === 7 && (
                <motion.div
                  key="completion-message"
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: bubbleDuration }}
                  className="bg-ink text-white p-2.5 rounded-xl rounded-tl-sm self-start max-w-[85%] text-[9px] space-y-1.5 border border-white/10 shadow-md w-full"
                >
                  <div className="font-mono text-[7px] text-muted tracking-widest uppercase">TAKEONE AGENT</div>
                  <p className="leading-tight text-[10px] font-sans">Your vertical reel is complete.</p>
                  
                  <div className="space-y-0.5 text-[8.5px] font-mono opacity-80 pt-1 border-t border-white/10">
                    <div className="text-go">✓ Reel ready</div>
                    <div className="text-go">✓ Captions added</div>
                    <div className="text-go">✓ Hook optimized</div>
                    <div className="text-go">✓ Exported</div>
                  </div>

                  <motion.a href="/create"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full mt-1.5 py-1.5 rounded-lg bg-cue text-white font-semibold text-[9px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-cue/20"
                  >
                    <ArrowRight className="w-3 h-3 stroke-[2.5]" />
                    Create your video
                  </motion.a>
                </motion.div>
              )}

            </AnimatePresence>

          </div>

          {/* Simulated iOS Chat Input Bar */}
          <div className="w-full bg-white border-t border-line p-2.5 pb-4 flex items-center gap-2 z-20">
            <div className="flex-1 bg-paper border border-line rounded-2xl py-1.5 px-3 flex items-center justify-between text-[9px] text-muted font-mono">
              <span>
                {scene === 1 
                  ? "Select input..." 
                  : scene === 2 
                  ? "Typing: 'Turn this into...'" 
                  : scene === 4 
                  ? "Selecting hook..."
                  : scene === 5
                  ? "Example editing workflow..."
                  : "Ask TakeOne anything..."}
              </span>
              <div className="w-4 h-4 rounded-full bg-ink/5 flex items-center justify-center text-ink/30">
                +
              </div>
            </div>
            <button className="w-7 h-7 rounded-full bg-ink flex items-center justify-center text-white opacity-80">
              <Send className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

          {/* Bottom iOS Home Indicator Bar */}
          <div className="absolute bottom-1 inset-x-0 flex justify-center z-30 pointer-events-none">
            <div className="w-28 h-1 bg-black/40 rounded-full" />
          </div>

         </div>
      </motion.div>
    </div>
  );
}
