export type DroppedFile = {
  file: File;
  relPath: string; // e.g. "subdir/audio.mp3" or "audio.mp3"
};

export type Pairing = {
  id: string;
  label: string;
  relDir: string; // empty for flat-mode root
  audio: File;
  truth: File;
};

const AUDIO_EXT = new Set([
  "mp3",
  "wav",
  "m4a",
  "flac",
  "ogg",
  "opus",
  "mp4",
  "webm",
  "aac",
]);
const TEXT_EXT = new Set(["txt", "md", "srt", "vtt"]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i + 1).toLowerCase();
}

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return name;
  return name.slice(0, i);
}

function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  if (i < 0) return "";
  return relPath.slice(0, i);
}

/** Walk a DataTransferItem entry tree → flat list of files with rel paths. */
export async function readDataTransfer(
  dt: DataTransfer,
): Promise<DroppedFile[]> {
  const out: DroppedFile[] = [];
  const items = Array.from(dt.items);
  const entries = items
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];

  if (entries.length > 0) {
    for (const entry of entries) {
      await walkEntry(entry, "", out);
    }
    return out;
  }
  // Fallback: plain file drop without webkitGetAsEntry support
  for (const f of Array.from(dt.files)) {
    out.push({ file: f, relPath: f.name });
  }
  return out;
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: DroppedFile[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    );
    out.push({ file, relPath: prefix ? `${prefix}/${entry.name}` : entry.name });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    let batch = await readEntries(reader);
    while (batch.length > 0) {
      for (const child of batch) {
        await walkEntry(child, prefix ? `${prefix}/${entry.name}` : entry.name, out);
      }
      batch = await readEntries(reader);
    }
  }
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/** Detect subfolder mode vs flat mode and produce pairings. */
export function buildPairings(files: DroppedFile[]): {
  pairings: Pairing[];
  unmatched: DroppedFile[];
  mode: "subfolder" | "flat";
} {
  // Group by relative directory
  const byDir = new Map<string, DroppedFile[]>();
  for (const f of files) {
    const dir = dirOf(f.relPath);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(f);
  }

  // Subfolder mode: at least one non-root directory contains exactly one audio + one text.
  const subfolderPairings: Pairing[] = [];
  const subfolderUsed = new Set<string>();
  let subfolderCandidate = false;
  for (const [dir, entries] of byDir.entries()) {
    if (dir === "") continue;
    const audios = entries.filter((e) => AUDIO_EXT.has(extOf(e.file.name)));
    const truths = entries.filter((e) => TEXT_EXT.has(extOf(e.file.name)));
    if (audios.length === 1 && truths.length === 1) {
      subfolderCandidate = true;
      const id = dir;
      subfolderPairings.push({
        id,
        label: dir.split("/").pop() || dir,
        relDir: dir,
        audio: audios[0].file,
        truth: truths[0].file,
      });
      subfolderUsed.add(audios[0].relPath);
      subfolderUsed.add(truths[0].relPath);
    }
  }
  if (subfolderCandidate && subfolderPairings.length > 0) {
    const unmatched = files.filter((f) => !subfolderUsed.has(f.relPath));
    return { pairings: subfolderPairings, unmatched, mode: "subfolder" };
  }

  // Flat mode: group by stem within the same directory
  const byStem = new Map<string, DroppedFile[]>();
  for (const f of files) {
    const key = `${dirOf(f.relPath)}::${stemOf(f.file.name)}`;
    if (!byStem.has(key)) byStem.set(key, []);
    byStem.get(key)!.push(f);
  }
  const flatPairings: Pairing[] = [];
  const flatUsed = new Set<string>();
  for (const [key, group] of byStem.entries()) {
    const audios = group.filter((e) => AUDIO_EXT.has(extOf(e.file.name)));
    const truths = group.filter((e) => TEXT_EXT.has(extOf(e.file.name)));
    if (audios.length === 1 && truths.length === 1) {
      flatPairings.push({
        id: key,
        label: stemOf(audios[0].file.name),
        relDir: dirOf(audios[0].relPath),
        audio: audios[0].file,
        truth: truths[0].file,
      });
      flatUsed.add(audios[0].relPath);
      flatUsed.add(truths[0].relPath);
    }
  }
  const unmatched = files.filter((f) => !flatUsed.has(f.relPath));
  return { pairings: flatPairings, unmatched, mode: "flat" };
}

/** Build a pairing from individual audio + truth file picks (single-pair UI). */
export function buildSinglePairing(audio: File, truth: File): Pairing {
  return {
    id: `${stemOf(audio.name)}-${Date.now()}`,
    label: stemOf(audio.name),
    relDir: "",
    audio,
    truth,
  };
}

export { AUDIO_EXT, TEXT_EXT, extOf, stemOf };
