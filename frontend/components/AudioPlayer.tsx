"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { Pause, Play, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { formatTime } from "@/lib/utils";
import styles from "@/app/page.module.scss";

export type AudioHandle = {
  seekMs: (ms: number) => void;
  playMs: (ms: number) => void;
};

export const AudioPlayer = forwardRef<
  AudioHandle,
  {
    file: File;
    label: string;
    onTimeMs: (ms: number) => void;
  }
>(function AudioPlayer({ file, label, onTimeMs }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [file]);

  useImperativeHandle(
    ref,
    () => ({
      seekMs: (ms: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = Math.max(0, ms / 1000);
      },
      playMs: (ms: number) => {
        const a = audioRef.current;
        if (!a) return;
        a.currentTime = Math.max(0, ms / 1000);
        void a.play();
      },
    }),
    [],
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      const ms = Math.floor((a.currentTime || 0) * 1000);
      setCurrentMs(ms);
      onTimeMs(ms);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    const onEnded = onPause;
    const onLoaded = () => setDuration(Math.floor((a.duration || 0) * 1000));
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("loadedmetadata", onLoaded);
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [onTimeMs]);

  const seek = (delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, a.currentTime + delta / 1000);
  };
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const pct = duration > 0 ? (currentMs / duration) * 100 : 0;

  return (
    <Box className={styles.audioPlayer} p="3">
      <audio ref={audioRef} src={url ?? undefined} preload="metadata" />
      <Flex align="center" gap="3">
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text
            size="2"
            weight="medium"
            color="indigo"
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </Text>
        </Box>
        <Flex align="center" gap="1">
          <IconButton variant="ghost" color="gray" onClick={() => seek(-10000)}>
            <RotateCcw size={16} />
          </IconButton>
          <IconButton onClick={toggle} size="2">
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </IconButton>
          <IconButton variant="ghost" color="gray" onClick={() => seek(10000)}>
            <RotateCw size={16} />
          </IconButton>
        </Flex>
        <Volume2 size={16} color="var(--gray-9)" />
      </Flex>
      <Flex align="center" gap="2" mt="3">
        <Text size="1" color="gray" style={{ minWidth: 38, fontVariantNumeric: "tabular-nums" }}>
          {formatTime(currentMs)}
        </Text>
        <Box
          style={{
            position: "relative",
            height: 6,
            flex: 1,
            background: "var(--gray-a4)",
            borderRadius: 999,
            cursor: "pointer",
          }}
          onClick={(e) => {
            const a = audioRef.current;
            if (!a) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            a.currentTime = Math.max(0, Math.min(a.duration || 0, ratio * (a.duration || 0)));
          }}
        >
          <Box
            style={{
              position: "absolute",
              inset: 0,
              right: "auto",
              width: `${pct}%`,
              background: "var(--accent-9)",
              borderRadius: 999,
            }}
          />
        </Box>
        <Text
          size="1"
          color="gray"
          style={{ minWidth: 38, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
        >
          {formatTime(duration)}
        </Text>
      </Flex>
    </Box>
  );
});
