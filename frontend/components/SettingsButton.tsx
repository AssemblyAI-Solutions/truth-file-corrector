"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  Flex,
  IconButton,
  TextField,
} from "@radix-ui/themes";
import { Key, X } from "lucide-react";
import { useApp } from "@/lib/store";

export function SettingsButton() {
  const apiKey = useApp((s) => s.settings.apiKey);
  const setSettings = useApp((s) => s.setSettings);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(apiKey);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setDraft(apiKey);
      }}
    >
      <Dialog.Trigger>
        <Button variant="outline" color="gray">
          <Key size={14} />
          {apiKey ? "API key set" : "Set API key"}
        </Button>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 440 }}>
        <Flex justify="between" align="start" mb="2">
          <Dialog.Title>AssemblyAI API key</Dialog.Title>
          <Dialog.Close>
            <IconButton variant="ghost" color="gray" size="1">
              <X size={14} />
            </IconButton>
          </Dialog.Close>
        </Flex>
        <Dialog.Description size="2" color="gray" mb="3">
          Stored in your browser&apos;s localStorage. Sent only with transcribe
          requests as the <code>x-aai-key</code> header.
        </Dialog.Description>
        <TextField.Root
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="..."
          autoFocus
        />
        <Flex justify="end" gap="2" mt="3">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Dialog.Close>
            <Button onClick={() => setSettings({ apiKey: draft.trim() })}>Save</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export default SettingsButton;
