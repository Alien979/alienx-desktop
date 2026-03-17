export interface CollectedFile {
  file: File;
  relativePath?: string;
}

interface FileSystemEntryLike {
  isFile?: boolean;
  isDirectory?: boolean;
  name?: string;
  file?: (
    success: (file: File) => void,
    error?: (err?: unknown) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err?: unknown) => void,
    ) => void;
  };
}

function readEntriesBatch(
  reader: ReturnType<NonNullable<FileSystemEntryLike["createReader"]>>,
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => {
    reader.readEntries(resolve, () => resolve([]));
  });
}

async function readAllDirectoryEntries(
  reader: ReturnType<NonNullable<FileSystemEntryLike["createReader"]>>,
): Promise<FileSystemEntryLike[]> {
  const entries: FileSystemEntryLike[] = [];

  // readEntries can return partial results; keep reading until empty
  while (true) {
    const batch = await readEntriesBatch(reader);
    if (batch.length === 0) break;
    entries.push(...batch);
  }

  return entries;
}

function readFileEntry(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) {
      resolve(null);
      return;
    }

    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function walkEntry(
  entry: FileSystemEntryLike,
  parentPath: string,
  out: CollectedFile[],
): Promise<void> {
  const entryName = entry.name || "";

  if (entry.isFile) {
    const file = await readFileEntry(entry);
    if (!file) return;

    const relativePath = parentPath ? `${parentPath}/${file.name}` : file.name;

    out.push({ file, relativePath });
    return;
  }

  if (entry.isDirectory && entry.createReader) {
    const nextPath = parentPath ? `${parentPath}/${entryName}` : entryName;
    const reader = entry.createReader();
    const children = await readAllDirectoryEntries(reader);

    for (const child of children) {
      await walkEntry(child, nextPath, out);
    }
  }
}

export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<CollectedFile[]> {
  const items = Array.from(dataTransfer.items || []);
  const entryItems = items.filter(
    (item) =>
      item.kind === "file" &&
      typeof (item as any).webkitGetAsEntry === "function",
  );

  // Fallback path when drag source doesn't expose directory entries.
  if (entryItems.length === 0) {
    return Array.from(dataTransfer.files || []).map((file) => ({
      file,
      relativePath: (file as any).webkitRelativePath || file.name,
    }));
  }

  const collected: CollectedFile[] = [];
  for (const item of entryItems) {
    const entry = (item as any).webkitGetAsEntry?.() as
      | FileSystemEntryLike
      | null
      | undefined;

    if (!entry) {
      const file = item.getAsFile();
      if (file) {
        collected.push({ file, relativePath: file.name });
      }
      continue;
    }

    await walkEntry(entry, "", collected);
  }

  return collected;
}
