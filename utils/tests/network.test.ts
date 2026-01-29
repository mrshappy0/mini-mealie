import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
}));

const mockHtml = '<html><body>Recipe</body></html>';

const mockConfig = {
    createRecipeFromHTMLResult: 'success' as 'success' | 'failure',
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
    };
});

beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.createRecipeFromHTMLResult = 'success';

    global.chrome = {
        storage: {
            sync: {
                get: vi.fn(),
            },
        },
        scripting: {
            executeScript: vi.fn((_, callback) => {
                callback?.([
                    {
                        result: mockHtml,
                    },
                ] as unknown as chrome.scripting.InjectionResult[]);
            }),
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

    it('should call createRecipeFromHTML when mealieServer and mealieApiToken are present', async () => {
        mockConfig.createRecipeFromHTMLResult = 'success';

        chrome.storage.sync.get = vi.fn().mockImplementation((_keys, callback) =>
            callback({
                mealieServer: mockServer,
                mealieApiToken: mockToken,
            }),
        );

        runCreateRecipe({ id: mockTabId, url: mockUrl } as chrome.tabs.Tab);

        await flushPromises();

        const { createRecipeFromHTML } = await import('../network');
        expect(createRecipeFromHTML).toHaveBeenCalledWith(mockHtml, mockServer, mockToken);
        const result = await (createRecipeFromHTML as vi.Mock).mock.results[0].value;
        expect(result).toBe('success');
    });

    it('should return failure if fetch response is not ok', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: false, // Simulate failure
            status: 500,
            json: async () => ({}),
        });
        global.fetch = fetchMock;

        // Import the real function (bypassing the mock)
        const { createRecipe } = await vi.importActual<typeof import('../network')>('../network');

        const result = await createRecipe(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-api-token',
        );

        expect(result).toBe('failure');
    });

    it('should show ✅ badge if the script execution result is success', async () => {
        mockConfig.createRecipeFromHTMLResult = 'success';

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
        mockConfig.createRecipeFromHTMLResult = 'failure';

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
