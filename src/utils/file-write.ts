import { App, TFile } from "obsidian";

export async function writeLineToFile(
  file: TFile,
  lineNo: number,
  newLine: string,
  app: App
): Promise<void> {
  console.log(`[ttimer] writeLineToFile: file=${file.path} lineNo=${lineNo} newLine="${newLine}"`);

  const content = await app.vault.read(file);
  const lines = content.split("\n");

  if (lineNo >= lines.length) {
    console.error(`[ttimer] writeLineToFile: lineNo=${lineNo} out of bounds (total lines=${lines.length})`);
    return;
  }

  lines[lineNo] = newLine;
  const newContent = lines.join("\n");
  await app.vault.modify(file, newContent);
  console.log(`[ttimer] writeLineToFile: file written successfully`);
}