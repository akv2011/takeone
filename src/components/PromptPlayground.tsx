import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Check } from "@phosphor-icons/react";
import { button, field, panel } from "../lib/ui";

interface SuggestionChip {
  label: string;
  command: string;
  pipeline: string[];
}

const SUGGESTIONS: SuggestionChip[] = [
  { label: "Trim a moment", command: "Trim 00:02.125 to 00:08.500", pipeline: ["Choose the source", "Set start and end", "Preview the cut", "Render a new version"] },
  { label: "Add captions", command: "Add clean captions", pipeline: ["Read the spoken audio", "Time the words", "Place readable captions", "Export the video"] },
  { label: "Make it vertical", command: "Make it vertical and fit the whole frame", pipeline: ["Choose a video", "Set portrait canvas", "Keep the source in view", "Export the video"] },
  { label: "Speed up a clip", command: "Trim 00:05 to 00:15 and speed 2x", pipeline: ["Choose the range", "Adjust playback speed", "Preview timing", "Render a new version"] },
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
        text: "This is an example. No file is uploaded, rendered or charged here. Pick a sample instruction or type your own.",
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
      label: "Your instruction",
      command: textToSubmit,
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
          text: "Showing the example steps…",
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
              item.text = "Example complete. Open your dashboard to create a real video.";
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
    <section aria-labelledby="try-heading" className="w-full px-4 py-24 sm:px-6 md:px-12 md:py-28">
      <div className="mx-auto grid max-w-[1360px] gap-12 lg:grid-cols-12">
        <div className="rule-top pt-6 lg:col-span-5">
          <p className="eyebrow">Try it here</p>
          <h2 id="try-heading" className="display mt-4 text-[clamp(44px,5.4vw,76px)] text-ink">Try an editing <em>instruction.</em></h2>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {SUGGESTIONS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => simulateTyping(chip)}
                disabled={isTypingSim}
                className="border border-ink bg-surface px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink transition-[transform,box-shadow] duration-200 ease-paper hover:-translate-y-0.5 hover:shadow-hard-sm disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${panel} shadow-hard lg:col-span-7`}>
          <div className="flex items-center justify-between border-b border-ink px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">
            <span>Example · nothing is rendered</span>
            <span aria-hidden="true" className="flex gap-1"><span className="h-2 w-2 border border-ink" /><span className="h-2 w-2 border border-ink" /><span className="h-2 w-2 bg-ink" /></span>
          </div>
          <div className="sheet-ruled h-[340px] space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {chatLog.map((log, idx) => (
              <div key={idx} className={`flex ${log.type === "user" ? "justify-end" : "justify-start"}`}>
                {log.type === "user" ? (
                  <div className="max-w-[85%] break-words bg-ink px-4 py-2.5 font-mono text-sm text-surface">{log.text}</div>
                ) : (
                  <div className="w-full max-w-[85%] space-y-3">
                    <p aria-live="polite" className="text-base leading-7 text-ink2">{log.text}</p>
                    {log.details && (
                      <div className="border border-ink bg-surface p-4">
                        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">
                          <span>Example steps</span>
                          <span className="tabular-nums">{log.progress}%</span>
                        </div>
                        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden bg-paper2">
                          <div className="h-full bg-ink transition-[width] duration-150" style={{ width: `${log.progress ?? 0}%` }} />
                        </div>
                        <ol className="mt-4 space-y-2 text-sm">
                          {log.details.pipeline.map((step, sIdx) => {
                            const isDone = (log.progress || 0) >= ((sIdx + 1) / log.details!.pipeline.length) * 100;
                            return (
                              <li key={sIdx} className={`flex items-center gap-2 ${isDone ? "text-ink" : "text-muted"}`}>
                                {isDone ? <Check aria-hidden="true" size={16} className="text-go" /> : <span aria-hidden="true" className="mx-[3px] h-2.5 w-2.5 border border-muted" />}
                                {step}
                              </li>
                            );
                          })}
                        </ol>
                        {log.done && (
                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                            <span className="text-sm text-muted">Example result, not a real file</span>
                            <Link to="/create" className={button("primary", "sm")}>Create your video</Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div className="flex gap-3 border-t border-ink bg-paper p-3 sm:p-4">
            <input
              type="text"
              name="instruction"
              autoComplete="off"
              aria-label="Editing instruction"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={isTypingSim}
              placeholder={isTypingSim ? "Typing…" : "Trim 00:05 to 00:15 and speed 2x…"}
              className={`${field} min-w-0 flex-1 font-mono`}
            />
            <button type="button" onClick={() => submitMessage(inputValue)} disabled={isTypingSim || !inputValue.trim()} className={button("dark")}>
              Show example
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
