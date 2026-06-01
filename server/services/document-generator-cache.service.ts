/**
 * Document Generator Cache Service
 * 
 * In-memory cache for generated document buffers.
 * Generates documents on-demand from template + data, caches for short-term reuse.
 * 
 * Features:
 * - LRU eviction when max entries reached
 * - TTL-based expiration (10 minutes default) with sliding window on hits
 * - Promise coalescing for concurrent requests
 * - Memory-efficient: stores Buffer, auto-cleans expired entries
 * - Proper cleanup with shutdown() method
 */

import { FileManagerService } from './file-manager.service';
import { generateDocumentTwoPasses } from '../utils/docx-generation';
import { type TableData } from '../utils/table-injector';

interface CacheEntry {
  buffer: Buffer;
  cachedAt: Date;
  lastAccessedAt: Date;
  documentName: string;
  size: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentEntries: number;
  totalSizeBytes: number;
  generations: number;
}

interface CacheConfig {
  maxEntries: number;
  ttlMinutes: number;
  enabled: boolean;
}

class DocumentGeneratorCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingGenerations: Map<string, Promise<Buffer>> = new Map();
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    currentEntries: 0,
    totalSizeBytes: 0,
    generations: 0
  };
  
  private config: CacheConfig = {
    maxEntries: 50,
    ttlMinutes: 10,
    enabled: true
  };

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    console.log('[DocumentGeneratorCache] Initialized with config:', this.config);
    
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  private stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  private cleanupExpired(): void {
    if (!this.config.enabled) return;
    
    const now = new Date();
    let cleaned = 0;
    
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      const ageMinutes = (now.getTime() - entry.lastAccessedAt.getTime()) / (1000 * 60);
      if (ageMinutes > this.config.ttlMinutes) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.updateStats();
      console.log(`[DocumentGeneratorCache] Cleaned up ${cleaned} expired entries`);
    }
  }

  private generateCacheKey(documentUuid: string, fieldsHash: string, tableHash: string): string {
    return `${documentUuid}:${fieldsHash}:${tableHash}`;
  }

  private hashFields(fields: Record<string, string>): string {
    const sorted = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
    const str = JSON.stringify(sorted);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private hashTableData(tableDataMap: Record<string, TableData>): string {
    const str = JSON.stringify(tableDataMap, Object.keys(tableDataMap).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private hashBlockData(blockDataMap: Record<string, Array<Record<string, string>>>): string {
    const str = JSON.stringify(blockDataMap, Object.keys(blockDataMap).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  get(documentUuid: string, fieldValues: Record<string, string>, tableDataMap: Record<string, TableData> = {}, blockDataMap: Record<string, Array<Record<string, string>>> = {}): Buffer | null {
    if (!this.config.enabled) {
      return null;
    }

    const key = this.generateCacheKey(documentUuid, this.hashFields(fieldValues), this.hashTableData(tableDataMap) + ':' + this.hashBlockData(blockDataMap));
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = new Date();
    const ageMinutes = (now.getTime() - entry.lastAccessedAt.getTime()) / (1000 * 60);
    if (ageMinutes > this.config.ttlMinutes) {
      this.cache.delete(key);
      this.updateStats();
      this.stats.misses++;
      return null;
    }

    entry.lastAccessedAt = now;
    
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.buffer;
  }

  set(documentUuid: string, fieldValues: Record<string, string>, buffer: Buffer, documentName: string, tableDataMap: Record<string, TableData> = {}, blockDataMap: Record<string, Array<Record<string, string>>> = {}): void {
    if (!this.config.enabled) {
      return;
    }

    while (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    const key = this.generateCacheKey(documentUuid, this.hashFields(fieldValues), this.hashTableData(tableDataMap) + ':' + this.hashBlockData(blockDataMap));
    const now = new Date();
    const entry: CacheEntry = {
      buffer,
      cachedAt: now,
      lastAccessedAt: now,
      documentName,
      size: buffer.length
    };

    this.cache.set(key, entry);
    this.updateStats();
  }

  invalidate(documentUuid: string): void {
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (key.startsWith(`${documentUuid}:`)) {
        this.cache.delete(key);
      }
    }
    this.pendingGenerations.delete(documentUuid);
    this.updateStats();
  }

  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.pendingGenerations.clear();
    this.updateStats();
    console.log(`[DocumentGeneratorCache] Cleared ${count} entries`);
  }

  shutdown(): void {
    this.stopCleanupInterval();
    this.clear();
    console.log('[DocumentGeneratorCache] Shutdown complete');
  }

  /**
   * Generate document buffer using two-pass rendering:
   * Pass 1: table injection + {{ }} field rendering
   * Pass 2: {%#BLOCK%}...{%/BLOCK%} chorus block loop rendering (skipped when no blocks)
   */
  async generateDocumentBuffer(
    templateFilePath: string,
    fieldValues: Record<string, string>,
    tableDataMap: Record<string, TableData> = {},
    blockDataMap: Record<string, Array<Record<string, string>>> = {}
  ): Promise<Buffer> {
    const templateBuffer = await FileManagerService.readTemplateBuffer(templateFilePath);

    const processedFieldValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(fieldValues)) {
      processedFieldValues[key] = typeof value === 'string'
        ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        : String(value || '');
    }

    this.stats.generations++;
    return generateDocumentTwoPasses(templateBuffer, processedFieldValues, tableDataMap, blockDataMap);
  }

  /**
   * Get or generate document with caching and promise coalescing.
   * Supports both legacy table rendering and new chorus block rendering.
   */
  async getOrGenerate(params: {
    documentUuid: string;
    documentName: string;
    templateFilePath: string;
    fieldValues: Record<string, string>;
    tableDataMap?: Record<string, TableData>;
    blockDataMap?: Record<string, Array<Record<string, string>>>;
  }): Promise<Buffer> {
    const { documentUuid, documentName, templateFilePath, fieldValues, tableDataMap = {}, blockDataMap = {} } = params;

    if (!this.config.enabled) {
      return this.generateDocumentBuffer(templateFilePath, fieldValues, tableDataMap, blockDataMap);
    }

    const cached = this.get(documentUuid, fieldValues, tableDataMap, blockDataMap);
    if (cached !== null) {
      console.log(`[DocumentGeneratorCache] Cache hit for ${documentUuid}`);
      return cached;
    }

    const key = this.generateCacheKey(documentUuid, this.hashFields(fieldValues), this.hashTableData(tableDataMap) + ':' + this.hashBlockData(blockDataMap));
    const pending = this.pendingGenerations.get(key);
    if (pending) {
      console.log(`[DocumentGeneratorCache] Coalescing request for ${documentUuid}`);
      return pending;
    }

    const generationPromise = (async () => {
      try {
        console.log(`[DocumentGeneratorCache] Generating document for ${documentUuid}`);
        const buffer = await this.generateDocumentBuffer(templateFilePath, fieldValues, tableDataMap, blockDataMap);
        this.set(documentUuid, fieldValues, buffer, documentName, tableDataMap, blockDataMap);
        return buffer;
      } finally {
        this.pendingGenerations.delete(key);
      }
    })();

    this.pendingGenerations.set(key, generationPromise);
    return generationPromise;
  }

  private updateStats(): void {
    this.stats.currentEntries = this.cache.size;
    this.stats.totalSizeBytes = 0;
    const values = Array.from(this.cache.values());
    for (const entry of values) {
      this.stats.totalSizeBytes += entry.size;
    }
  }

  getStats(): CacheStats & { hitRate: string; totalSizeMB: string } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%';
    const totalSizeMB = (this.stats.totalSizeBytes / (1024 * 1024)).toFixed(2) + ' MB';
    
    return {
      ...this.stats,
      hitRate,
      totalSizeMB
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[DocumentGeneratorCache] Cache ${enabled ? 'enabled' : 'disabled'}`);
    if (!enabled) {
      this.stopCleanupInterval();
      this.clear();
    } else {
      this.startCleanupInterval();
    }
  }
}

export const documentGeneratorCache = new DocumentGeneratorCache();

export { DocumentGeneratorCache, CacheConfig, CacheStats };
