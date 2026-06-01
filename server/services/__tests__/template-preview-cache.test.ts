/**
 * Unit Tests for Template Preview Cache Service
 * 
 * Tests cover:
 * - Cache hit/miss behavior
 * - TTL expiration
 * - Template update invalidation
 * - Template delete invalidation  
 * - Promise coalescing (concurrent requests)
 * - LRU eviction
 * - Feature flag (enable/disable)
 * 
 * SAFETY: These tests use isolated cache instances, 
 * no real database or file system access required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemplatePreviewCache } from '../template-preview-cache.service';

describe('TemplatePreviewCache', () => {
  let cache: TemplatePreviewCache;
  
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    cache = new TemplatePreviewCache({
      maxEntries: 5,
      ttlMinutes: 60,
      enabled: true
    });
  });

  describe('Basic Cache Operations', () => {
    it('should return null for cache miss', () => {
      const result = cache.get('non-existent-uuid', new Date());
      expect(result).toBeNull();
    });

    it('should cache and retrieve HTML (hit after set)', () => {
      const uuid = 'test-uuid-1';
      const html = '<div>Test HTML content</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      const result = cache.get(uuid, updatedAt);

      expect(result).toBe(html);
    });

    it('should track hit/miss statistics', () => {
      const uuid = 'test-uuid-stats';
      const html = '<p>Stats test</p>';
      const updatedAt = new Date();

      cache.get('miss-1', updatedAt);
      cache.get('miss-2', updatedAt);
      
      cache.set(uuid, html, updatedAt);
      cache.get(uuid, updatedAt);
      cache.get(uuid, updatedAt);

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.currentEntries).toBe(1);
    });
  });

  describe('TTL Expiration', () => {
    it('should return null for expired entries', () => {
      const shortTtlCache = new TemplatePreviewCache({
        maxEntries: 10,
        ttlMinutes: 0.001,
        enabled: true
      });

      const uuid = 'ttl-test-uuid';
      const html = '<div>TTL test</div>';
      const updatedAt = new Date();

      shortTtlCache.set(uuid, html, updatedAt);
      
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const result = shortTtlCache.get(uuid, updatedAt);
          expect(result).toBeNull();
          
          const stats = shortTtlCache.getStats();
          expect(stats.currentEntries).toBe(0);
          resolve();
        }, 100);
      });
    });

    it('should return cached content within TTL', () => {
      const uuid = 'valid-ttl-uuid';
      const html = '<div>Valid TTL content</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      
      const result = cache.get(uuid, updatedAt);
      expect(result).toBe(html);
    });
  });

  describe('Template Update Invalidation', () => {
    it('should invalidate cache when template is updated', () => {
      const uuid = 'update-test-uuid';
      const html = '<div>Original content</div>';
      const originalUpdatedAt = new Date('2024-01-01T00:00:00Z');
      const newUpdatedAt = new Date('2024-01-02T00:00:00Z');

      cache.set(uuid, html, originalUpdatedAt);
      
      const beforeUpdate = cache.get(uuid, originalUpdatedAt);
      expect(beforeUpdate).toBe(html);
      
      const afterUpdate = cache.get(uuid, newUpdatedAt);
      expect(afterUpdate).toBeNull();
    });

    it('should return cached content when updatedAt matches', () => {
      const uuid = 'same-update-uuid';
      const html = '<div>Same update time</div>';
      const updatedAt = new Date('2024-06-15T10:30:00Z');

      cache.set(uuid, html, updatedAt);
      
      const result = cache.get(uuid, updatedAt);
      expect(result).toBe(html);
    });

    it('should work with invalidate() method', () => {
      const uuid = 'invalidate-method-uuid';
      const html = '<div>To be invalidated</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      expect(cache.get(uuid, updatedAt)).toBe(html);

      cache.invalidate(uuid);
      expect(cache.get(uuid, updatedAt)).toBeNull();
    });
  });

  describe('LRU Eviction', () => {
    it('should evict oldest entry when max capacity reached', () => {
      const html = '<div>Test</div>';
      const updatedAt = new Date();

      cache.set('uuid-1', html + '1', updatedAt);
      cache.set('uuid-2', html + '2', updatedAt);
      cache.set('uuid-3', html + '3', updatedAt);
      cache.set('uuid-4', html + '4', updatedAt);
      cache.set('uuid-5', html + '5', updatedAt);

      expect(cache.getStats().currentEntries).toBe(5);

      cache.set('uuid-6', html + '6', updatedAt);

      expect(cache.getStats().currentEntries).toBe(5);
      expect(cache.get('uuid-1', updatedAt)).toBeNull();
      expect(cache.get('uuid-6', updatedAt)).toBe(html + '6');
    });

    it('should track eviction count', () => {
      const html = '<div>Eviction test</div>';
      const updatedAt = new Date();

      for (let i = 1; i <= 8; i++) {
        cache.set(`evict-uuid-${i}`, html, updatedAt);
      }

      const stats = cache.getStats();
      expect(stats.evictions).toBe(3);
      expect(stats.currentEntries).toBe(5);
    });

    it('should update LRU order on cache hit', () => {
      const html = '<div>LRU order test</div>';
      const updatedAt = new Date();

      cache.set('lru-1', html + '1', updatedAt);
      cache.set('lru-2', html + '2', updatedAt);
      cache.set('lru-3', html + '3', updatedAt);
      cache.set('lru-4', html + '4', updatedAt);
      cache.set('lru-5', html + '5', updatedAt);

      cache.get('lru-1', updatedAt);
      cache.get('lru-2', updatedAt);

      cache.set('lru-6', html + '6', updatedAt);

      expect(cache.get('lru-1', updatedAt)).toBe(html + '1');
      expect(cache.get('lru-2', updatedAt)).toBe(html + '2');
      expect(cache.get('lru-3', updatedAt)).toBeNull();
    });
  });

  describe('Promise Coalescing', () => {
    it('should coalesce concurrent requests for same template', async () => {
      const uuid = 'coalesce-uuid';
      const html = '<div>Coalesced content</div>';
      const updatedAt = new Date();
      let generatorCallCount = 0;

      const generator = async () => {
        generatorCallCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return html;
      };

      const [result1, result2, result3] = await Promise.all([
        cache.getOrGenerate(uuid, updatedAt, generator),
        cache.getOrGenerate(uuid, updatedAt, generator),
        cache.getOrGenerate(uuid, updatedAt, generator)
      ]);

      expect(generatorCallCount).toBe(1);
      expect(result1).toBe(html);
      expect(result2).toBe(html);
      expect(result3).toBe(html);
    });

    it('should call generator for different templates', async () => {
      const updatedAt = new Date();
      let generatorCallCount = 0;

      const generator = async () => {
        generatorCallCount++;
        return `<div>Content ${generatorCallCount}</div>`;
      };

      await Promise.all([
        cache.getOrGenerate('uuid-a', updatedAt, generator),
        cache.getOrGenerate('uuid-b', updatedAt, generator),
        cache.getOrGenerate('uuid-c', updatedAt, generator)
      ]);

      expect(generatorCallCount).toBe(3);
    });

    it('should use cache on subsequent calls', async () => {
      const uuid = 'subsequent-uuid';
      const updatedAt = new Date();
      let generatorCallCount = 0;

      const generator = async () => {
        generatorCallCount++;
        return '<div>Generated once</div>';
      };

      await cache.getOrGenerate(uuid, updatedAt, generator);
      await cache.getOrGenerate(uuid, updatedAt, generator);
      await cache.getOrGenerate(uuid, updatedAt, generator);

      expect(generatorCallCount).toBe(1);
    });

    it('should handle generator errors gracefully', async () => {
      const uuid = 'error-uuid';
      const updatedAt = new Date();

      const failingGenerator = async () => {
        throw new Error('Generation failed');
      };

      await expect(
        cache.getOrGenerate(uuid, updatedAt, failingGenerator)
      ).rejects.toThrow('Generation failed');

      expect(cache.get(uuid, updatedAt)).toBeNull();
    });

    it('should clear pendingGenerations after generator fails (regression guard)', async () => {
      const uuid = 'error-recovery-uuid';
      const updatedAt = new Date();
      let callCount = 0;

      const failOnFirstCall = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First call fails');
        }
        return '<div>Success on retry</div>';
      };

      await expect(
        cache.getOrGenerate(uuid, updatedAt, failOnFirstCall)
      ).rejects.toThrow('First call fails');

      const result = await cache.getOrGenerate(uuid, updatedAt, failOnFirstCall);
      
      expect(callCount).toBe(2);
      expect(result).toBe('<div>Success on retry</div>');
    });

    it('should not leave stalled pending promise after concurrent failures', async () => {
      const uuid = 'concurrent-error-uuid';
      const updatedAt = new Date();
      let callCount = 0;

      const failingGenerator = async () => {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 30));
        throw new Error('All fail');
      };

      const results = await Promise.allSettled([
        cache.getOrGenerate(uuid, updatedAt, failingGenerator),
        cache.getOrGenerate(uuid, updatedAt, failingGenerator),
        cache.getOrGenerate(uuid, updatedAt, failingGenerator)
      ]);

      expect(callCount).toBe(1);
      expect(results.every(r => r.status === 'rejected')).toBe(true);

      let retryCallCount = 0;
      const successGenerator = async () => {
        retryCallCount++;
        return '<div>Recovered</div>';
      };

      const recoveredResult = await cache.getOrGenerate(uuid, updatedAt, successGenerator);
      expect(retryCallCount).toBe(1);
      expect(recoveredResult).toBe('<div>Recovered</div>');
    });
  });

  describe('Feature Flag (Enable/Disable)', () => {
    it('should bypass cache when disabled', () => {
      const uuid = 'disabled-cache-uuid';
      const html = '<div>Should not cache</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      expect(cache.get(uuid, updatedAt)).toBe(html);

      cache.setEnabled(false);
      
      cache.set('new-uuid', '<div>New</div>', updatedAt);
      expect(cache.get('new-uuid', updatedAt)).toBeNull();
      
      expect(cache.get(uuid, updatedAt)).toBeNull();
    });

    it('should clear cache when disabled', () => {
      const html = '<div>Test</div>';
      const updatedAt = new Date();

      cache.set('uuid-1', html, updatedAt);
      cache.set('uuid-2', html, updatedAt);
      expect(cache.getStats().currentEntries).toBe(2);

      cache.setEnabled(false);
      expect(cache.getStats().currentEntries).toBe(0);
    });

    it('should resume caching when re-enabled', () => {
      const uuid = 'reenable-uuid';
      const html = '<div>Re-enabled caching</div>';
      const updatedAt = new Date();

      cache.setEnabled(false);
      cache.setEnabled(true);

      cache.set(uuid, html, updatedAt);
      expect(cache.get(uuid, updatedAt)).toBe(html);
    });

    it('should call generator directly when disabled', async () => {
      const uuid = 'disabled-generator-uuid';
      const updatedAt = new Date();
      let callCount = 0;

      const generator = async () => {
        callCount++;
        return '<div>Generated</div>';
      };

      cache.setEnabled(false);

      await cache.getOrGenerate(uuid, updatedAt, generator);
      await cache.getOrGenerate(uuid, updatedAt, generator);

      expect(callCount).toBe(2);
    });
  });

  describe('Clear and Delete Operations', () => {
    it('should clear all entries', () => {
      const html = '<div>Test</div>';
      const updatedAt = new Date();

      cache.set('uuid-1', html, updatedAt);
      cache.set('uuid-2', html, updatedAt);
      cache.set('uuid-3', html, updatedAt);

      expect(cache.getStats().currentEntries).toBe(3);

      cache.clear();
      expect(cache.getStats().currentEntries).toBe(0);
    });

    it('should delete specific entry', () => {
      const html = '<div>Test</div>';
      const updatedAt = new Date();

      cache.set('uuid-1', html, updatedAt);
      cache.set('uuid-2', html, updatedAt);

      cache.delete('uuid-1');

      expect(cache.get('uuid-1', updatedAt)).toBeNull();
      expect(cache.get('uuid-2', updatedAt)).toBe(html);
    });

    it('should return false when deleting non-existent entry', () => {
      const result = cache.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should calculate hit rate correctly', () => {
      const uuid = 'hitrate-uuid';
      const html = '<div>Hit rate test</div>';
      const updatedAt = new Date();

      cache.get('miss-1', updatedAt);
      cache.get('miss-2', updatedAt);
      
      cache.set(uuid, html, updatedAt);
      cache.get(uuid, updatedAt);
      cache.get(uuid, updatedAt);
      cache.get(uuid, updatedAt);
      cache.get(uuid, updatedAt);

      const stats = cache.getStats();
      expect(stats.hits).toBe(4);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe('66.7%');
    });

    it('should calculate total size in bytes', () => {
      const smallHtml = '<p>Small</p>';
      const largeHtml = '<div>' + 'x'.repeat(1000) + '</div>';
      const updatedAt = new Date();

      cache.set('small-uuid', smallHtml, updatedAt);
      cache.set('large-uuid', largeHtml, updatedAt);

      const stats = cache.getStats();
      expect(stats.totalSizeBytes).toBeGreaterThan(1000);
    });

    it('should show 0% hit rate when no requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0%');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty HTML content', () => {
      const uuid = 'empty-html-uuid';
      const html = '';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      const result = cache.get(uuid, updatedAt);
      
      expect(result).toBe('');
    });

    it('should handle very large HTML content', () => {
      const uuid = 'large-html-uuid';
      const html = '<div>' + 'x'.repeat(100000) + '</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      const result = cache.get(uuid, updatedAt);
      
      expect(result).toBe(html);
    });

    it('should handle special characters in HTML', () => {
      const uuid = 'special-chars-uuid';
      const html = '<div>Tiếng Việt: ẹ, ọ, ừ, ư, đ &amp; &lt;script&gt;</div>';
      const updatedAt = new Date();

      cache.set(uuid, html, updatedAt);
      const result = cache.get(uuid, updatedAt);
      
      expect(result).toBe(html);
    });

    it('should handle Date object vs string for updatedAt', () => {
      const uuid = 'date-string-uuid';
      const html = '<div>Date test</div>';
      const dateObj = new Date('2024-06-15T10:30:00Z');
      const dateString = '2024-06-15T10:30:00.000Z';

      cache.set(uuid, html, dateObj);
      
      const result = cache.get(uuid, new Date(dateString));
      expect(result).toBe(html);
    });
  });
});
