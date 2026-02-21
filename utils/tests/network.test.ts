import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runCreateRecipe } from '../invoke';
import { RecipeCreateMode } from '../types/storageTypes';

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
    clearBadge: vi.fn(),
}));

const { showBadge } = await import('../badge');

vi.mock('../activity', async () => {
    const badge = await import('../badge');
    const storage = await import('../storage');

    return {
        beginActivity: vi.fn(),
        endActivity: vi.fn(async (resultBadge?: '✅' | '❌') => {
            if (resultBadge) {
                badge.showBadge(resultBadge, 4);
            } else {
                badge.clearBadge();
            }
            await storage.checkStorageAndUpdateBadge();
        }),
    };
});

vi.mock('../storage', () => ({
    checkStorageAndUpdateBadge: vi.fn(),
    detectionCache: new Map(),
    invalidateDetectionCacheForUrl: vi.fn(),
}));

vi.mock('../logging', () => ({
    logEvent: vi.fn(),
    sanitizeUrl: vi.fn((url: string) => url),
}));

const mockHtml = '<html><body>Recipe</body></html>';

const mockConfig = {
    createRecipeFromHTMLResult: 'success' as 'success' | 'failure',
    createRecipeFromURLResult: 'success' as 'success' | 'failure',
};

// Microtask checkpoint ensuring async badge updates complete before assertions.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock('../network', async () => {
    const actual = await vi.importActual<typeof import('../network')>('../network');

    return {
        ...actual,
        createRecipeFromHTML: vi.fn().mockImplementation(() => {
            return Promise.resolve(mockConfig.createRecipeFromHTMLResult);
        }),
        createRecipeFromURL: vi.fn().mockImplementation(() => {
            return Promise.resolve(mockConfig.createRecipeFromURLResult);
        }),
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.createRecipeFromHTMLResult = 'success';
    mockConfig.createRecipeFromURLResult = 'success';

    global.chrome = {
        storage: {
            sync: {
                get: vi.fn(),
            },
            local: {
                get: vi.fn(),
                set: vi.fn(),
                remove: vi.fn(),
            },
        },
        scripting: {
            executeScript: vi.fn().mockResolvedValue([
                {
                    result: mockHtml,
                },
            ]),
        },
        action: {
            setBadgeText: vi.fn(),
            setBadgeBackgroundColor: vi.fn(),
            setTitle: vi.fn(),
            openPopup: vi.fn(),
        },
        contextMenus: {
            update: vi.fn((_id, _props, callback) => callback?.()),
            create: vi.fn(),
            remove: vi.fn(),
        },
        runtime: {
            lastError: undefined,
        },
    } as unknown as typeof chrome;
});

describe('safeReadResponseText and formatErrorDetails edge cases', () => {
    it('should handle response with text() throwing error and fallback to json()', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            headers: { get: () => 'application/json' },
            text: vi.fn().mockRejectedValueOnce(new Error('text() failed')),
            json: vi.fn().mockResolvedValueOnce({ error: 'Server failure' }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('failure');
        consoleErrorSpy.mockRestore();
    });

    it('should handle response where both text() and json() throw', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            headers: { get: () => null },
            text: vi.fn().mockRejectedValueOnce(new Error('text() failed')),
            json: vi.fn().mockRejectedValueOnce(new Error('json() failed')),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('failure');
        consoleErrorSpy.mockRestore();
    });

    it('should handle response with json() returning non-string data', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ error: 'validation failed', code: 400 }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('failure');
        consoleErrorSpy.mockRestore();
    });

    it('should handle formatErrorDetails with invalid JSON in application/json response', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            headers: { get: () => 'application/json' },
            text: vi.fn().mockResolvedValueOnce('Not valid JSON{'),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('failure');
        consoleErrorSpy.mockRestore();
    });
});

describe('createRecipeFromHTML edge cases', () => {
    it('should handle successful response without json method', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'text/html' },
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromHTML(
            '<html>Recipe</html>',
            'https://mealie.local',
            'mock-token',
            'https://example.com',
        );

        expect(result).toBe('success');
    });

    it('should call response.json() when available on success', async () => {
        const jsonMock = vi.fn().mockResolvedValueOnce({ id: '456', name: 'HTML Recipe' });
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: jsonMock,
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromHTML(
            '<html>Recipe</html>',
            'https://mealie.local',
            'mock-token',
            'https://example.com',
        );

        expect(result).toBe('success');
        expect(jsonMock).toHaveBeenCalled();
    });

    it('should handle error response with missing statusText', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 404,
            headers: { get: () => null },
            text: vi.fn().mockResolvedValueOnce('Not Found'),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromHTML(
            '<html>Recipe</html>',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('failure');
        consoleErrorSpy.mockRestore();
    });
});

