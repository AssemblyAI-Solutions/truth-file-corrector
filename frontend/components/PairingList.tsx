"use client";

import { useCallback, useState } from "react";
import { Badge, Box, Flex, IconButton, Text } from "@radix-ui/themes";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useApp } from "@/lib/store";
import {
  buildPairings,
  readDataTransfer,
  type Pairing,
} from "@/lib/pairing";
import { formatBytes } from "@/lib/utils";
import { werColor } from "@/lib/alignment";
import styles from "@/app/page.module.scss";

export function PairingList() {
  const order = useApp((s) => s.pairingOrder);
  const pairings = useApp((s) => s.pairings);
  const activeId = useApp((s) => s.activeId);
  const setActive = useApp((s) => s.setActive);
  const removePairing = useApp((s) => s.removePairing);
  const upsertPairings = useApp((s) => s.upsertPairings);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const dropped = await readDataTransfer(e.dataTransfer);
      const built = buildPairings(dropped);
      if (built.pairings.length === 0) return;
      const items = await Promise.all(
        built.pairings.map(async (p: Pairing) => ({
          pairing: p,
          truthText: await p.truth.text(),
        })),
      );
      upsertPairings(items);
    },
    [upsertPairings],
  );

  if (order.length === 0) return null;

  return (
    <Box>
      <Flex justify="between" align="end" mb="1">
        <Text
          size="1"
          weight="medium"
          color="gray"
          className={styles.sectionLabel}
          style={{ textTransform: "uppercase" }}
        >
          Pairings ({order.length})
        </Text>
        <Text size="1" color="gray" style={{ opacity: 0.6 }}>
          drop more here
        </Text>
      </Flex>
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={clsx(styles.pairingsList, drag && styles.dropTarget)}
      >
        {order.map((id) => {
          const p = pairings[id];
          if (!p) return null;
          const isActive = id === activeId;
          const wer = p.alignment?.wer;
          const reviewable = p.alignment?.items.length ?? 0;
          const reviewed = Object.keys(p.corrections).length;
          return (
            <Flex
              key={id}
              align="center"
              gap="2"
              px="2"
              py="2"
              className={clsx(styles.pairingRow, isActive && styles.pairingRowActive)}
              onClick={() => setActive(id)}
              title={p.pairing.audio.name}
            >
              <StatusIcon status={p.status} />
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Text
                  size="2"
                  weight="medium"
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isActive ? "var(--accent-11)" : undefined,
                  }}
                >
                  {p.pairing.label}
                </Text>
                <Flex align="center" gap="2">
                  <Text size="1" color="gray">
                    {formatBytes(p.pairing.audio.size)}
                  </Text>
                  {reviewable > 0 && (
                    <Text size="1" color="gray">
                      · {reviewed}/{reviewable} reviewed
                    </Text>
                  )}
                </Flex>
              </Box>
              {typeof wer === "number" && (
                <Badge
                  variant="soft"
                  color={
                    werColor(wer) === "green"
                      ? "green"
                      : werColor(wer) === "yellow"
                        ? "amber"
                        : "red"
                  }
                  size="1"
                >
                  {(wer * 100).toFixed(1)}%
                </Badge>
              )}
              <IconButton
                variant="ghost"
                color="gray"
                size="1"
                onClick={(e) => {
                  e.stopPropagation();
                  removePairing(id);
                }}
                className={styles.pairingRemoveButton}
                title="Remove pairing"
              >
                <X size={13} />
              </IconButton>
            </Flex>
          );
        })}
      </Box>
    </Box>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "transcribing" || status === "aligning")
    return <Loader2 size={14} className="animate-spin" />;
  if (status === "ready")
    return <CheckCircle2 size={14} color="var(--green-9)" />;
  if (status === "error") return <AlertCircle size={14} color="var(--red-9)" />;
  return <Circle size={14} color="var(--gray-9)" />;
}
