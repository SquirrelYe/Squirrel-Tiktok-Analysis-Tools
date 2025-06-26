/**
 * @description 存储工具类
 * @author 风继续吹<will>
 * @time 2025.06.26 11:26:38
 */

export class LocalStorageUtil {
  static setItem(key: string, value: any): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  static getItem<T>(key: string): T | null {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  static removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  static clear(): void {
    localStorage.clear();
  }

  static getAllKeys(): string[] {
    return Object.keys(localStorage);
  }

  static getAllItems(): Record<string, any> {
    const items: Record<string, any> = {};
    this.getAllKeys().forEach(key => {
      items[key] = this.getItem(key);
    });
    return items;
  }

  static hasItem(key: string): boolean {
    return localStorage.getItem(key) !== null;
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
}
