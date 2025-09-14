// Simple LRU Cache implementation to avoid dependency issues
class SimpleLRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private maxAge: number;
  private timestamps = new Map<K, number>();

  constructor(options: {
    max: number;
    maxSize?: number;
    ttl?: number;
    sizeCalculation?: (value: V) => number;
  }) {
    this.maxSize = options.max;
    this.maxAge = options.ttl || Infinity;
  }

  set(key: K, value: V): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.timestamps.delete(firstKey);
      }
    }

    this.cache.set(key, value);
    this.timestamps.set(key, Date.now());
  }

  get(key: K): V | undefined {
    const timestamp = this.timestamps.get(key);
    if (timestamp && Date.now() - timestamp > this.maxAge) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return undefined;
    }

    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    this.timestamps.delete(key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.timestamps.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get calculatedSize(): number {
    return this.cache.size * 1024; // Rough estimate
  }
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hash: string;
  size: number;
}

export class KVCache<T> {
  private cache: SimpleLRUCache<string, CacheEntry<T>>;
  private hitCount = 0;
  private missCount = 0;

  constructor(
    options: {
      maxSize?: number; // Max memory in MB
      maxAge?: number; // TTL in milliseconds
      maxItems?: number; // Max number of items
    } = {}
  ) {
    const {
      maxSize = 512, // 512MB default
      maxAge = 3600000, // 1 hour default
      maxItems = 10000, // 10k items default
    } = options;

    this.cache = new SimpleLRUCache({
      max: maxItems,
      maxSize: maxSize * 1024 * 1024, // Convert MB to bytes
      ttl: maxAge,
      sizeCalculation: (value) => this.calculateSize(value),
    });
  }

  set(key: string, data: T, hash: string): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      hash,
      size: this.calculateSize(data),
    };
    this.cache.set(key, entry);
  }

  get(key: string, expectedHash?: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check if hash matches (for cache invalidation)
    if (expectedHash && entry.hash !== expectedHash) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.data;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
      hits: this.hitCount,
      misses: this.missCount,
      memoryUsage: this.formatSize(this.cache.calculatedSize || 0),
    };
  }

  private calculateSize(data: any): number {
    return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
  }

  private formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  // Batch operations for efficiency
  setMany(entries: Array<{ key: string; data: T; hash: string }>): void {
    entries.forEach(({ key, data, hash }) => {
      this.set(key, data, hash);
    });
  }

  getMany(keys: string[]): Map<string, T> {
    const results = new Map<string, T>();
    keys.forEach((key) => {
      const data = this.get(key);
      if (data !== null) {
        results.set(key, data);
      }
    });
    return results;
  }
}
