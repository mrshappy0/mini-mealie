import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeCreateMode } from '../types/storageTypes';

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
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
        },
        scripting: {
            executeScript: vi.fn().mockResolvedValue([
                {
                    result: mockHtml,
                },
            ]),
        },
        runtime: {
            lastError: undefined,
        },
    } as unknown as typeof chrome;
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
        expect(createRecipeFromURL).toHaveBeenCalledWith(mockUrl, mockServer, mockToken);
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
        expect(createRecipeFromHTML).toHaveBeenCalledWith(mockHtml, mockServer, mockToken, mockUrl);
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
        expect(createRecipeFromURL).toHaveBeenCalledWith(mockUrl, mockServer, mockToken);
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

        expect(result).toEqual({ outcome: 'recipe' });
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
});
