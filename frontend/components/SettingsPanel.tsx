"use client";

import { Box, Flex, Heading, Select, Switch, Text, TextArea } from "@radix-ui/themes";
import { useApp, useActivePairing } from "@/lib/store";
import { LANGUAGES, PROMPT_SUGGESTIONS } from "@/lib/promptSuggestions";
import { formatBytes } from "@/lib/utils";
import { PairingList } from "./PairingList";
import { UploadZone } from "./UploadZone";
import styles from "@/app/page.module.scss";

export function SettingsPanel() {
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const order = useApp((s) => s.pairingOrder);
  const active = useActivePairing();
  const multi = order.length > 1;
  const single = order.length === 1 && !!active;
  const empty = order.length === 0;

  const appendPrompt = (text: string) => {
    const cur = settings.prompt.trim();
    setSettings({ prompt: cur ? `${cur}\n${text}` : text });
  };

  return (
    <Box p="4" className={styles.settingsSidebar}>
      <Flex direction="column" gap="4">
        {multi && <PairingList />}

        <Section label="MODEL">
          <Box className={styles.modelLabel} p="2">
            <Text size="2">Universal-3 Pro (pre-recorded)</Text>
          </Box>
        </Section>

        {single && active && (
          <>
            <Section label="GROUND TRUTH">
              <Box className={styles.fileCard} p="2">
                <Text size="2" style={{ overflowWrap: "anywhere" }}>
                  {active.pairing.truth.name}
                </Text>
              </Box>
            </Section>
            <Section label="AUDIO SOURCE">
              <Box className={styles.fileCard} p="2">
                <Text size="2" style={{ overflowWrap: "anywhere" }}>
                  {active.pairing.audio.name}
                </Text>
                <Text as="div" size="1" color="gray">
                  {formatBytes(active.pairing.audio.size)}
                </Text>
              </Box>
            </Section>
          </>
        )}

        {empty && (
          <Section label="GROUND TRUTH & AUDIO">
            <UploadZone />
          </Section>
        )}

        <Section label="LANGUAGE">
          <Select.Root
            value={settings.language}
            onValueChange={(v) => setSettings({ language: v })}
          >
            <Select.Trigger style={{ width: "100%" }} />
            <Select.Content>
              {LANGUAGES.map((l) => (
                <Select.Item key={l.value} value={l.value}>
                  {l.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Section>

        <Section label="TRANSCRIPTION">
          <Flex direction="column" gap="3">
            <Flex justify="between" align="center">
              <Text size="2">Medical mode</Text>
              <Switch
                checked={settings.medicalMode}
                onCheckedChange={(v) => setSettings({ medicalMode: v })}
              />
            </Flex>
            <Box>
              <Text as="div" size="1" color="gray" mb="1">
                Prompt (optional)
              </Text>
              <TextArea
                value={settings.prompt}
                onChange={(e) => setSettings({ prompt: e.target.value })}
                placeholder="Add a prompt to instruct Universal-3-Pro how to transcribe"
                rows={4}
                style={{ width: "100%", resize: "vertical" }}
              />
            </Box>
          </Flex>
        </Section>

        <Section label="SUGGESTIONS">
          <Flex wrap="wrap" gap="1">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => appendPrompt(s.value)}
                className={styles.suggestionChip}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </Flex>
        </Section>

        {!empty && (
          <Section label="ADD MORE PAIRINGS">
            <UploadZone />
          </Section>
        )}
      </Flex>
    </Box>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text
        as="div"
        size="1"
        weight="medium"
        color="gray"
        className={styles.sectionLabel}
        mb="1"
        style={{ textTransform: "uppercase" }}
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}
