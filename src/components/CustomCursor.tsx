import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CustomCursor() {
  const [hovered, setHovered] = useState(false);
  const [cursorText, setCursorText] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth springs for cursor outline lag
  const springConfig = { damping: 30, stiffness: 250, mass: 0.5 };
  const outlineX = useSpring(mouseX, springConfig);
  const outlineY = useSpring(mouseY, springConfig);

  useEffect(() => {
    // Only enable on fine pointers (desktop)
    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    setIsVisible(true);

    const moveCursor = (e: MouseEvent) => {
      mouseX.set(e.clientX - 16);
      mouseY.set(e.clientY - 16);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isInteractive =
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.closest("button") ||
        target.closest("a") ||
        target.tagName === "INPUT" ||
        target.classList.contains("hover-trigger");

      if (isInteractive) {
        setHovered(true);
        
        // Custom text for specific items
        const text = target.getAttribute("data-cursor-text");
        if (text) {
          setCursorText(text);
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const isInteractive =
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.closest("button") ||
        target.closest("a") ||
        target.tagName === "INPUT" ||
        target.classList.contains("hover-trigger");

      if (isInteractive) {
        setHovered(false);
        setCursorText("");
      }
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", handleMouseOver);
    window.addEventListener("mouseout", handleMouseOut);

    // Add CSS class to body to hide default cursor
    document.body.classList.add("custom-cursor-active");

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", handleMouseOver);
      window.removeEventListener("mouseout", handleMouseOut);
      document.body.classList.remove("custom-cursor-active");
    };
  }, [mouseX, mouseY]);

  if (!isVisible) return null;

  return (
    <>
      {/* Inner Dot - exact match */}
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 bg-ink rounded-full pointer-events-none z-[10000]"
        style={{
          x: mouseX,
          y: mouseY,
          // Shift dot to center (offset by 12px since main mouse is offset by 16px)
          translateX: 12,
          translateY: 12,
        }}
      />

      {/* Outer Circle - smooth lag */}
      <motion.div
        className="fixed top-0 left-0 rounded-full border border-ink pointer-events-none z-[9999] flex items-center justify-center text-[10px] font-medium font-mono uppercase text-ink bg-transparent"
        style={{
          x: outlineX,
          y: outlineY,
          width: hovered ? (cursorText ? 80 : 48) : 32,
          height: hovered ? (cursorText ? 80 : 48) : 32,
        }}
        animate={{
          scale: hovered ? 1.1 : 1,
          backgroundColor: hovered && !cursorText ? "rgba(17, 17, 17, 0.05)" : "rgba(17, 17, 17, 0)",
          borderColor: hovered ? "rgba(17, 17, 17, 0.3)" : "rgba(17, 17, 17, 0.4)",
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
        {cursorText && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="px-1 text-center leading-tight whitespace-nowrap"
          >
            {cursorText}
          </motion.span>
        )}
      </motion.div>
    </>
  );
}
