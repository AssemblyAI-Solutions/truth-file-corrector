"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Check, Edit3, Volume2, X } from "lucide-react";
import clsx from "clsx";
import type {
  AlignResponse,
  Correction,
  CorrectionType,
  DiffItem,
  ErrorType,
} from "@/lib/alignment";
import styles from "@/app/page.module.scss";

const ERROR_BADGE: Record<
  ErrorType,
  { label: string; color: "amber" | "red" | "gray" }
> = {
  substitution: { label: "SUB", color: "amber" },
  insertion: { label: "INS", color: "red" },
  deletion: { label: "DEL", color: "gray" },
};

export function ComparisonPanel({
  alignment,
  corrections,
  whisperNormalize,
  ignoreDisfluencies,
  onToggleNormalize,
  onToggleDisfluencies,
  onCorrection,
  onResetCorrections,
  onSeek,
  activeItemId,
  onActiveItem,
}: {
  alignment: AlignResponse;
  corrections: Record<string, Correction | undefined>;
  whisperNormalize: boolean;
  ignoreDisfluencies: boolean;
  onToggleNormalize: (v: boolean) => void;
  onToggleDisfluencies: (v: boolean) => void;
  onCorrection: (itemId: string, corr: Correction | null) => void;
  onResetCorrections: () => void;
  onSeek: (ms: number) => void;
  activeItemId: string | null;
  onActiveItem: (id: string | null) => void;
}) {
  const items = alignment.items;
  const reviewed = items.filter((it) => corrections[it.id]).length;

  return (
    <Box className={styles.comparisonPanel} p="4">
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="3">
          <Flex justify="between" align="start" gap="3">
            <Box>
              <Text size="2" weight="medium" as="div">
                Whisper normalizer
              </Text>
              <Text size="1" color="gray">
                Normalizes case, expands contractions, and removes punctuation
              </Text>
            </Box>
            <Switch checked={whisperNormalize} onCheckedChange={onToggleNormalize} />
          </Flex>
          <Flex justify="between" align="start" gap="3">
            <Box>
              <Text size="2" weight="medium" as="div">
                Ignore disfluencies
              </Text>
              <Text size="1" color="gray">
                Ignores um, uh, ah, hm
              </Text>
            </Box>
            <Switch checked={ignoreDisfluencies} onCheckedChange={onToggleDisfluencies} />
          </Flex>
        </Flex>

        <Box style={{ borderTop: "1px solid var(--gray-a4)" }} />

        <Flex justify="between" align="center" gap="2">
          <Text size="3" weight="bold">
            Differences ({items.length})
          </Text>
          <Flex align="center" gap="2">
            <Text size="1" color="gray">
              {reviewed} reviewed
            </Text>
            {reviewed > 0 && (
              <Button
                variant="ghost"
                color="gray"
                size="1"
                onClick={onResetCorrections}
              >
                Reset
              </Button>
            )}
          </Flex>
        </Flex>

        <Flex direction="column" gap="2">
          {items.length === 0 && (
            <Box
              p="3"
              style={{
                border: "1px dashed var(--gray-a5)",
                borderRadius: "var(--radius-3)",
                textAlign: "center",
              }}
            >
              <Text size="2" color="gray">
                No differences detected.
              </Text>
            </Box>
          )}
          {items.map((item) => (
            <DiffItemRow
              key={item.id}
              item={item}
              isActive={activeItemId === item.id}
              correction={corrections[item.id]}
              onCorrection={onCorrection}
              onSeekPlay={(ms) => {
                onActiveItem(item.id);
                onSeek(ms);
              }}
              onClickRow={() => onActiveItem(item.id)}
            />
          ))}
        </Flex>
      </Flex>
    </Box>
  );
}

