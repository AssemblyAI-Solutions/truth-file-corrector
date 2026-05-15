"use client";

import { useMemo } from "react";
import {
  Badge,
  Box,
  Flex,
  Heading,
  IconButton,
  SegmentedControl,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { Copy, Download } from "lucide-react";
import clsx from "clsx";
import {
  applyCorrections,
  findPlayingAsrIndex,
  indexOps,
  liveWer,
  werColor,
  type AlignResponse,
  type Correction,
} from "@/lib/alignment";
import { downloadCorrectedTruth } from "@/lib/download";
import styles from "@/app/page.module.scss";

export function TranscriptView({
  label,
  alignment,
  corrections,
  currentMs,
  hoveredItemId,
  onHoverItem,
  view,
  onViewChange,
  onWordClickMs,
}: {
  label: string;
  alignment: AlignResponse;
  corrections: Record<string, Correction | undefined>;
  currentMs: number;
  hoveredItemId: string | null;
  onHoverItem: (id: string | null) => void;
  view: "original" | "corrected";
  onViewChange: (v: "original" | "corrected") => void;
  onWordClickMs: (ms: number) => void;
}) {
  const opIdx = useMemo(() => indexOps(alignment.ops), [alignment.ops]);
  const playingIdx = useMemo(
    () => findPlayingAsrIndex(alignment.asr_tokens, currentMs),
    [alignment.asr_tokens, currentMs],
  );
  const correctedText = useMemo(
    () =>
      applyCorrections(
        alignment.gt_tokens,
        alignment.asr_tokens,
        alignment.ops,
        corrections,
      ),
    [alignment, corrections],
  );
  const correctedTokens = useMemo(
    () => correctedText.split(/\s+/).filter(Boolean),
    [correctedText],
  );
  const correctedSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of correctedTokens) s.add(t.toLowerCase());
    return s;
  }, [correctedTokens]);

  const live = useMemo(
    () => liveWer(alignment.metrics, alignment.items, corrections),
    [alignment, corrections],
  );

  const werColorName = werColor(live.wer);
  const badgeColor: "green" | "amber" | "red" =
    werColorName === "green" ? "green" : werColorName === "yellow" ? "amber" : "red";

  return (
    <Flex gap="3" style={{ minHeight: 0 }}>
      {/* Ground Truth */}
      <Box className={styles.transcriptPanel}>
        <Flex
          justify="between"
          align="center"
          gap="2"
          px="4"
          py="3"
          className={styles.transcriptPanelHeader}
        >
          <Box>
            <Heading size="3">Ground Truth</Heading>
            <Text size="1" color="gray">
              {alignment.gt_tokens.length} words
            </Text>
          </Box>
          <Flex align="center" gap="2">
            <Tooltip content="Copy">
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                onClick={() =>
                  navigator.clipboard.writeText(
                    view === "corrected"
                      ? correctedText
                      : alignment.gt_tokens.map((t) => t.text).join(" "),
                  )
                }
              >
                <Copy size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip content="Download corrected truth">
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => downloadCorrectedTruth(label, correctedText)}
              >
                <Download size={14} />
              </IconButton>
            </Tooltip>
            <SegmentedControl.Root
              value={view}
              onValueChange={(v) => onViewChange(v as "original" | "corrected")}
              size="1"
              className={styles.segmentedControlBlue}
            >
              <SegmentedControl.Item value="original">Original</SegmentedControl.Item>
              <SegmentedControl.Item value="corrected">Corrected</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        </Flex>
        <Box p="4" className={styles.transcriptText} style={{ overflowY: "auto", maxHeight: "70vh" }}>
          {view === "corrected" ? (
            <Text size="3" as="p" style={{ lineHeight: 1.8 }}>
              {correctedTokens.map((w, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  <span className={styles.wordMatch}>{w}</span>
                </span>
              ))}
            </Text>
          ) : (
            <Text size="3" as="p" style={{ lineHeight: 1.8 }}>
              {alignment.gt_tokens.map((t, i) => {
                const type = opIdx.gtOpType.get(i);
                const itemId = opIdx.gtItemId.get(i) ?? null;
                const hovered = itemId && itemId === hoveredItemId;
                let cls: string | undefined;
                if (type === "delete") cls = styles.wordDeletion;
                else if (type === "substitute") cls = styles.wordSubstitution;
                else cls = styles.wordMatch;
                return (
                  <span key={i}>
                    {i > 0 && " "}
                    <span
                      className={clsx(cls, hovered && styles.wordHighlighted)}
                      onMouseEnter={() => itemId && onHoverItem(itemId)}
                      onMouseLeave={() => onHoverItem(null)}
                    >
                      {t.text}
                    </span>
                  </span>
                );
              })}
            </Text>
          )}
        </Box>
      </Box>

      {/* ASR */}
      <Box className={styles.transcriptPanel}>
        <Flex
          justify="between"
          align="center"
          gap="2"
          px="4"
          py="3"
          className={styles.transcriptPanelHeader}
        >
          <Box>
            <Heading size="3">Universal-3 Pro</Heading>
            <Text size="1" color="gray">
              {alignment.asr_tokens.length} words
            </Text>
          </Box>
          <Badge variant="soft" color={badgeColor} size="2" className={styles.werBadge}>
            WER: {(live.wer * 100).toFixed(1)}%
          </Badge>
        </Flex>
        <Box p="4" className={styles.transcriptText} style={{ overflowY: "auto", maxHeight: "70vh" }}>
          <Text size="3" as="p" style={{ lineHeight: 1.8 }}>
            {alignment.asr_tokens.map((t, i) => {
              const type = opIdx.asrOpType.get(i);
              const itemId = opIdx.asrItemId.get(i) ?? null;
              const corrected =
                itemId && corrections[itemId]?.type === "asr-correct";
              const hovered = itemId && itemId === hoveredItemId;
              const playing = i === playingIdx;
              let cls: string | undefined;
              if (corrected) cls = styles.wordCorrected;
              else if (type === "insert") cls = styles.wordInsertion;
              else if (type === "substitute") cls = styles.wordSubstitution;
              else cls = styles.wordMatch;
              const isDiff = type === "insert" || type === "substitute";
              const activeCls = playing
                ? isDiff && !corrected
                  ? styles.wordActiveDiff
                  : styles.wordActive
                : undefined;
              return (
                <span key={i}>
                  {i > 0 && " "}
                  <span
                    className={clsx(
                      cls,
                      activeCls,
                      hovered && styles.wordHighlighted,
                      typeof t.start === "number" && styles.clickableWord,
                    )}
                    onClick={() => {
                      if (typeof t.start === "number") onWordClickMs(t.start);
                    }}
                    onMouseEnter={() => itemId && onHoverItem(itemId)}
                    onMouseLeave={() => onHoverItem(null)}
                  >
                    {t.text}
                  </span>
                </span>
              );
            })}
          </Text>
          {view === "corrected" && correctedSet.size > 0 && null /* placeholder */}
        </Box>
      </Box>
    </Flex>
  );
}
