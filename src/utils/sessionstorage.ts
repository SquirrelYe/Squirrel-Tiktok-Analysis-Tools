/**
 * @description 会话存储工具类
 * @author 风继续吹<will>
 * @time 2025.06.26 11:30:51
 */

export class SessionStorageUtil {
  static setItem(key: string, value: any): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  static getItem<T>(key: string): T | null {
    const value = sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  static removeItem(key: string): void {
    sessionStorage.removeItem(key);
  }

  static clear(): void {
    sessionStorage.clear();
  }

  static getAllKeys(): string[] {
    return Object.keys(sessionStorage);
  }

  static getAllValues(): any[] {
    return Object.values(sessionStorage).map(value => JSON.parse(value));
  }

  static getAllItems(): Record<string, any> {
    const items: Record<string, any> = {};
    this.getAllKeys().forEach(key => {
      items[key] = this.getItem(key);
    });
    return items;
  }

  static hasItem(key: string): boolean {
    return sessionStorage.getItem(key) !== null;
  }

  static getItemOrDefault<T>(key: string, defaultValue: T): T {
    const value = this.getItem<T>(key);
    return value !== null ? value : defaultValue;
  }

  static setItemIfNotExists(key: string, value: any): void {
    if (!this.hasItem(key)) {
      this.setItem(key, value);
    }
  }

  static removeItems(keys: string[]): void {
    keys.forEach(key => this.removeItem(key));
  }

  static removeAllItems(): void {
    this.clear();
  }
}