describe('createRecipeFromURL edge cases', () => {
    it('should handle successful response without json method', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'text/plain' },
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('success');
    });

    it('should call response.json() when available on success', async () => {
        const jsonMock = vi.fn().mockResolvedValueOnce({ id: '123', name: 'Recipe' });
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: jsonMock,
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(result).toBe('success');
        expect(jsonMock).toHaveBeenCalled();
    });

    it('should include includeTags and includeCategories in request body when provided', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
            true,
            true,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/url',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer mock-token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: 'https://example.com/recipe',
                    includeTags: true,
                    includeCategories: true,
                }),
            }),
        );
    });

    it('should default includeTags and includeCategories to false when not provided', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/url',
            expect.objectContaining({
                body: JSON.stringify({
                    url: 'https://example.com/recipe',
                    includeTags: false,
                    includeCategories: false,
                }),
            }),
        );
    });

    it('should support mixed values for includeTags and includeCategories', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-token',
            true,
            false,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/url',
            expect.objectContaining({
                body: JSON.stringify({
                    url: 'https://example.com/recipe',
                    includeTags: true,
                    includeCategories: false,
                }),
            }),
        );
    });
});

describe('createRecipeFromHTML with includeTags and includeCategories', () => {
    it('should include includeTags and includeCategories in request body when provided', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromHTML(
            '<html><body>Recipe</body></html>',
            'https://mealie.local',
            'mock-token',
            'https://example.com/recipe',
            true,
            true,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/html-or-json',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer mock-token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    data: '<html><body>Recipe</body></html>',
                    url: 'https://example.com/recipe',
                    includeTags: true,
                    includeCategories: true,
                }),
            }),
        );
    });

    it('should default includeTags and includeCategories to false when not provided', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromHTML(
            '<html><body>Recipe</body></html>',
            'https://mealie.local',
            'mock-token',
            'https://example.com/recipe',
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/html-or-json',
            expect.objectContaining({
                body: JSON.stringify({
                    data: '<html><body>Recipe</body></html>',
                    url: 'https://example.com/recipe',
                    includeTags: false,
                    includeCategories: false,
                }),
            }),
        );
    });

    it('should support mixed values for includeTags and includeCategories', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: vi.fn().mockResolvedValueOnce({ id: '123' }),
        });
        global.fetch = fetchMock;

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.createRecipeFromHTML(
            '<html><body>Recipe</body></html>',
            'https://mealie.local',
            'mock-token',
            'https://example.com/recipe',
            false,
            true,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/html-or-json',
            expect.objectContaining({
                body: JSON.stringify({
                    data: '<html><body>Recipe</body></html>',
                    url: 'https://example.com/recipe',
                    includeTags: false,
                    includeCategories: true,
                }),
            }),
        );
    });
});

