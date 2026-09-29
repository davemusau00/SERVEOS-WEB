/**
 * ServOS - Client-Side Offline Storage & IndexedDB Queue System
 * Provides offline transaction persistence, structured operations queue,
 * catalog caching, and automatic synchronization engine.
 */

import { OfflineOperation, OfflineOperationStatus } from '../types/servos';

const DB_NAME = 'ServOS_Offline_Store';
const DB_VERSION = 1;

export const STORES = {
  QUEUE: 'offline_queue',
  CATALOG: 'catalog_cache',
  LOGS: 'sync_logs'
} as const;

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes and upgrades the IndexedDB instance for ServOS offline operations
 */
export const initOfflineDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Offline Operations Queue Store
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const queueStore = db.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('occurredAt', 'occurredAt', { unique: false });
        queueStore.createIndex('operationType', 'operationType', { unique: false });
      }

      // 2. Catalog & Floorplan Cache Store
      if (!db.objectStoreNames.contains(STORES.CATALOG)) {
        db.createObjectStore(STORES.CATALOG, { keyPath: 'key' });
      }

      // 3. Sync Audit Logs Store
      if (!db.objectStoreNames.contains(STORES.LOGS)) {
        const logStore = db.createObjectStore(STORES.LOGS, { keyPath: 'id' });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event: Event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event: Event) => {
      console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

/**
 * Enqueues an offline transaction/operation into IndexedDB
 */
export const enqueueOfflineOperation = async (
  op: Omit<OfflineOperation, 'status' | 'retryCount'> & { status?: OfflineOperationStatus; retryCount?: number }
): Promise<OfflineOperation> => {
  const db = await initOfflineDb();
  const record: OfflineOperation = {
    ...op,
    status: op.status || 'PENDING',
    retryCount: op.retryCount || 0
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const req = store.put(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
};

/**
 * Retrieves all offline operations, optionally filtered by status
 */
export const getOfflineOperations = async (
  statusFilter?: OfflineOperationStatus
): Promise<OfflineOperation[]> => {
  const db = await initOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readonly');
    const store = tx.objectStore(STORES.QUEUE);
    const req = store.getAll();

    req.onsuccess = () => {
      let results: OfflineOperation[] = req.result || [];
      if (statusFilter) {
        results = results.filter(item => item.status === statusFilter);
      }
      // Sort chronologically (FIFO)
      results.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
      resolve(results);
    };

    req.onerror = () => reject(req.error);
  });
};

/**
 * Updates status of a queued offline operation
 */
export const updateOfflineOperationStatus = async (
  id: string,
  status: OfflineOperationStatus,
  errorMessage?: string
): Promise<void> => {
  const db = await initOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result as OfflineOperation | undefined;
      if (!record) {
        resolve();
        return;
      }

      record.status = status;
      if (status === 'SYNCED') {
        record.syncedAt = new Date().toISOString();
      }
      if (errorMessage) {
        record.errorMessage = errorMessage;
        record.retryCount = (record.retryCount || 0) + 1;
      }

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };

    getReq.onerror = () => reject(getReq.error);
  });
};

/**
 * Deletes an operation from the offline queue
 */
export const deleteOfflineOperation = async (id: string): Promise<void> => {
  const db = await initOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

/**
 * Clears all operations in the queue
 */
export const clearAllOfflineOperations = async (): Promise<void> => {
  const db = await initOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.QUEUE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

/**
 * Caches application catalog (products, tables, rooms) for offline reads
 */
export const cacheCatalogOffline = async (key: string, data: any): Promise<void> => {
  try {
    const db = await initOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CATALOG, 'readwrite');
      const store = tx.objectStore(STORES.CATALOG);
      const req = store.put({ key, data, cachedAt: new Date().toISOString() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not cache catalog offline:', err);
  }
};

/**
 * Retrieves cached catalog from IndexedDB
 */
export const getCachedCatalogOffline = async (key: string): Promise<any | null> => {
  try {
    const db = await initOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CATALOG, 'readonly');
      const store = tx.objectStore(STORES.CATALOG);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.data : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return null;
  }
};

/**
 * Appends a sync event to the audit trail
 */
export const logSyncEvent = async (
  message: string,
  type: 'info' | 'success' | 'error' = 'info',
  syncedCount: number = 0
): Promise<void> => {
  try {
    const db = await initOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.LOGS, 'readwrite');
      const store = tx.objectStore(STORES.LOGS);
      const req = store.put({
        id: `sync-log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        message,
        type,
        syncedCount,
        timestamp: new Date().toISOString()
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not log sync event:', err);
  }
};

/**
 * Retrieves sync audit logs
 */
export const getSyncLogs = async (limit: number = 20): Promise<Array<{
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  syncedCount: number;
  timestamp: string;
}>> => {
  try {
    const db = await initOfflineDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.LOGS, 'readonly');
      const store = tx.objectStore(STORES.LOGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const logs = (req.result || []).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        resolve(logs.slice(0, limit));
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    return [];
  }
};