const DiffItemRow = memo(function DiffItemRow({
  item,
  isActive,
  correction,
  onCorrection,
  onSeekPlay,
  onClickRow,
}: {
  item: DiffItem;
  isActive: boolean;
  correction: Correction | undefined;
  onCorrection: (id: string, c: Correction | null) => void;
  onSeekPlay: (ms: number) => void;
  onClickRow: () => void;
}) {
  const [replacement, setReplacement] = useState(correction?.replacement ?? "");
  useEffect(() => {
    setReplacement(correction?.replacement ?? "");
  }, [correction?.replacement]);

  const isReviewed = correction !== undefined;
  const badge = ERROR_BADGE[item.error_type];

  const handleReview = useCallback(
    (type: CorrectionType) => {
      if (correction?.type === type) {
        onCorrection(item.id, null);
        return;
      }
      if (type === "neither") {
        onCorrection(item.id, {
          type,
          replacement: replacement || undefined,
        });
      } else {
        onCorrection(item.id, { type });
      }
    },
    [correction, item.id, onCorrection, replacement],
  );

  return (
    <Flex
      direction="column"
      gap="2"
      p="3"
      className={clsx(
        styles.diffItemRow,
        isActive && styles.diffItemRowActive,
        isReviewed && !isActive && styles.diffItemRowReviewed,
      )}
      onClick={onClickRow}
      role="button"
      tabIndex={0}
    >
      <Flex align="center" gap="2">
        <Badge variant="soft" color={badge.color} size="1">
          {badge.label}
        </Badge>
        <Box style={{ flexGrow: 1, minWidth: 0 }}>
          <WordPair item={item} />
        </Box>
        {item.timestamp_ms !== null && (
          <IconButton
            variant="ghost"
            color="gray"
            size="1"
            onClick={(e) => {
              e.stopPropagation();
              onSeekPlay(item.timestamp_ms ?? 0);
            }}
            title="Play this section"
          >
            <Volume2 size={14} />
          </IconButton>
        )}
      </Flex>

      <Flex align="center" gap="2" wrap="wrap">
        <Button
          variant={correction?.type === "asr-correct" ? "soft" : "outline"}
          color={correction?.type === "asr-correct" ? "green" : "gray"}
          size="1"
          onClick={(e) => {
            e.stopPropagation();
            handleReview("asr-correct");
          }}
        >
          <Check size={12} /> ASR Right
        </Button>
        <Button
          variant={correction?.type === "asr-wrong" ? "soft" : "outline"}
          color={correction?.type === "asr-wrong" ? "red" : "gray"}
          size="1"
          onClick={(e) => {
            e.stopPropagation();
            handleReview("asr-wrong");
          }}
        >
          <X size={12} /> ASR Wrong
        </Button>
        <Button
          variant={correction?.type === "neither" ? "soft" : "outline"}
          color="gray"
          size="1"
          onClick={(e) => {
            e.stopPropagation();
            handleReview("neither");
          }}
        >
          <Edit3 size={12} /> Neither
        </Button>
      </Flex>

      {correction?.type === "neither" && (
        <Flex gap="1" align="center" onClick={(e) => e.stopPropagation()}>
          <Box style={{ flexGrow: 1 }}>
            <TextField.Root
              size="1"
              placeholder="Correct word..."
              value={replacement}
              onChange={(e) => {
                const v = e.target.value;
                setReplacement(v);
                onCorrection(item.id, { type: "neither", replacement: v || undefined });
              }}
              className={styles.replacementInput}
            />
          </Box>
          <Button
            variant="outline"
            color="gray"
            size="1"
            onClick={() => {
              setReplacement("[inaudible]");
              onCorrection(item.id, {
                type: "neither",
                replacement: "[inaudible]",
              });
            }}
            title="Mark as inaudible"
          >
            [inaudible]
          </Button>
        </Flex>
      )}
    </Flex>
  );
});

function WordPair({ item }: { item: DiffItem }) {
  const gt =
    item.error_type === "insertion" ? (
      <span className={styles.wordMissing}>---</span>
    ) : (
      <span>{item.gt_word}</span>
    );
  const asr =
    item.error_type === "deletion" ? (
      <span className={styles.wordMissing}>---</span>
    ) : (
      <span>{item.asr_word}</span>
    );
  return (
    <Text as="span" size="1" className={styles.wordPair}>
      {gt}
      <Text as="span" color="gray">
        {" → "}
      </Text>
      {asr}
    </Text>
  );
}
