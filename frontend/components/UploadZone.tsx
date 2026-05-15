"use client";

import { forwardRef, useCallback, useRef, useState } from "react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { FileAudio, FileText, FolderUp, UploadCloud, X } from "lucide-react";
import clsx from "clsx";
import {
  buildPairings,
  buildSinglePairing,
  readDataTransfer,
  type Pairing,
} from "@/lib/pairing";
import { useApp } from "@/lib/store";
import { formatBytes } from "@/lib/utils";
import styles from "@/app/page.module.scss";

export function UploadZone() {
  const upsertPairings = useApp((s) => s.upsertPairings);
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState<{
    pairings: Pairing[];
    unmatched: { name: string; relPath: string }[];
    mode: "subfolder" | "flat";
  } | null>(null);
  const [singleAudio, setSingleAudio] = useState<File | null>(null);
  const [singleTruth, setSingleTruth] = useState<File | null>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const truthRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const dropped = await readDataTransfer(e.dataTransfer);
    const built = buildPairings(dropped);
    if (built.pairings.length === 0) {
      alert("No (audio, ground-truth) pairings found.");
      return;
    }
    setPending({
      pairings: built.pairings,
      unmatched: built.unmatched.map((u) => ({ name: u.file.name, relPath: u.relPath })),
      mode: built.mode,
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!pending) return;
    const items = await Promise.all(
      pending.pairings.map(async (p) => ({
        pairing: p,
        truthText: await p.truth.text(),
      })),
    );
    upsertPairings(items);
    setPending(null);
  }, [pending, upsertPairings]);

  const submitSingle = useCallback(async () => {
    if (!singleAudio || !singleTruth) return;
    const p = buildSinglePairing(singleAudio, singleTruth);
    upsertPairings([{ pairing: p, truthText: await singleTruth.text() }]);
    setSingleAudio(null);
    setSingleTruth(null);
    if (audioRef.current) audioRef.current.value = "";
    if (truthRef.current) truthRef.current.value = "";
  }, [singleAudio, singleTruth, upsertPairings]);

  return (
    <Flex direction="column" gap="3">
      <Box
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={clsx(styles.dropzone, drag && styles.dropzoneActive)}
        p="4"
        style={{ textAlign: "center" }}
      >
        <FolderUp size={20} style={{ margin: "0 auto", opacity: 0.7 }} />
        <Text as="div" size="2" weight="medium" mt="2">
          Drag a folder here
        </Text>
        <Text as="div" size="1" color="gray" mt="1">
          Subfolder-per-pair, or flat with matching basenames (audio ↔ .txt)
        </Text>
      </Box>

      <Flex direction="column" gap="2">
        <Text size="1" weight="medium" color="gray" className={styles.sectionLabel}>
          OR PICK A SINGLE PAIR
        </Text>
        <FilePickButton
          ref={truthRef}
          accept=".txt,.md,.srt,.vtt,text/plain"
          icon={<FileText size={14} />}
          file={singleTruth}
          placeholder="Choose ground truth (.txt)"
          onChange={setSingleTruth}
        />
        <FilePickButton
          ref={audioRef}
          accept="audio/*,video/*"
          icon={<FileAudio size={14} />}
          file={singleAudio}
          placeholder="Choose audio file"
          onChange={setSingleAudio}
          subtitle={singleAudio ? formatBytes(singleAudio.size) : undefined}
        />
        <Button
          size="2"
          disabled={!singleAudio || !singleTruth}
          onClick={submitSingle}
        >
          <UploadCloud size={14} /> Add this pair
        </Button>
      </Flex>

      {pending && (
        <PendingConfirm
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
          onRemove={(id) =>
            setPending((p) =>
              p ? { ...p, pairings: p.pairings.filter((x) => x.id !== id) } : p,
            )
          }
        />
      )}
    </Flex>
  );
}

type FilePickProps = {
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  placeholder: string;
  subtitle?: string;
  onChange: (f: File | null) => void;
};

const FilePickButton = forwardRef<HTMLInputElement, FilePickProps>(
  function FilePickButton(props, ref) {
    return (
      <label className={styles.fileCard} style={{ cursor: "pointer", padding: "8px 12px", display: "block" }}>
        <Flex align="center" gap="2">
          <Box className={styles.fileCardIcon} p="1" style={{ display: "flex" }}>
            {props.icon}
          </Box>
          <Box style={{ minWidth: 0, flex: 1 }}>
            <Text size="2" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {props.file ? props.file.name : props.placeholder}
            </Text>
            {props.subtitle && (
              <Text size="1" color="gray">
                {props.subtitle}
              </Text>
            )}
          </Box>
        </Flex>
        <input
          ref={ref}
          type="file"
          accept={props.accept}
          style={{ display: "none" }}
          onChange={(e) => props.onChange(e.target.files?.[0] ?? null)}
        />
      </label>
    );
  },
);

function PendingConfirm({
  pending,
  onCancel,
  onConfirm,
  onRemove,
}: {
  pending: {
    pairings: Pairing[];
    unmatched: { name: string; relPath: string }[];
    mode: "subfolder" | "flat";
  };
  onCancel: () => void;
  onConfirm: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Box
      position="fixed"
      top="0"
      left="0"
      width="100%"
      height="100%"
      style={{
        zIndex: 50,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <Box
        style={{
          background: "var(--color-background)",
          borderRadius: "var(--radius-4)",
          padding: 24,
          width: "100%",
          maxWidth: 640,
          boxShadow: "var(--shadow-5)",
        }}
      >
        <Flex direction="column" gap="3">
          <Flex justify="between" align="start">
            <Box>
              <Text size="4" weight="bold">
                {pending.pairings.length} pairing
                {pending.pairings.length === 1 ? "" : "s"} detected
              </Text>
              <Text as="div" size="1" color="gray" mt="1">
                Mode:{" "}
                <code>{pending.mode === "subfolder" ? "subfolder-per-pair" : "flat / basename match"}</code>
              </Text>
            </Box>
            <Button variant="ghost" color="gray" onClick={onCancel}>
              <X size={14} />
            </Button>
          </Flex>
          <Box style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--gray-a4)", borderRadius: "var(--radius-3)" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--gray-a2)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Label</th>
                  <th style={{ padding: "8px 12px" }}>Audio</th>
                  <th style={{ padding: "8px 12px" }}>Truth</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.pairings.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--gray-a3)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 500 }}>{p.label}</td>
                    <td style={{ padding: "8px 12px", color: "var(--gray-11)" }}>{p.audio.name}</td>
                    <td style={{ padding: "8px 12px", color: "var(--gray-11)" }}>{p.truth.name}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        size="1"
                        color="gray"
                        onClick={() => onRemove(p.id)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          {pending.unmatched.length > 0 && (
            <Box p="2" style={{ background: "var(--amber-a3)", borderRadius: "var(--radius-2)" }}>
              <Text size="1" weight="medium">
                {pending.unmatched.length} unmatched file
                {pending.unmatched.length === 1 ? "" : "s"} skipped
              </Text>
              <Box mt="1" style={{ maxHeight: 80, overflowY: "auto", fontFamily: "var(--font-jetbrains-mono)", fontSize: 11 }}>
                {pending.unmatched.map((u) => (
                  <div key={u.relPath}>{u.relPath}</div>
                ))}
              </Box>
            </Box>
          )}
          <Flex justify="end" gap="2">
            <Button variant="soft" color="gray" onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={pending.pairings.length === 0} onClick={onConfirm}>
              Use these pairings
            </Button>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
}
