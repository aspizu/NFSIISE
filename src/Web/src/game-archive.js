import { Unzip, UnzipInflate } from 'fflate';

const MAX_FILES = 5000;
const MAX_UNCOMPRESSED_BYTES = 800 * 1024 * 1024;

function toVirtualPath(archivePath) {
  const parts = archivePath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0')))
    throw new Error(`Unsafe path in ZIP: ${archivePath}`);

  const rootIndex = parts.findIndex((part) => {
    const lower = part.toLowerCase();
    return lower === 'fedata' || lower === 'gamedata';
  });
  if (rootIndex < 0)
    return null;

  const gameParts = parts.slice(rootIndex).map((part) => part.toLowerCase());
  return `/NFSIISE/${gameParts.join('/')}`;
}

function joinChunks(chunks, length) {
  if (chunks.length === 1)
    return chunks[0];

  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function addFileToEmscripten(FS, path, contents) {
  const separator = path.lastIndexOf('/');
  const parent = path.slice(0, separator);
  const name = path.slice(separator + 1);
  FS.mkdirTree(parent);
  FS.createDataFile(parent, name, contents, true, false, true);
}

export async function mountGameArchive(blob, FS, onProgress) {
  const mountedPaths = new Set();
  let archiveBytesRead = 0;
  let activeFiles = 0;
  let mountedFiles = 0;
  let mountedBytes = 0;
  let extractionError = null;

  const unzip = new Unzip((file) => {
    if (extractionError || file.name.endsWith('/'))
      return;

    let virtualPath;
    try {
      virtualPath = toVirtualPath(file.name);
    } catch (error) {
      extractionError = error;
      return;
    }
    if (!virtualPath)
      return;
    if (mountedPaths.has(virtualPath)) {
      extractionError = new Error(`Duplicate game path in ZIP: ${virtualPath}`);
      return;
    }
    if (mountedPaths.size >= MAX_FILES) {
      extractionError = new Error(`The ZIP has more than ${MAX_FILES} game files.`);
      return;
    }

    mountedPaths.add(virtualPath);
    activeFiles += 1;
    const chunks = [];
    let fileLength = 0;

    file.ondata = (error, chunk, final) => {
      if (extractionError)
        return;
      if (error) {
        extractionError = error;
        return;
      }

      if (chunk.length) {
        chunks.push(chunk);
        fileLength += chunk.length;
        mountedBytes += chunk.length;
        if (mountedBytes > MAX_UNCOMPRESSED_BYTES) {
          extractionError = new Error('The expanded game data is larger than 800 MiB.');
          return;
        }
      }

      if (final) {
        try {
          addFileToEmscripten(FS, virtualPath, joinChunks(chunks, fileLength));
          mountedFiles += 1;
          activeFiles -= 1;
        } catch (mountError) {
          extractionError = mountError;
        }
      }
    };

    try {
      file.start();
    } catch (error) {
      extractionError = error;
    }
  });
  unzip.register(UnzipInflate);

  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        unzip.push(new Uint8Array(), true);
        break;
      }

      archiveBytesRead += value.length;
      unzip.push(value);
      if (extractionError)
        throw extractionError;
      onProgress({
        archiveBytesRead,
        archiveBytesTotal: blob.size,
        mountedFiles,
      });
    }
  } finally {
    reader.releaseLock();
  }

  if (extractionError)
    throw extractionError;
  if (activeFiles !== 0)
    throw new Error('The ZIP ended before all game files were expanded.');

  const hasFrontendData = [...mountedPaths].some((path) => path.startsWith('/NFSIISE/fedata/pc/'));
  const hasGameData = [...mountedPaths].some((path) => path.startsWith('/NFSIISE/gamedata/'));
  if (!hasFrontendData || !hasGameData)
    throw new Error('This ZIP must contain fedata/pc and gamedata from Need For Speed II SE.');

  return { mountedBytes, mountedFiles };
}
