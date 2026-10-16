import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { MessageSquare, Scissors, Type, Zap, RefreshCw, Volume2, Move, Minimize } from "lucide-react";

export default function ScrollCollapseSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Track scroll position within this section
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Smoothly transform floating windows based on scroll progress
  // They collapse toward the center (0,0) as scroll progress advances
  
  // CapCut (Top Left)
  const capcutX = useTransform(scrollYProgress, [0.1, 0.55], [-180, 0]);
  const capcutY = useTransform(scrollYProgress, [0.1, 0.55], [-120, 0]);
  const capcutScale = useTransform(scrollYProgress, [0.1, 0.55], [1, 0.35]);
  const capcutOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const capcutRotate = useTransform(scrollYProgress, [0.1, 0.55], [-8, 12]);

  // Captions (Top Right)
  const subX = useTransform(scrollYProgress, [0.1, 0.55], [200, 0]);
  const subY = useTransform(scrollYProgress, [0.1, 0.55], [-160, 0]);
  const subScale = useTransform(scrollYProgress, [0.1, 0.55], [1, 0.35]);
  const subOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const subRotate = useTransform(scrollYProgress, [0.1, 0.55], [6, -15]);

  // Edit history (Middle Left)
  const gifX = useTransform(scrollYProgress, [0.1, 0.55], [-240, 0]);
  const gifY = useTransform(scrollYProgress, [0.1, 0.55], [20, 0]);
  const gifScale = useTransform(scrollYProgress, [0.1, 0.55], [0.95, 0.3]);
  const gifOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const gifRotate = useTransform(scrollYProgress, [0.1, 0.55], [-12, 5]);

  // Soundtrack (Middle Right)
  const mp3X = useTransform(scrollYProgress, [0.1, 0.55], [220, 0]);
  const mp3Y = useTransform(scrollYProgress, [0.1, 0.55], [40, 0]);
  const mp3Scale = useTransform(scrollYProgress, [0.1, 0.55], [1.05, 0.35]);
  const mp3Opacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const mp3Rotate = useTransform(scrollYProgress, [0.1, 0.55], [15, -8]);

  // Video export (Bottom Left)
  const compX = useTransform(scrollYProgress, [0.1, 0.55], [-160, 0]);
  const compY = useTransform(scrollYProgress, [0.1, 0.55], [160, 0]);
  const compScale = useTransform(scrollYProgress, [0.1, 0.55], [0.9, 0.3]);
  const compOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const compRotate = useTransform(scrollYProgress, [0.1, 0.55], [5, -12]);

  // Speech ducking (Bottom Right)
  const audioX = useTransform(scrollYProgress, [0.1, 0.55], [180, 0]);
  const audioY = useTransform(scrollYProgress, [0.1, 0.55], [180, 0]);
  const audioScale = useTransform(scrollYProgress, [0.1, 0.55], [1, 0.35]);
  const audioOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const audioRotate = useTransform(scrollYProgress, [0.1, 0.55], [-10, 10]);

  // Canvas (Bottom Center Left)
  const rotateX = useTransform(scrollYProgress, [0.1, 0.55], [-60, 0]);
  const rotateY = useTransform(scrollYProgress, [0.1, 0.55], [200, 0]);
  const rotateScale = useTransform(scrollYProgress, [0.1, 0.55], [0.85, 0.3]);
  const rotateOpacity = useTransform(scrollYProgress, [0.1, 0.52], [1, 0]);
  const rotateRotate = useTransform(scrollYProgress, [0.1, 0.55], [14, -6]);

  // Central Chat Target transformations
  const chatBubbleScale = useTransform(scrollYProgress, [0.45, 0.65], [0.9, 1.05]);
  const chatBubbleBackground = useTransform(scrollYProgress, [0.45, 0.65], ["#F8F8F6", "#111111"]);
  const chatBubbleTextColor = useTransform(scrollYProgress, [0.45, 0.65], ["#5B5B5B", "#FFFFFF"]);
  const inputBorder = useTransform(scrollYProgress, [0.45, 0.65], ["1px solid #E5E5E2", "1px solid #2A2A2A"]);

  return (
    <section
      ref={containerRef}
      className="w-full min-h-[110vh] py-10 flex flex-col justify-start relative select-none max-w-7xl mx-auto px-6 md:px-12"
    >
      {/* Sticky container for the floating collapse interaction */}
      <div className="sticky top-24 w-full flex flex-col items-center justify-center pt-8">
        
        {/* Editorial Text */}
        <div className="text-center max-w-3xl mb-12 md:mb-16">
          <span className="font-mono text-xs uppercase tracking-widest text-muted px-3 py-1 rounded-full border border-line bg-white">
            Your editing workflow
          </span>
          <h2 className="font-display font-bold text-4xl md:text-7xl tracking-tight text-ink mt-6 leading-tight">
            One clip.<br />
            A few thoughtful edits.
          </h2>
          <p className="font-sans text-muted text-lg md:text-xl mt-6 max-w-lg mx-auto">
            Bring your source, timing, captions and music into one workflow. Keep earlier versions as you refine the result.
          </p>
        </div>

        {/* Animation stage */}
        <div className="w-full relative flex items-center justify-center min-h-[350px] max-w-4xl">
          
          {/* FLOATING WINDOWS - collapsing on scroll */}

          {/* 1. CapCut */}
          <motion.div
            style={{ x: capcutX, y: capcutY, scale: capcutScale, opacity: capcutOpacity, rotate: capcutRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500">
              <Scissors className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Source video</div>
              <div className="font-mono text-[9px] text-muted">Upload or clip</div>
            </div>
          </motion.div>

          {/* 2. Captions */}
          <motion.div
            style={{ x: subX, y: subY, scale: subScale, opacity: subOpacity, rotate: subRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
              <Type className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Captions</div>
              <div className="font-mono text-[9px] text-muted">Words with timing</div>
            </div>
          </motion.div>

          {/* 3. Edit history */}
          <motion.div
            style={{ x: gifX, y: gifY, scale: gifScale, opacity: gifOpacity, rotate: gifRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
              <Zap className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Edit history</div>
              <div className="font-mono text-[9px] text-muted">Earlier versions</div>
            </div>
          </motion.div>

          {/* 4. Soundtrack */}
          <motion.div
            style={{ x: mp3X, y: mp3Y, scale: mp3Scale, opacity: mp3Opacity, rotate: mp3Rotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-500">
              <RefreshCw className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Soundtrack</div>
              <div className="font-mono text-[9px] text-muted">Music library</div>
            </div>
          </motion.div>

          {/* 5. Video export */}
          <motion.div
            style={{ x: compX, y: compY, scale: compScale, opacity: compOpacity, rotate: compRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-500">
              <Minimize className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Video export</div>
              <div className="font-mono text-[9px] text-muted">Shareable MP4</div>
            </div>
          </motion.div>

          {/* 6. Speech ducking */}
          <motion.div
            style={{ x: audioX, y: audioY, scale: audioScale, opacity: audioOpacity, rotate: audioRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Volume2 className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Speech ducking</div>
              <div className="font-mono text-[9px] text-muted">Music level</div>
            </div>
          </motion.div>

          {/* 7. Canvas */}
          <motion.div
            style={{ x: rotateX, y: rotateY, scale: rotateScale, opacity: rotateOpacity, rotate: rotateRotate }}
            className="absolute z-10 p-3.5 bg-white border border-line rounded-xl shadow-md flex items-center gap-3 w-48 pointer-events-none"
          >
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-500">
              <Move className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-display font-semibold text-xs text-ink">Canvas</div>
              <div className="font-mono text-[9px] text-muted">Portrait or square</div>
            </div>
          </motion.div>


          {/* CENTRAL CHAT CONTAINER - Target of collapse */}
          <motion.div
            style={{
              scale: chatBubbleScale,
              background: chatBubbleBackground,
              color: chatBubbleTextColor,
              border: inputBorder,
            }}
            className="w-full max-w-lg p-5 rounded-2xl shadow-xl flex flex-col gap-3 transition-colors duration-200 relative overflow-hidden"
          >
            {/* Ambient glowing dots when items enter */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cue/10 blur-2xl rounded-full pointer-events-none" />
            
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              <MessageSquare className="w-4 h-4 text-cueInk" />
              <span className="font-mono text-[10px] tracking-wider uppercase opacity-60">
                TakeOne Console
              </span>
            </div>

            <div className="font-mono text-sm leading-relaxed min-h-[48px] flex items-center">
              {scrollYProgress.get() > 0.5 ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  "Trim 0:30 to 1:00, make it vertical and add clean captions."
                </motion.span>
              ) : (
                <span className="opacity-40 italic">
                  Scroll to explore the workflow...
                </span>
              )}
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono opacity-50 border-t border-white/5 pt-2">
              <span>Preview before rendering</span>
              <span>Keep earlier versions</span>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
