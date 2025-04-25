import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../badge', () => ({
    showBadge: vi.fn(),
}));

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

describe('runCreateRecipe', () => {
    const mockTabId = 123;
    const mockUrl = 'https://example.com/recipe';
    const mockServer = 'https://mealie.local';
    const mockToken = 'mock-api-token';
    const mockLadderDisabled = false;

    it('should show ❌ badge if mealieServer is missing', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | boolean | undefined>) => void) =>
                callback({ mealieApiToken: mockToken }),
        );

        runCreateRecipe(mockUrl, mockTabId);

        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('should show ❌ badge if mealieApiToken is missing', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | undefined>) => void) =>
                callback({ mealieServer: mockServer }),
        );

        runCreateRecipe(mockUrl, mockTabId);

        expect(showBadge).toHaveBeenCalledWith('❌', 4);
        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('should execute script when both mealieServer and mealieApiToken are present', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | boolean>) => void) =>
                callback({
                    mealieServer: mockServer,
                    mealieApiToken: mockToken,
                    ladderEnabled: mockLadderDisabled,
                }),
        );

        runCreateRecipe(mockUrl, mockTabId);

        expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
            {
                target: { tabId: mockTabId },
                func: expect.any(Function),
                args: [mockUrl, mockServer, mockToken, mockLadderDisabled],
            },
            expect.any(Function),
        );
    });

    it('should prepend ladder URL when ladderEnabled is true', () => {
        vi.mocked(chrome.storage.sync.get).mockImplementation(
            (_keys, callback: (items: Record<string, string | boolean>) => void) =>
                callback({
                    mealieServer: mockServer,
                    mealieApiToken: mockToken,
                    ladderEnabled: !mockLadderDisabled,
                }),
        );

        runCreateRecipe(mockUrl, mockTabId);

        expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
            {
                target: { tabId: mockTabId },
                func: expect.any(Function),
                args: [mockUrl, mockServer, mockToken, true],
            },
            expect.any(Function),
        );
    });

    it('should prepend ladder URL and return success when ladderEnabled is true', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
        });
        global.fetch = fetchMock;

        const result = await createRecipe(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-api-token',
            true,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'https://mealie.local/api/recipes/create/url',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer mock-api-token',
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                    url: 'https://13ft.wasimaster.me/https://example.com/recipe',
                }),
            }),
        );

        // Assert function returned success
        expect(result).toBe('success');
    });

    it('should return failure if fetch response is not ok', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            ok: false, // Simulate failure
            status: 500,
            json: async () => ({}),
        });
        global.fetch = fetchMock;

        const result = await createRecipe(
            'https://example.com/recipe',
            'https://mealie.local',
            'mock-api-token',
            true,
        );

        // Assert failure
        expect(result).toBe('failure');
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

        runCreateRecipe(mockUrl, mockTabId);

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

        runCreateRecipe(mockUrl, mockTabId);

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
