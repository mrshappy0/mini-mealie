import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
}));

// Mock Chrome API
beforeEach(() => {
    global.chrome = {
        storage: {
            sync: {
                get: vi.fn(),
            },
        },
        scripting: {
            executeScript: vi.fn(),
        },
    } as unknown as typeof chrome;

    vi.clearAllMocks();
});

describe('scrapeRecipe', () => {
    const mockTabId = 123;
    const mockUrl = 'https://example.com/recipe';
    const mockServer = 'https://mealie.local';
    const mockToken = 'mock-api-token';

    it('should show ❌ badge if mealieServer is missing', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | undefined>) => void) =>
                callback({ mealieApiToken: mockToken }), // Missing mealieServer
        );

        scrapeRecipe(mockUrl, mockTabId);

        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('should show ❌ badge if mealieApiToken is missing', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | undefined>) => void) =>
                callback({ mealieServer: mockServer }), // Missing mealieApiToken
        );

        scrapeRecipe(mockUrl, mockTabId);

        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('should execute script when both mealieServer and mealieApiToken are present', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) =>
                callback({
                    mealieServer: mockServer,
                    mealieApiToken: mockToken,
                }),
        );

        scrapeRecipe(mockUrl, mockTabId);

        expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
            {
                target: { tabId: mockTabId },
                func: expect.any(Function),
                args: [mockUrl, mockServer, mockToken],
            },
            expect.any(Function),
        );
    });

    it('should show ✅ badge if the script execution result is success', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) =>
                callback({
                    mealieServer: mockServer,
                    mealieApiToken: mockToken,
                }),
        );

        vi.mocked(chrome.scripting.executeScript).mockImplementation(
            (
                _options,
                callback: (
                    result: Array<{
                        result: string;
                        frameId: number;
                        documentId: string;
                    }>,
                ) => void,
            ) => {
                callback([{ result: 'success', frameId: 0, documentId: '1234' }]);
            },
        );

        scrapeRecipe(mockUrl, mockTabId);

        expect(showBadge).toHaveBeenCalledWith('✅', 4);
    });

    it('should show ❌ badge if the script execution result is failure', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string>) => void) =>
                callback({
                    mealieServer: mockServer,
                    mealieApiToken: mockToken,
                }),
        );

        vi.mocked(chrome.scripting.executeScript).mockImplementation(
            (
                _options,
                callback: (
                    result: Array<{
                        result: string;
                        frameId: number;
                        documentId: string;
                    }>,
                ) => void,
            ) => {
                callback([{ result: 'failure', frameId: 0, documentId: '5678' }]);
            },
        );

        scrapeRecipe(mockUrl, mockTabId);

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

        expect(result).toEqual({ errorMessage: 'Verification failed! status: 401' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
