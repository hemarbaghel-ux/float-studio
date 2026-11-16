/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Router, Request, Response } from 'express';
import { requireAuth } from '../authMiddleware';

export interface ExtensionGalleryItem {
  readonly id: string;
  readonly publisher: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly iconUrl?: string;
  readonly downloadUrl: string;
  readonly downloadCount?: number;
  readonly averageRating?: number;
}

export class ExtensionGalleryService {
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();
  private readonly defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  private getCached(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  private setCached(key: string, data: any, ttlMs: number = this.defaultTtlMs): void {
    if (this.cache.size > 256) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  public async searchExtensions(
    query: string,
    size: number = 20,
    offset: number = 0
  ): Promise<{ total: number; extensions: ExtensionGalleryItem[] }> {
    const cacheKey = `search:${query}:${size}:${offset}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const url = `https://open-vsx.org/api/-/search?query=${encodeURIComponent(query)}&size=${size}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FLOAT-Studio/1.0.0 (https://float-studio.ai.studio)',
      },
    });

    if (!res.ok) {
      throw new Error(`Open-VSX query failed with HTTP ${res.status}`);
    }

    const json: any = await res.json();
    const total = json.totalSize || 0;
    const extensions: ExtensionGalleryItem[] = (json.extensions || []).map((ext: any) => {
      const publisher = ext.namespace || ext.publisher;
      const name = ext.name;
      const version = ext.version;
      const downloadUrl =
        ext.files?.download ||
        `https://open-vsx.org/api/${publisher}/${name}/${version}/file/${publisher}.${name}-${version}.vsix`;

      return {
        id: `${publisher}.${name}`,
        publisher,
        name,
        displayName: ext.displayName || name,
        description: ext.description || '',
        version,
        iconUrl: ext.files?.icon,
        downloadUrl,
        downloadCount: ext.downloadCount,
        averageRating: ext.averageRating,
      };
    });

    const result = { total, extensions };
    this.setCached(cacheKey, result);
    return result;
  }

  public async getExtensionDetails(publisher: string, name: string): Promise<ExtensionGalleryItem | null> {
    const cacheKey = `item:${publisher}:${name}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const url = `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FLOAT-Studio/1.0.0 (https://float-studio.ai.studio)',
      },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Open-VSX item lookup failed with HTTP ${res.status}`);
    }

    const ext: any = await res.json();
    const version = ext.version;
    const downloadUrl =
      ext.files?.download ||
      `https://open-vsx.org/api/${publisher}/${name}/${version}/file/${publisher}.${name}-${version}.vsix`;

    const item: ExtensionGalleryItem = {
      id: `${publisher}.${name}`,
      publisher,
      name,
      displayName: ext.displayName || name,
      description: ext.description || '',
      version,
      iconUrl: ext.files?.icon,
      downloadUrl,
      downloadCount: ext.downloadCount,
      averageRating: ext.averageRating,
    };

    this.setCached(cacheKey, item);
    return item;
  }
}

export function createExtensionGalleryRouter(galleryService: ExtensionGalleryService = new ExtensionGalleryService()): Router {
  const router = Router();

  // Search extensions
  router.get('/search', requireAuth, async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const size = Math.min(50, Math.max(1, parseInt(String(req.query.size || '20'), 10) || 20));
      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

      const result = await galleryService.searchExtensions(q, size, offset);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(502).json({ error: 'Failed to search Open-VSX extension marketplace', details: err?.message || String(err) });
    }
  });

  // Get extension details
  router.get('/item/:publisher/:name', requireAuth, async (req: Request, res: Response) => {
    try {
      const { publisher, name } = req.params;
      const item = await galleryService.getExtensionDetails(publisher, name);
      if (!item) {
        return res.status(404).json({ error: `Extension ${publisher}.${name} not found` });
      }
      res.json({ success: true, extension: item });
    } catch (err: any) {
      res.status(502).json({ error: 'Failed to fetch extension details', details: err?.message || String(err) });
    }
  });

  // Stream VSIX download
  router.get('/download/:publisher/:name/:version', requireAuth, async (req: Request, res: Response) => {
    try {
      const { publisher, name, version } = req.params;
      const targetUrl = `https://open-vsx.org/api/${encodeURIComponent(publisher)}/${encodeURIComponent(name)}/${encodeURIComponent(version)}/file/${publisher}.${name}-${version}.vsix`;

      const vsixRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'FLOAT-Studio/1.0.0 (https://float-studio.ai.studio)',
        },
      });

      if (!vsixRes.ok) {
        return res.status(vsixRes.status).json({ error: `VSIX download failed with HTTP ${vsixRes.status}` });
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${publisher}.${name}-${version}.vsix"`);

      // Stream payload to response
      if (vsixRes.body) {
        const reader = vsixRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } else {
        const buffer = await vsixRes.arrayBuffer();
        res.send(Buffer.from(buffer));
      }
    } catch (err: any) {
      res.status(502).json({ error: 'Failed to download VSIX package', details: err?.message || String(err) });
    }
  });

  return router;
}
