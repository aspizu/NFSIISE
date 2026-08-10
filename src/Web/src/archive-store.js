const DATABASE_NAME = 'nfs2se-web';
const DATABASE_VERSION = 1;
const STORE_NAME = 'game-archives';
const ARCHIVE_KEY = 'current-game-zip';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function finishTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getCachedArchive() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const completion = finishTransaction(transaction);
    const request = transaction.objectStore(STORE_NAME).get(ARCHIVE_KEY);
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    await completion;
    return record;
  } finally {
    database.close();
  }
}

export async function cacheArchive(record) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record, ARCHIVE_KEY);
    await finishTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function clearCachedArchive() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(ARCHIVE_KEY);
    await finishTransaction(transaction);
  } finally {
    database.close();
  }
}