describe('runCreateRecipe', () => {
    const mockTabId = 123;
    const mockUrl = 'https://example.com/recipe';
    const mockServer = 'https://mealie.local';
    const mockToken = 'mock-api-token';

    it('should show ❌ badge if mealieServer is missing', async () => {
        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieToken: mockToken,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
    });

    it('should show ❌ badge if mealieApiToken is missing', async () => {
        mockConfig.createRecipeFromHTMLResult = 'success';
        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
    });

    it('should call createRecipeFromURL by default when mealieServer and mealieApiToken are present', async () => {
        mockConfig.createRecipeFromURLResult = 'success';

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        await flushPromises();

        const { createRecipeFromURL, createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromURL).toHaveBeenCalledWith(
            mockUrl,
            mockServer,
            mockToken,
            true,
            true,
        );
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();

        const createRecipeFromURLMock = vi.mocked(createRecipeFromURL);
        const result = await createRecipeFromURLMock.mock.results[0].value;
        expect(result).toBe('success');
    });

    it("should call createRecipeFromHTML when recipeCreateMode is 'html'", async () => {
        mockConfig.createRecipeFromHTMLResult = 'success';

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: RecipeCreateMode.HTML,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromHTML, createRecipeFromURL } = await import('../network');
        expect(chrome.scripting.executeScript).toHaveBeenCalled();
        expect(createRecipeFromHTML).toHaveBeenCalledWith(
            mockHtml,
            mockServer,
            mockToken,
            mockUrl,
            true,
            true,
        );
        expect(createRecipeFromURL).not.toHaveBeenCalled();
    });

    it('should return failure if fetch response is not ok', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
            // Intentionally empty: this test exercises an error path.
        });

        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: false, // Simulate failure
            status: 500,
            json: async () => ({}),
        });
        global.fetch = fetchMock;

        // Import the real function (bypassing the mock)
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.createRecipeFromURL(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-api-token',
        );

        expect(result).toBe('failure');

        consoleErrorSpy.mockRestore();
    });

    it('should show ✅ badge if the script execution result is success', async () => {
        mockConfig.createRecipeFromURLResult = 'success';

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        // Wait for async badge update (microtask + tick)
        await flushPromises();

        expect(showBadge).toHaveBeenCalledWith('✅', 4);
    });

    it('should show ❌ badge if the script execution result is failure', async () => {
        mockConfig.createRecipeFromURLResult = 'failure';

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        // Wait for async badge update (microtask + tick)
        await flushPromises();

        expect(showBadge).toHaveBeenCalledWith('❌', 4);
    });

    it('should show ❌ badge if URL mode is selected but tab.url is missing', async () => {
        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: RecipeCreateMode.URL,
            }),
        );

        runCreateRecipe({ id: mockTabId } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromURL } = await import('../network');
        expect(createRecipeFromURL).not.toHaveBeenCalled();
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
    });

    it('should default to URL mode when stored recipeCreateMode is invalid', async () => {
        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: 'bogus',
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromURL, createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromURL).toHaveBeenCalledWith(
            mockUrl,
            mockServer,
            mockToken,
            true,
            true,
        );
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('should show ❌ badge if HTML mode is selected but tab.id is missing', async () => {
        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: RecipeCreateMode.HTML,
            }),
        );

        runCreateRecipe({ url: mockUrl } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
    });

    it('should show ❌ badge if getPageHTML returns null (executeScript throws)', async () => {
        chrome.scripting.executeScript = vi.fn().mockRejectedValueOnce(new Error('boom'));

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: RecipeCreateMode.HTML,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
    });

    it('should show ❌ badge if getPageHTML returns non-string result', async () => {
        chrome.scripting.executeScript = vi.fn().mockResolvedValueOnce([
            {
                result: 123,
            },
        ]);

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
                recipeCreateMode: RecipeCreateMode.HTML,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);
        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromHTML).not.toHaveBeenCalled();
        expect(showBadge).toHaveBeenCalledWith('❌', 4);
    });
});

describe('getUser', () => {
    const mockUrl = 'https://example.com';
    const mockToken = 'mock-api-token';
    const mockUser = { username: 'testUser' };

    it('should return the username if the API call is successful', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => mockUser,
        });

        const result = await getUser(mockUrl, mockToken);

        expect(result).toEqual(mockUser);
    });

    it('should calls fetch with correct url and headers', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => mockUser,
        });

        await getUser(mockUrl, mockToken);

        expect(fetch).toHaveBeenCalledWith(
            `${mockUrl}/api/users/self`,
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: `Bearer ${mockToken}`,
                    'Content-Type': 'application/json',
                }),
            }),
        );
    });

    it('should return an error message if the API returns a non-OK status', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => {
                return;
            },
        });

        const result = await getUser(mockUrl, mockToken);

        expect(result).toEqual({ errorMessage: 'Get User Failed - status: 401' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return generic error message for non-Error exceptions', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce('string error');

        const result = await getUser(mockUrl, mockToken);

        expect(result).toEqual({ errorMessage: 'Unknown error occurred' });
    });
});

