import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CornerDownLeft } from "lucide-react";

interface SuggestionChip {
  label: string;
  command: string;
  outputSize: string;
  pipeline: string[];
}

const SUGGESTIONS: SuggestionChip[] = [
  { label: "Trim a moment", command: "Trim 00:02.125 to 00:08.500", outputSize: "Example MP4", pipeline: ["Choose the source", "Set start and end", "Preview the cut", "Render a new version"] },
  { label: "Add captions", command: "Add clean captions", outputSize: "Example MP4", pipeline: ["Read the spoken audio", "Time the words", "Place readable captions", "Export the video"] },
  { label: "Make it vertical", command: "Make it vertical with blur padding", outputSize: "Example MP4", pipeline: ["Choose a video", "Set portrait canvas", "Keep the source in view", "Export the video"] },
  { label: "Speed up a clip", command: "Trim 00:05 to 00:15 and speed 2x", outputSize: "Example MP4", pipeline: ["Choose the range", "Adjust playback speed", "Preview timing", "Render a new version"] },
];

export default function PromptPlayground() {
  const [inputValue, setInputValue] = useState("");
  const [isTypingSim, setIsTypingSim] = useState(false);
  const [chatLog, setChatLog] = useState<
    Array<{ type: "user" | "bot"; text: string; details?: SuggestionChip; progress?: number; done?: boolean }>
  >([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom only after user interaction (not on initial mount)
  useEffect(() => {
    if (chatLog.length > 1 && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [chatLog]);

  // Initial welcome message
  useEffect(() => {
    setChatLog([
      {
        type: "bot",
        text: "This is an interactive example. No file is uploaded, rendered or charged here. Try an editing instruction below.",
        done: true,
      },
    ]);
  }, []);

  const simulateTyping = (chip: SuggestionChip) => {
    if (isTypingSim) return;
    setIsTypingSim(true);
    setInputValue("");

    let currentText = "";
    let charIndex = 0;
    const speed = 25; // ms per char

    const interval = setInterval(() => {
      if (charIndex < chip.command.length) {
        currentText += chip.command.charAt(charIndex);
        setInputValue(currentText);
        charIndex++;
      } else {
        clearInterval(interval);
        setIsTypingSim(false);
        // Automatically submit the message
        submitMessage(chip.command, chip);
      }
    }, speed);
  };

  const submitMessage = (textToSubmit: string, chipContext?: SuggestionChip) => {
    if (!textToSubmit.trim()) return;

    // 1. Add User Prompt
    const newLogs = [
      ...chatLog,
      { type: "user" as const, text: textToSubmit },
    ];
    setChatLog(newLogs);
    setInputValue("");

    // Find custom/mock info if user typed something not in chips
    const chip = chipContext || {
      label: "Custom Command",
      command: textToSubmit,
      outputSize: "Example MP4",
      pipeline: ["Choose your source", "Describe the edit", "Review your settings", "Submit in your dashboard"],
    };

    // 2. Add pending bot response after a short delay
    setTimeout(() => {
      const botIndex = newLogs.length;
      
      // Insert empty bot log with progress 0
      setChatLog((prev) => [
        ...prev,
        {
          type: "bot",
          text: `Showing an example workflow...`,
          details: chip,
          progress: 0,
          done: false,
        },
      ]);

      // Animate progress up
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        currentProgress += 10;
        setChatLog((prev) => {
          const updated = [...prev];
          const item = updated[botIndex];
          if (item) {
            item.progress = currentProgress;
            if (currentProgress >= 100) {
              item.done = true;
              item.text = `Example complete. Open your dashboard to create a real video.`;
              clearInterval(progressInterval);
            }
          }
          return updated;
        });
      }, 150);
    }, 400);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isTypingSim) {
      submitMessage(inputValue);
    }
  };

  return (
    <section className="w-full py-20 bg-paper border-y border-line relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-6 md:px-12 relative z-10">
        
        {/* Title */}
        <div className="text-left mb-12">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Interactive example</span>
          <h2 className="font-display font-extrabold text-4xl md:text-6xl tracking-[-0.04em] text-ink mt-4">
            Try an editing instruction.
          </h2>
          <p className="font-sans text-muted text-base leading-7 mt-4 max-w-lg">
            Explore an example workflow. This preview does not create a video or use your allowance.
          </p>
        </div>

        {/* Command Terminal UI Wrapper */}
        <div className="w-full bg-ink border border-ink2 rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-[480px]">
          
          {/* Top terminal bar */}
          <div className="bg-[#181818] border-b border-ink2 px-4 py-3 flex justify-between items-center text-xs font-mono text-white/50">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>TakeOne example</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
            </div>
          </div>

          {/* Chat Logs Area */}
          <div className="flex-1 p-6 space-y-6 overflow-y-auto max-h-[300px]">
            {chatLog.map((log, idx) => (
              <div
                key={idx}
                className={`flex ${log.type === "user" ? "justify-end" : "justify-start"}`}
              >
                {log.type === "user" ? (
                  /* User message bubble */
                  <div className="bg-[#222222] border border-[#333333] text-white px-4 py-2.5 rounded-xl rounded-tr-sm max-w-[85%] font-mono text-sm">
                    {log.text}
                  </div>
                ) : (
                  /* Bot log output */
                  <div className="text-white/90 space-y-3 max-w-[85%]">
                    {/* Bot status statement */}
                    <div className="font-mono text-sm leading-relaxed text-white/70">
                      {log.text}
                    </div>

                    {/* Active compilation steps */}
                    {log.details && (
                      <div className="bg-[#181818] border border-ink2 rounded-xl p-4 space-y-2.5 font-mono text-xs shadow-inner">
                        <div className="flex justify-between items-center text-white/40 border-b border-white/5 pb-1.5 mb-2">
                          <span>EXAMPLE STEPS</span>
                          <span>{log.progress}%</span>
                        </div>

                        {log.details.pipeline.map((step, sIdx) => {
                          const threshold = ((sIdx + 1) / log.details!.pipeline.length) * 100;
                          const isDone = (log.progress || 0) >= threshold;
                          
                          return (
                            <div key={sIdx} className="flex items-center gap-2">
                              {isDone ? <span className="w-3.5 text-center text-white/70">✓</span> : (
                                <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/20 animate-spin" />
                              )}
                              <span className={isDone ? "text-white" : "text-white/40"}>
                                {step}
                              </span>
                            </div>
                          );
                        })}

                        {/* If completely finished, show file card output */}
                        {log.done && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#222222] border border-[#333333] p-3 rounded-lg flex items-center justify-between mt-3 text-xs"
                          >
                            <div>
                              <div className="text-white font-semibold">example_result.{log.details.outputSize.split(" ")[1].toLowerCase()}</div>
                              <div className="text-white/40 text-[10px] mt-0.5">{log.details.outputSize}</div>
                            </div>
                            <Link to="/create" className="h-8 px-3 rounded bg-white text-black hover:bg-white/80 transition-colors duration-200 flex items-center font-semibold text-[10px]">Create your video</Link>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Bottom input area */}
          <div className="bg-[#181818] border-t border-ink2 p-4 flex gap-3 items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isTypingSim}
              placeholder={isTypingSim ? "Simulating typing..." : "Type custom editing instructions... (e.g. Speed it up x2, convert to gif)"}
              className="flex-1 bg-ink border border-ink2 rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-white/20 outline-none focus:border-white/40 transition-colors"
            />
            <button
              onClick={() => submitMessage(inputValue)}
              disabled={isTypingSim || !inputValue.trim()}
              className="h-11 px-4 rounded-xl bg-white text-ink hover:bg-white/80 disabled:opacity-40 transition-all duration-300 flex items-center justify-center gap-1.5 font-mono text-xs font-bold"
            >
              <span>Show example</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Suggestion Chips */}
        <div className="mt-8 flex flex-wrap gap-2.5 justify-center">
          {SUGGESTIONS.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => simulateTyping(chip)}
              disabled={isTypingSim}
              className="px-4 py-2 rounded-full border border-line bg-white text-xs font-mono text-muted hover:text-ink hover:border-ink disabled:opacity-50 transition-all duration-200 flex items-center gap-1.5"
            >
              <span>{chip.label}</span>
            </button>
          ))}
        </div>

      </div>
    </section>
  );
}
