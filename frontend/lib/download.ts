import JSZip from "jszip";
import type { Pairing } from "./pairing";
import type { AlignResponse, Correction } from "./alignment";
import { applyCorrections } from "./alignment";

export function downloadCorrectedTruth(label: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label}.corrected.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type BulkPairing = {
  pairing: Pairing;
  alignment?: AlignResponse;
  corrections: Record<string, Correction | undefined>;
  truthText: string;
};

export async function downloadCorrectedBulk(rows: BulkPairing[]): Promise<void> {
  const zip = new JSZip();
  for (const row of rows) {
    let text = row.truthText;
    if (row.alignment) {
      text = applyCorrections(
        row.alignment.gt_tokens,
        row.alignment.asr_tokens,
        row.alignment.ops,
        row.corrections,
      );
    }
    const path = row.pairing.relDir
      ? `${row.pairing.relDir}/${row.pairing.label}.corrected.txt`
      : `${row.pairing.label}.corrected.txt`;
    zip.file(path, text);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corrected-ground-truth.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
