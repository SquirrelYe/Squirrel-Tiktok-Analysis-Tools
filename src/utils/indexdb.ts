/**
 * @description IndexedDB工具类
 * @author 风继续吹<will>
 * @time 2025.06.26 11:28:52
 */

export class IndexedDBUtil {
  private dbName: string;
  private dbVersion: number;
  private db: IDBDatabase | null = null;
  private dbStore: Record<string, IDBObjectStoreParameters> = {};

  constructor(dbName: string, dbVersion: number = 1, store: Record<string, IDBObjectStoreParameters>) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this.dbStore = store;
  }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = event => {
        this.db = (event.target as IDBOpenDBRequest).result;
        for (const [name, store] of Object.entries(this.dbStore)) {
          if (!this.db.objectStoreNames.contains(name)) {
            const newStore = this.db.createObjectStore(name, { keyPath: store.keyPath });
            console.log(`Object store created: ${name}`, newStore);
          }
        }
      };
      request.onsuccess = event => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
      request.onerror = event => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => {
        console.log(`Database deleted successfully: ${this.dbName}`);
        resolve();
      };
      request.onerror = event => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    if (!this.db) {
      throw new Error('Database is not open');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  async upsertItem(storeName: string, item: any): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async addItem(storeName: string, item: any): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.add(item);
      request.onsuccess = () => resolve();
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async getItem(storeName: string, key: IDBValidKey): Promise<any> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async updateItem(storeName: string, item: any): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async deleteItem(storeName: string, key: IDBValidKey): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async getAllItems(storeName: string): Promise<any[]> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async countItems(storeName: string): Promise<number> {
    const store = await this.getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => reject((event.target as IDBRequest).error);
    });
  }

  async getItemCount(storeName: string): Promise<number> {
    return this.countItems(storeName);
  }

  async hasItem(storeName: string, key: IDBValidKey): Promise<boolean> {
    try {
      const item = await this.getItem(storeName, key);
      return item !== undefined;
    } catch {
      return false;
    }
  }

  async getItemOrDefault(storeName: string, key: IDBValidKey, defaultValue: any): Promise<any> {
    try {
      const item = await this.getItem(storeName, key);
      return item !== undefined ? item : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async setItemIfNotExists(storeName: string, item: any): Promise<void> {
    const key = item.id; // 假设item有一个唯一的id字段
    if (!(await this.hasItem(storeName, key))) {
      await this.addItem(storeName, item);
    }
  }

  async removeItems(storeName: string, keys: IDBValidKey[]): Promise<void> {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const requests = keys.map(key => store.delete(key));
      let completed = 0;
      requests.forEach(request => {
        request.onsuccess = () => {
          completed++;
          if (completed === requests.length) {
            resolve();
          }
        };
        request.onerror = event => reject((event.target as IDBRequest).error);
      });
    });
  }

  async removeItem(storeName: string, key: IDBValidKey): Promise<void> {
    await this.deleteItem(storeName, key);
  }
}
