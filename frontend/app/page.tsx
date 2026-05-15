"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Spinner,
  Text,
} from "@radix-ui/themes";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  RotateCcw,
} from "lucide-react";
import { SettingsPanel } from "@/components/SettingsPanel";
import { AudioPlayer, type AudioHandle } from "@/components/AudioPlayer";
import { TranscriptView } from "@/components/TranscriptView";
import { ComparisonPanel } from "@/components/ComparisonPanel";
import { SettingsButton } from "@/components/SettingsButton";
import { UploadZone } from "@/components/UploadZone";
import {
  useActivePairing,
  useApp,
  type PairingState,
} from "@/lib/store";
import { align, transcribe } from "@/lib/api";
import { downloadCorrectedBulk } from "@/lib/download";
import styles from "./page.module.scss";

export default function Page() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const setPairingStatus = useApp((s) => s.setPairingStatus);
  const setCorrection = useApp((s) => s.setCorrection);
  const resetCorrections = useApp((s) => s.resetCorrections);
  const setView = useApp((s) => s.setView);
  const resetActive = useApp((s) => s.resetActive);
  const order = useApp((s) => s.pairingOrder);
  const pairings = useApp((s) => s.pairings);
  const setActive = useApp((s) => s.setActive);
  const activeId = useApp((s) => s.activeId);
  const active = useActivePairing();

  const audioRef = useRef<AudioHandle>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const realignTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compareOne = useCallback(
    async (target: PairingState) => {
      const id = target.pairing.id;
      setPairingStatus(id, { status: "transcribing", errorMsg: undefined });
      const t = await transcribe({
        apiKey: settings.apiKey,
        audio: target.pairing.audio,
        model: "universal-3-pro",
        language: settings.language,
        prompt: settings.prompt,
        medical: settings.medicalMode,
      });
      setPairingStatus(id, { transcription: t, status: "aligning" });
      const a = await align({
        groundTruth: target.truthText,
        asrText: t.text,
        asrWords: t.words,
        whisperNormalize: settings.whisperNormalize,
        ignoreDisfluencies: settings.ignoreDisfluencies,
      });
      setPairingStatus(id, { alignment: a, status: "ready" });
    },
    [settings, setPairingStatus],
  );

  const runCompare = useCallback(async () => {
    if (!active) return;
    if (!settings.apiKey) {
      alert("Set your AssemblyAI API key first (top-right).");
      return;
    }
    setBusy(true);
    try {
      await compareOne(active);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPairingStatus(active.pairing.id, { status: "error", errorMsg: msg });
      alert(`Compare failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [active, settings.apiKey, compareOne, setPairingStatus]);

  const runCompareAll = useCallback(async () => {
    if (!settings.apiKey) {
      alert("Set your AssemblyAI API key first (top-right).");
      return;
    }
    setBusy(true);
    try {
      for (const id of order) {
        const p = pairings[id];
        if (!p || p.alignment) continue;
        try {
          await compareOne(p);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setPairingStatus(p.pairing.id, { status: "error", errorMsg: msg });
        }
      }
    } finally {
      setBusy(false);
    }
  }, [settings.apiKey, order, pairings, compareOne, setPairingStatus]);

  const realign = useCallback(
    async (
      target: PairingState,
      opts: { whisperNormalize: boolean; ignoreDisfluencies: boolean },
    ) => {
      if (!target.transcription) return;
      if (realignTimer.current) clearTimeout(realignTimer.current);
      realignTimer.current = setTimeout(async () => {
        try {
          const a = await align({
            groundTruth: target.truthText,
            asrText: target.transcription!.text,
            asrWords: target.transcription!.words,
            whisperNormalize: opts.whisperNormalize,
            ignoreDisfluencies: opts.ignoreDisfluencies,
          });
          setPairingStatus(target.pairing.id, { alignment: a });
        } catch (err) {
          console.error("Realign failed:", err);
        }
      }, 200);
    },
    [setPairingStatus],
  );

  const handleToggleNormalize = useCallback(
    (v: boolean) => {
      setSettings({ whisperNormalize: v });
      if (active?.alignment) {
        void realign(active, {
          whisperNormalize: v,
          ignoreDisfluencies: settings.ignoreDisfluencies,
        });
      }
    },
    [active, settings.ignoreDisfluencies, setSettings, realign],
  );

  const handleToggleDisfluencies = useCallback(
    (v: boolean) => {
      setSettings({ ignoreDisfluencies: v });
      if (active?.alignment) {
        void realign(active, {
          whisperNormalize: settings.whisperNormalize,
          ignoreDisfluencies: v,
        });
      }
    },
    [active, settings.whisperNormalize, setSettings, realign],
  );

  // Reset diff hover state when switching pairings.
  useEffect(() => {
    setActiveItemId(null);
    setCurrentMs(0);
  }, [activeId]);

  const bulkRows = useMemo(
    () =>
      order
        .map((id) => pairings[id])
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          pairing: p.pairing,
          alignment: p.alignment,
          corrections: p.corrections,
          truthText: p.truthText,
        })),
    [order, pairings],
  );
  const canBulkExport = bulkRows.some((r) => r.alignment);
  const pendingCount = useMemo(
    () => order.filter((id) => pairings[id] && !pairings[id].alignment).length,
    [order, pairings],
  );

  const activeIndex = activeId ? order.indexOf(activeId) : -1;
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < order.length - 1;

  return (
    <Flex direction="column" className={styles.page}>
      {/* Header */}
      <Flex
        justify="between"
        align="center"
        gap="3"
        px="5"
        py="3"
        className={styles.header}
      >
        <Flex align="center" gap="3">
          {order.length > 1 && (
            <Flex align="center" gap="1">
              <IconButton
                variant="ghost"
                color="gray"
                disabled={!canPrev}
                onClick={() => {
                  const i = order.indexOf(activeId!);
                  if (i > 0) setActive(order[i - 1]);
                }}
                title="Previous pairing"
              >
                <ChevronLeft size={16} />
              </IconButton>
              <Text size="2" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                {activeIndex + 1} / {order.length}
              </Text>
              <IconButton
                variant="ghost"
                color="gray"
                disabled={!canNext}
                onClick={() => {
                  const i = order.indexOf(activeId!);
                  if (i < order.length - 1) setActive(order[i + 1]);
                }}
                title="Next pairing"
              >
                <ChevronRight size={16} />
              </IconButton>
            </Flex>
          )}
          <Heading size="6" className={styles.sidebarTitle}>
            Truth File Corrector
          </Heading>
          <Text size="2" color="gray">
            Compare pre-recorded transcription against ground truth
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <SettingsButton />
          {canBulkExport && (
            <Button
              variant="outline"
              color="gray"
              onClick={() => downloadCorrectedBulk(bulkRows)}
              title={
                order.length > 1
                  ? "Download a ZIP of all corrected ground-truth files"
                  : "Download the corrected ground-truth file"
              }
            >
              <Archive size={14} />
              {order.length > 1 ? `Download all (${order.length})` : "Download corrected"}
            </Button>
          )}
          {order.length > 1 && pendingCount > 0 && (
            <Button
              variant="outline"
              color="gray"
              onClick={runCompareAll}
              disabled={busy}
            >
              <ListChecks size={14} /> Compare all ({pendingCount})
            </Button>
          )}
          {active?.alignment && (
            <Button variant="outline" color="gray" onClick={resetActive}>
              <RotateCcw size={14} /> Restart
            </Button>
          )}
          <Button
            onClick={runCompare}
            disabled={!active || busy || active?.status === "transcribing"}
            className={styles.compareButton}
          >
            {active?.status === "transcribing"
              ? "Transcribing…"
              : active?.status === "aligning"
                ? "Aligning…"
                : "Compare Transcriptions"}
          </Button>
        </Flex>
      </Flex>

      {/* Body */}
      <Flex className={styles.contentWrapper}>
        {settings.settingsCollapsed ? (
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setSettings({ settingsCollapsed: false })}
            title="Expand settings"
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <Box style={{ position: "relative" }}>
            <SettingsPanel />
            <button
              type="button"
              onClick={() => setSettings({ settingsCollapsed: true })}
              title="Collapse settings"
              style={{
                position: "absolute",
                right: -10,
                top: 12,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1px solid var(--gray-a4)",
                background: "var(--color-background)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ChevronLeft size={12} />
            </button>
          </Box>
        )}

        {/* Main content */}
        <Box className={styles.mainContent} p="4">
          {!active && (
            <Flex
              align="center"
              justify="center"
              style={{ minHeight: "60vh" }}
            >
              <Box style={{ maxWidth: 480, width: "100%" }}>
                <Heading size="4" align="center" mb="2">
                  Get started
                </Heading>
                <Text as="div" size="2" color="gray" align="center" mb="4">
                  Drop a folder of audio + .txt pairs, or pick a single pair below.
                </Text>
                <UploadZone />
              </Box>
            </Flex>
          )}

          {active && !active.alignment && (
            <Flex
              direction="column"
              align="center"
              justify="center"
              gap="2"
              style={{ minHeight: "60vh" }}
            >
              {active.status === "transcribing" || active.status === "aligning" ? (
                <>
                  <Spinner size="3" />
                  <Text size="3" weight="medium">
                    {active.status === "transcribing" ? "Transcribing…" : "Aligning…"}
                  </Text>
                </>
              ) : (
                <>
                  <Heading size="5" color="gray">
                    No results yet
                  </Heading>
                  <Text size="2" color="gray">
                    Upload audio and ground truth, then click &quot;Compare Transcriptions&quot;
                  </Text>
                </>
              )}
              {active.errorMsg && (
                <Box mt="2" p="2" style={{ background: "var(--red-a3)", borderRadius: "var(--radius-2)" }}>
                  <Text size="1" color="red">
                    {active.errorMsg}
                  </Text>
                </Box>
              )}
            </Flex>
          )}

          {active?.alignment && (
            <Flex direction="column" gap="3">
              <AudioPlayer
                file={active.pairing.audio}
                label={active.pairing.audio.name}
                onTimeMs={setCurrentMs}
                ref={audioRef}
              />
              <TranscriptView
                label={active.pairing.label}
                alignment={active.alignment}
                corrections={active.corrections}
                currentMs={currentMs}
                hoveredItemId={activeItemId}
                onHoverItem={setActiveItemId}
                view={active.view}
                onViewChange={(v) => setView(active.pairing.id, v)}
                onWordClickMs={(ms) => audioRef.current?.seekMs(ms)}
              />
            </Flex>
          )}
        </Box>

        {active?.alignment && (
          <ComparisonPanel
            alignment={active.alignment}
            corrections={active.corrections}
            whisperNormalize={settings.whisperNormalize}
            ignoreDisfluencies={settings.ignoreDisfluencies}
            onToggleNormalize={handleToggleNormalize}
            onToggleDisfluencies={handleToggleDisfluencies}
            onCorrection={(itemId, c) =>
              setCorrection(active.pairing.id, itemId, c)
            }
            onResetCorrections={() => resetCorrections(active.pairing.id)}
            onSeek={(ms) => audioRef.current?.playMs(ms)}
            activeItemId={activeItemId}
            onActiveItem={setActiveItemId}
          />
        )}
      </Flex>
    </Flex>
  );
}
