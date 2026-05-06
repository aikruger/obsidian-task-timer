import { App, TFile } from "obsidian";
import { TaskTimerRecord } from "../types/models";
import { tlog, twarn, terr } from "../utils/debug-logger";

export class InlineMarkerRemover {
  constructor(private app: App) {}

  /**
   * Remove the inline ⏱ marker (and optionally the block ID)
   * from the original task line in the markdown file.
   *
   * Call this BEFORE removing the record from the data store,
   * so the anchor data is still available.
   */
  async removeMarkerFromFile(
    timer: TaskTimerRecord,
    options: { removeBlockId: boolean } = { removeBlockId: false }
  ): Promise<boolean> {
    const { filePath, blockId, line } = timer.anchor;

    tlog("markerRemover", `Starting removal`, {
      timerId: timer.id,
      filePath,
      blockId,
      line,
      removeBlockId: options.removeBlockId
    });

    // 1. Resolve the file
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      terr("markerRemover", `File not found in vault: "${filePath}"`, { timerId: timer.id });
      return false;
    }

    // 2. Read current content
    let content: string;
    try {
      content = await this.app.vault.read(file);
    } catch (e) {
      terr("markerRemover", `Failed to read file: "${filePath}"`, e);
      return false;
    }

    const lines = content.split("\n");
    tlog("markerRemover", `File read. Total lines: ${lines.length}`);

    // 3. Find the correct line (prefer blockId, fall back to line number)
    let targetLineIndex = -1;

    if (blockId) {
      const rawId = blockId.replace(/^\^/, "");
      // Search all lines for the blockId — safer than trusting stored line number
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] && (lines[i]!.includes(`^${rawId}`) || lines[i]!.includes(rawId))) {
          tlog("markerRemover", `Found blockId "${rawId}" at line ${i}`, {
            lineContent: lines[i]?.slice(0, 120)
          });
          targetLineIndex = i;
          break;
        }
      }
      if (targetLineIndex === -1) {
        twarn("markerRemover", `BlockId "${rawId}" not found in file. Falling back to stored line number ${line}`);
      }
    }

    // Fallback: use stored line number
    if (targetLineIndex === -1) {
      if (line >= 0 && line < lines.length) {
        targetLineIndex = line;
        tlog("markerRemover", `Using stored line number fallback: ${line}`, {
          lineContent: lines[line]?.slice(0, 120)
        });
      } else {
        terr("markerRemover", `Stored line number ${line} is out of range (file has ${lines.length} lines)`);
        return false;
      }
    }

    // 4. Remove the marker from the target line
    const originalLine = lines[targetLineIndex];
    if (originalLine === undefined) return false;
    tlog("markerRemover", `Target line before edit:`, originalLine);

    let editedLine = originalLine;

    // Remove the ⏱ marker (with optional surrounding whitespace)
    editedLine = editedLine.replace(/\s*⏱\s*/g, " ").trimEnd();
    tlog("markerRemover", `After ⏱ removal:`, editedLine);

    // Optionally remove the block ID anchor
    if (options.removeBlockId && blockId) {
      const rawId = blockId.replace(/^\^/, "");
      // Match both ^rawId and rawId variants, with surrounding whitespace
      const blockIdPattern = new RegExp(`\\s*\\^${escapeRegex(rawId)}\\s*`, "g");
      editedLine = editedLine.replace(blockIdPattern, "").trimEnd();
      tlog("markerRemover", `After blockId removal:`, editedLine);
    }

    if (editedLine === originalLine) {
      twarn("markerRemover", `Line was not changed — marker may already be gone or pattern did not match`, {
        line: originalLine
      });
      // Still return true — the file doesn't need saving, but this isn't a hard error
      return true;
    }

    // 5. Rebuild and write
    lines[targetLineIndex] = editedLine;
    const newContent = lines.join("\n");

    try {
      await this.app.vault.modify(file, newContent);
      tlog("markerRemover", `✅ File saved. Line ${targetLineIndex} updated`, {
        before: originalLine,
        after: editedLine
      });
      return true;
    } catch (e) {
      terr("markerRemover", `Failed to write file after marker removal`, e);
      return false;
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
