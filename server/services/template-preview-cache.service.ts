/**
 * Template Preview Cache Service
 * 
 * In-memory LRU cache for template HTML previews.
 * Reduces load by caching mammoth-generated HTML.
 * 
 * Features:
 * - LRU eviction when max entries reached
 * - TTL-based expiration
 * - Promise coalescing to prevent duplicate renders
 * - Timestamp validation against template.updatedAt
 * - Hit/miss instrumentation
 */

interface CacheEntry {
  html: string;
  cachedAt: Date;
  templateUpdatedAt: Date;
  size: number; // bytes
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentEntries: number;
  totalSizeBytes: number;
}

interface CacheConfig {
  maxEntries: number;
  ttlMinutes: number;
  enabled: boolean;
}

class TemplatePreviewCache {
  private cache: Map<string, CacheEntry> = new Map();
  private pendingGenerations: Map<string, Promise<string>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    currentEntries: 0,
    totalSizeBytes: 0
  };
  
  private config: CacheConfig = {
    maxEntries: 100,
    ttlMinutes: 60, // 1 hour default
    enabled: true
  };

  constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    console.log('[TemplatePreviewCache] Initialized with config:', this.config);
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable cache (feature flag)
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[TemplatePreviewCache] Cache ${enabled ? 'enabled' : 'disabled'}`);
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Get cached preview if valid
   * Returns null if not cached, expired, or stale
   */
  get(templateUuid: string, templateUpdatedAt: Date): string | null {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.cache.get(templateUuid);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL expiration
    const now = new Date();
    const ageMinutes = (now.getTime() - entry.cachedAt.getTime()) / (1000 * 60);
    if (ageMinutes > this.config.ttlMinutes) {
      this.delete(templateUuid);
      this.stats.misses++;
      console.log(`[TemplatePreviewCache] TTL expired for ${templateUuid}`);
      return null;
    }

    // Check if template was updated after caching
    const templateUpdatedTime = new Date(templateUpdatedAt).getTime();
    const cachedTemplateTime = entry.templateUpdatedAt.getTime();
    if (templateUpdatedTime > cachedTemplateTime) {
      this.delete(templateUuid);
      this.stats.misses++;
      console.log(`[TemplatePreviewCache] Stale entry for ${templateUuid} (template updated)`);
      return null;
    }

    // Cache hit - move to end for LRU
    this.cache.delete(templateUuid);
    this.cache.set(templateUuid, entry);
    
    this.stats.hits++;
    return entry.html;
  }

  /**
   * Store preview in cache
   */
  set(templateUuid: string, html: string, templateUpdatedAt: Date): void {
    if (!this.config.enabled) {
      return;
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.config.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    const entry: CacheEntry = {
      html,
      cachedAt: new Date(),
      templateUpdatedAt: new Date(templateUpdatedAt),
      size: Buffer.byteLength(html, 'utf8')
    };

    this.cache.set(templateUuid, entry);
    this.updateStats();
    
    console.log(`[TemplatePreviewCache] Cached ${templateUuid} (${(entry.size / 1024).toFixed(1)} KB)`);
  }

  /**
   * Delete specific entry
   */
  delete(templateUuid: string): boolean {
    const deleted = this.cache.delete(templateUuid);
    if (deleted) {
      this.updateStats();
      console.log(`[TemplatePreviewCache] Deleted ${templateUuid}`);
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.pendingGenerations.clear();
    this.updateStats();
    console.log(`[TemplatePreviewCache] Cleared ${count} entries`);
  }

  /**
   * Invalidate cache for a template (called on update/delete)
   */
  invalidate(templateUuid: string): void {
    this.delete(templateUuid);
    this.pendingGenerations.delete(templateUuid);
  }

  /**
   * Get or generate preview with promise coalescing
   * Prevents duplicate generation when multiple requests hit cache miss simultaneously
   */
  async getOrGenerate(
    templateUuid: string,
    templateUpdatedAt: Date,
    generator: () => Promise<string>
  ): Promise<string> {
    if (!this.config.enabled) {
      return generator();
    }

    // Try cache first
    const cached = this.get(templateUuid, templateUpdatedAt);
    if (cached !== null) {
      return cached;
    }

    // Check if generation is already in progress (promise coalescing)
    const pending = this.pendingGenerations.get(templateUuid);
    if (pending) {
      console.log(`[TemplatePreviewCache] Coalescing request for ${templateUuid}`);
      return pending;
    }

    // Start generation
    const generationPromise = (async () => {
      try {
        const html = await generator();
        this.set(templateUuid, html, templateUpdatedAt);
        return html;
      } finally {
        this.pendingGenerations.delete(templateUuid);
      }
    })();

    this.pendingGenerations.set(templateUuid, generationPromise);
    return generationPromise;
  }

  /**
   * Update stats
   */
  private updateStats(): void {
    this.stats.currentEntries = this.cache.size;
    this.stats.totalSizeBytes = 0;
    const entries = Array.from(this.cache.values());
    for (const entry of entries) {
      this.stats.totalSizeBytes += entry.size;
    }
  }

  /**
   * Get cache statistics
   */
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

  /**
   * Log stats (for debugging)
   */
  logStats(): void {
    const stats = this.getStats();
    console.log('[TemplatePreviewCache] Stats:', JSON.stringify(stats, null, 2));
  }
}

// Singleton instance
export const templatePreviewCache = new TemplatePreviewCache();

// Export class for testing
export { TemplatePreviewCache, CacheConfig, CacheStats };
