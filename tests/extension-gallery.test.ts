/*---------------------------------------------------------------------------------------------
 *  Copyright (c) FLOAT Studio. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionGalleryService } from '../src/server/extensions/extensionGalleryRouter';

describe('ExtensionGalleryService (Open-VSX Marketplace Integration)', () => {
  let service: ExtensionGalleryService;

  beforeEach(() => {
    service = new ExtensionGalleryService();
  });

  it('searches extensions and formats items for editor consumption', async () => {
    const mockOpenVsxResponse = {
      totalSize: 1,
      extensions: [
        {
          namespace: 'golang',
          name: 'Go',
          displayName: 'Go Language Support',
          description: 'Rich Go language support for Visual Studio Code',
          version: '0.42.0',
          files: {
            icon: 'https://open-vsx.org/api/golang/Go/0.42.0/file/icon.png',
            download: 'https://open-vsx.org/api/golang/Go/0.42.0/file/golang.Go-0.42.0.vsix',
          },
          downloadCount: 15420,
          averageRating: 4.8,
        },
      ],
    };

    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockOpenVsxResponse,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.searchExtensions('golang', 10, 0);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.total).toBe(1);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].id).toBe('golang.Go');
    expect(result.extensions[0].downloadUrl).toContain('golang.Go-0.42.0.vsix');

    // Second search for identical query should hit cache without invoking fetch again
    const cachedResult = await service.searchExtensions('golang', 10, 0);
    expect(cachedResult.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('fetches extension item details', async () => {
    const mockItem = {
      name: 'python',
      namespace: 'ms-python',
      displayName: 'Python',
      version: '2024.1.0',
      description: 'Python language support',
      files: {
        download: 'https://open-vsx.org/api/ms-python/python/2024.1.0/file/ms-python.python-2024.1.0.vsix',
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockItem,
    });
    vi.stubGlobal('fetch', fetchMock);

    const item = await service.getExtensionDetails('ms-python', 'python');

    expect(item).not.toBeNull();
    expect(item?.id).toBe('ms-python.python');
    expect(item?.version).toBe('2024.1.0');

    vi.unstubAllGlobals();
  });
});