describe('testScrapeUrl', () => {
    const mockUrl = 'http://recipe.org/mock-recipe';
    const mockServer = 'http://recipe.org/mock-server';
    const mockToken = 'mock-token';
    it('should return true if the API call is successful and contains a "name" field', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({ name: 'Mock Recipe' }),
        });

        const result = await testScrapeUrl(mockUrl, mockServer, mockToken);

        expect(result).toBe(true);
        expect(fetch).toHaveBeenCalledWith(
            `${mockServer}/api/recipes/test-scrape-url`,
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${mockToken}`,
                },
                body: JSON.stringify({ url: mockUrl }),
            }),
        );
    });

    it('should return false if the API call is successful but "name" field is missing', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });

        const result = await testScrapeUrl(mockUrl, mockServer, mockToken);

        expect(result).toBe(false);
    });

    it('should return false if the API returns a non-OK status', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 404,
            json: async () => ({}),
        });

        const result = await testScrapeUrl(mockUrl, mockServer, mockToken);

        expect(result).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return false if an error is thrown during the fetch call', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network Error'));

        const result = await testScrapeUrl(mockUrl, mockServer, mockToken);

        expect(result).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe('testScrapeUrlDetailed', () => {
    const mockUrl = 'https://example.com/recipe';
    const mockServer = 'https://mealie.local';
    const mockToken = 'mock-api-token';

    it("should return outcome 'recipe' when response JSON has a name", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => ({ name: 'Recipe Name' }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result).toEqual({ outcome: 'recipe', recipeName: 'Recipe Name' });
    });

    it("should return outcome 'http-error' with details when response is not ok", async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            headers: { get: () => 'application/json' },
            text: async () => JSON.stringify({ detail: 'Internal Server Error' }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('http-error');
        if (result.outcome === 'http-error') {
            expect(result.status).toBe(500);
            expect(result.details).toContain('Internal Server Error');
        }
    });

    it("should return outcome 'timeout' when fetch aborts", async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken, {
            timeoutMs: 1,
        });

        expect(result.outcome).toBe('timeout');
    });

    it('should handle missing text/json methods on response', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'text/plain' },
            // No text or json methods
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('not-recipe');
    });

    it('should handle response with only json method returning string', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => '{"name":"Recipe"}',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('recipe');
    });

    it('should handle non-JSON response text', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'text/html' },
            text: async () => '<html>Invalid JSON</html>',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('not-recipe');
    });

    it('should handle error responses with JSON formatting', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 400,
            headers: { get: () => 'application/json' },
            text: async () => '{"error":"Bad Request","details":"Invalid URL"}',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('http-error');
        if (result.outcome === 'http-error') {
            expect(result.details).toContain('Bad Request');
            // Should be formatted as pretty JSON
            expect(result.details).toContain('\n');
        }
    });

    it('should handle error responses with non-JSON content type', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
            headers: { get: () => 'text/plain' },
            text: async () => 'Internal Server Error',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('http-error');
        if (result.outcome === 'http-error') {
            expect(result.details).toBe('Internal Server Error');
        }
    });

    it('should handle error with empty response text', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 404,
            headers: { get: () => null },
            text: async () => '',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('http-error');
        if (result.outcome === 'http-error') {
            expect(result.details).toBeUndefined();
        }
    });

    it('should handle non-Error exceptions', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce('string error');

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('error');
        if (result.outcome === 'error') {
            expect(result.message).toBe('Unknown error');
        }
    });

    it('should return recipeName when recipe detected', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => '{"name":"Chicken Carbonara"}',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('recipe');
        if (result.outcome === 'recipe') {
            expect(result.recipeName).toBe('Chicken Carbonara');
        }
    });

    it('should not return recipeName when name is not a string', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            text: async () => '{"name":123}',
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.testScrapeUrlDetailed(mockUrl, mockServer, mockToken);

        expect(result.outcome).toBe('not-recipe');
    });
});

describe('normalizeUrl', () => {
    it('should remove www prefix', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl('https://www.example.com/recipe');
        expect(normalized).toBe('https://example.com/recipe');
    });

    it('should remove trailing slash', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl('https://example.com/recipe/');
        expect(normalized).toBe('https://example.com/recipe');
    });

    it('should preserve root trailing slash', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl('https://example.com/');
        expect(normalized).toBe('https://example.com/');
    });

    it('should remove tracking query parameters', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl(
            'https://example.com/recipe?utm_source=twitter&utm_medium=social&fbclid=123',
        );
        expect(normalized).toBe('https://example.com/recipe');
    });

    it('should preserve non-tracking query parameters', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl(
            'https://example.com/recipe?id=123&utm_source=twitter',
        );
        expect(normalized).toBe('https://example.com/recipe?id=123');
    });

    it('should remove URL fragments', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl('https://example.com/recipe#ingredients');
        expect(normalized).toBe('https://example.com/recipe');
    });

    it('should lowercase hostname', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl('https://EXAMPLE.COM/recipe');
        expect(normalized).toBe('https://example.com/recipe');
    });

    it('should handle multiple normalizations at once', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const normalized = actual.normalizeUrl(
            'https://WWW.Example.COM/recipe/?utm_source=email&id=456#section',
        );
        expect(normalized).toBe('https://example.com/recipe?id=456');
    });

    it('should return original URL if parsing fails', async () => {
        const actual = await vi.importActual<typeof import('../network')>('../network');
        const invalidUrl = 'not-a-valid-url';
        const normalized = actual.normalizeUrl(invalidUrl);
        expect(normalized).toBe(invalidUrl);
    });
});

describe('findRecipeByURL', () => {
    const mockUrl = 'https://example.com/recipe';
    const mockServer = 'https://mealie.example.com';
    const mockToken = 'test-token';

    it('should find exact URL match', async () => {
        const mockRecipe = { id: '123', name: 'Test Recipe', slug: 'test-recipe', orgURL: mockUrl };
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: [mockRecipe],
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.findRecipeByURL(mockUrl, mockServer, mockToken);

        expect(result).toEqual(mockRecipe);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/recipes'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                }),
            }),
        );
    });

    it('should return null when no match found', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: [],
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.findRecipeByURL(mockUrl, mockServer, mockToken);

        expect(result).toBeNull();
    });

    it('should return null on HTTP error', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.findRecipeByURL(mockUrl, mockServer, mockToken);

        expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.findRecipeByURL(mockUrl, mockServer, mockToken);

        expect(result).toBeNull();
    });

    it('should normalize URL before querying', async () => {
        const normalizedUrl = 'https://example.com/recipe';
        const mockRecipe = {
            id: '123',
            name: 'Test Recipe',
            slug: 'test-recipe',
            orgURL: normalizedUrl,
        };
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: [mockRecipe],
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.findRecipeByURL(
            'https://www.example.com/recipe/?utm_source=test',
            mockServer,
            mockToken,
        );

        // Should find the recipe because URLs are normalized and compared client-side
        expect(result).toEqual(mockRecipe);
        // Verify the fetch call uses the new approach (no queryFilter)
        const callArgs = vi.mocked(global.fetch).mock.calls[0];
        expect(callArgs[0]).toContain('perPage=100');
        expect(callArgs[0]).toContain('orderBy=dateUpdated');
        expect(callArgs[0]).not.toContain('queryFilter');
    });
});

describe('searchRecipesByName', () => {
    const mockName = 'Chicken Carbonara';
    const mockServer = 'https://mealie.example.com';
    const mockToken = 'test-token';

    it('should find multiple recipe matches', async () => {
        const mockRecipes = [
            { id: '1', name: 'Chicken Carbonara', slug: 'chicken-carbonara' },
            { id: '2', name: 'Carbonara Pasta', slug: 'carbonara-pasta' },
            { id: '3', name: 'Classic Carbonara', slug: 'classic-carbonara' },
        ];
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: mockRecipes,
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.searchRecipesByName(mockName, mockServer, mockToken);

        expect(result).toEqual(mockRecipes);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/recipes'),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-token',
                }),
            }),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('search='),
            expect.any(Object),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('perPage=5'),
            expect.any(Object),
        );
    });

    it('should return empty array when no matches found', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: [],
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.searchRecipesByName(mockName, mockServer, mockToken);

        expect(result).toEqual([]);
    });

    it('should return empty array on HTTP error', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: false,
            status: 400,
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.searchRecipesByName(mockName, mockServer, mockToken);

        expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
        global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.searchRecipesByName(mockName, mockServer, mockToken);

        expect(result).toEqual([]);
    });

    it('should handle missing items in response', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({}),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        const result = await actual.searchRecipesByName(mockName, mockServer, mockToken);

        expect(result).toEqual([]);
    });

    it('should URL encode recipe name', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    items: [],
                }),
        });

        const actual = await vi.importActual<typeof import('../network')>('../network');
        await actual.searchRecipesByName('Chicken & Pasta', mockServer, mockToken);

        // Verify the fetch call contains the encoded name (searchParams uses + for spaces)
        const callArgs = vi.mocked(global.fetch).mock.calls[0];
        expect(callArgs[0]).toContain('search=Chicken');
        expect(callArgs[0]).toContain('Pasta');
        expect(callArgs[0]).toContain('%26'); // & is encoded as %26
    });
});
