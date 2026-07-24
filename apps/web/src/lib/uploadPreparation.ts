import { isSupportedUploadFileName, UNSUPPORTED_UPLOAD_MESSAGE } from "./uploadPolicy";

export interface PreparedUploadFiles {
  files: File[];
  rejected: Array<{ name: string; reason: string }>;
}

export interface DroppedUploadFiles extends PreparedUploadFiles {
  suggestedCaseName: string;
}

export async function prepareUploadFiles(inputFiles: File[]): Promise<PreparedUploadFiles> {
  const prepared: File[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  for (const file of inputFiles) {
    if (isSupportedUploadFileName(file.name)) {
      prepared.push(file);
    } else {
      rejected.push({ name: file.name, reason: UNSUPPORTED_UPLOAD_MESSAGE });
    }
  }
  return { files: prepared, rejected };
}

async function traverseEntry(entry: FileSystemEntry, files: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    files.push(file);
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await traverseEntry(child, files);
  }
}

function nameWithoutExtension(name: string) {
  return name.replace(/\.(pdf|txt)$/i, "").trim() || "Ny sak";
}

export async function prepareDroppedUpload(dataTransfer: DataTransfer): Promise<DroppedUploadFiles> {
  const entries = Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  const files: File[] = [];
  if (entries.length > 0) {
    for (const entry of entries) await traverseEntry(entry, files);
  } else {
    files.push(...Array.from(dataTransfer.files ?? []));
  }
  const suggestedCaseName = entries.length === 1 && entries[0].isDirectory
    ? entries[0].name
    : files.length > 0
      ? nameWithoutExtension(files[0].webkitRelativePath?.split("/")[0] || files[0].name)
      : "Ny sak";
  return { ...(await prepareUploadFiles(files)), suggestedCaseName };
}

export function suggestedCaseNameForFiles(files: File[]) {
  if (files.length === 0) return "Ny sak";
  const relativeRoot = files[0].webkitRelativePath?.split("/")[0];
  return nameWithoutExtension(relativeRoot || files[0].name);
}
