import { useEffect, useRef, type RefObject } from 'react';

// Share selection playback between Studio and local media acceptance checks.
export function useTimelinePlayer(player: RefObject<HTMLVideoElement | null>, sourceId: string | undefined, onTime: (seconds: number) => void) {
  const end = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const epoch = useRef(0);
  const cancel = () => {
    epoch.current++;
    end.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (player.current) player.current.playbackRate = 1;
  };
  const update = () => {
    const video = player.current;
    if (!video) return;
    if (end.current !== null && video.currentTime >= end.current) {
      const boundary = end.current;
      cancel();
      video.pause();
      video.currentTime = boundary;
    }
    onTime(video.currentTime);
  };
  const preview = (start: number, stop: number, speed: number) => {
    const video = player.current;
    if (!video) return;
    cancel();
    const request = epoch.current;
    end.current = stop;
    video.currentTime = start;
    video.playbackRate = speed;
    onTime(start);
    const tick = () => {
      if (epoch.current !== request || player.current !== video) return;
      // Check the boundary every animation frame without rerendering the
      // entire Studio at that frequency. Normal playhead updates use media events.
      if (end.current !== null && video.currentTime >= end.current) update();
      if (end.current !== null) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    void video.play().catch(() => { if (epoch.current === request) cancel(); });
  };
  const seek = (seconds: number) => {
    cancel();
    const video = player.current;
    if (!video) return;
    video.pause();
    video.currentTime = seconds;
    onTime(seconds);
  };
  useEffect(() => {
    const video = player.current;
    return () => {
      epoch.current++;
      end.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (video) video.playbackRate = 1;
    };
  }, [sourceId, player]);
  return { preview, seek, update, cancel };
}
