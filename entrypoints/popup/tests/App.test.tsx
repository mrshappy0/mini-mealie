import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addRecipeToShoppingList,
    getShoppingLists,
    getUser,
    searchRecipesByName,
} from '@/utils/network';
import { checkStorageAndUpdateBadge } from '@/utils/storage';

import App from '../App';

vi.mock('@/utils/network', () => ({
    getUser: vi.fn(),
    searchRecipesByName: vi.fn(),
    getShoppingLists: vi.fn(),
    addRecipeToShoppingList: vi.fn(),
}));

vi.mock('@/utils/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/utils/storage')>();
    return {
        ...actual,
        checkStorageAndUpdateBadge: vi.fn(() => Promise.resolve()),
    };
});

const mockUser = {
    username: 'chef',
    admin: false,
    email: 'chef@example.com',
    fullName: 'Chef Chef',
    group: 'group',
    groupSlug: 'group-slug',
    household: 'household',
};

describe('App', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('initial load', () => {
        it('shows the disconnected connect form when no credentials are stored', async () => {
            render(<App />);

            expect(
                await screen.findByPlaceholderText('Enter Mealie Server URL'),
            ).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Enter Mealie API Token')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /connect mealie/i })).toBeDisabled();
        });

        it('shows the connected view when credentials are already stored', async () => {
            await chrome.storage.sync.set({
                mealieServer: 'https://mealie.example.com',
                mealieApiToken: 'token123',
                mealieUsername: 'chef',
            });

            render(<App />);

            expect(await screen.findByText(/your server is connected/i)).toBeInTheDocument();
            expect(screen.getByText('chef')).toBeInTheDocument();
        });

        it('applies a suggested HTML mode and clears the flag from storage', async () => {
            await chrome.storage.sync.set({
                mealieServer: 'https://mealie.example.com',
                mealieApiToken: 'token123',
                mealieUsername: 'chef',
                recipeCreateMode: 'url',
            });
            await chrome.storage.local.set({ suggestHtmlMode: true });

            render(<App />);

            const htmlRadio = await screen.findByRole('radio', { name: /HTML/i });
            await waitFor(() => expect(htmlRadio).toBeChecked());
            await waitFor(async () => {
                const local = await chrome.storage.local.get('suggestHtmlMode');
                expect(local.suggestHtmlMode).toBeUndefined();
            });
        });

        it('reacts to external storage changes (e.g. context menu switching mode)', async () => {
            await chrome.storage.sync.set({
                mealieServer: 'https://mealie.example.com',
                mealieApiToken: 'token123',
                mealieUsername: 'chef',
                recipeCreateMode: 'url',
            });

            render(<App />);

            const urlRadio = await screen.findByRole('radio', { name: /URL/i });
            await waitFor(() => expect(urlRadio).toBeChecked());

            await chrome.storage.sync.set({ recipeCreateMode: 'html' });

            const htmlRadio = screen.getByRole('radio', { name: /HTML/i });
            await waitFor(() => expect(htmlRadio).toBeChecked());
        });
    });

    describe('saveSettings', () => {
        it('keeps the connect button disabled until both server and token are present', async () => {
            const user = userEvent.setup();
            render(<App />);

            const connectButton = await screen.findByRole('button', { name: /connect mealie/i });
            expect(connectButton).toBeDisabled();

            const serverInput = screen.getByPlaceholderText('Enter Mealie Server URL');
            await user.type(serverInput, 'mealie.example.com');
            expect(connectButton).toBeDisabled();

            const tokenInput = screen.getByPlaceholderText('Enter Mealie API Token');
            await user.type(tokenInput, 'token123');
            expect(connectButton).toBeEnabled();
        });

        it('connects successfully, persists credentials, and refreshes the badge/menu', async () => {
            vi.mocked(getUser).mockResolvedValue(mockUser);
            const user = userEvent.setup();
            render(<App />);

            const serverInput = await screen.findByPlaceholderText('Enter Mealie Server URL');
            await user.type(serverInput, 'mealie.example.com');
            const tokenInput = screen.getByPlaceholderText('Enter Mealie API Token');
            await user.type(tokenInput, 'token123');

            const connectButton = screen.getByRole('button', { name: /connect mealie/i });
            await waitFor(() => expect(connectButton).toBeEnabled());
            await user.click(connectButton);

            expect(await screen.findByText(/your server is connected/i)).toBeInTheDocument();
            expect(screen.getByText('chef')).toBeInTheDocument();

            const stored = await chrome.storage.sync.get([
                'mealieServer',
                'mealieApiToken',
                'mealieUsername',
            ]);
            expect(stored.mealieServer).toBe('https://mealie.example.com');
            expect(stored.mealieApiToken).toBe('token123');
            expect(stored.mealieUsername).toBe('chef');
            expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
        });

        it('shows the connection error message when getUser fails', async () => {
            vi.mocked(getUser).mockResolvedValue({ errorMessage: 'Bad token' });
            const user = userEvent.setup();
            render(<App />);

            const serverInput = await screen.findByPlaceholderText('Enter Mealie Server URL');
            await user.type(serverInput, 'mealie.example.com');
            const tokenInput = screen.getByPlaceholderText('Enter Mealie API Token');
            await user.type(tokenInput, 'bad-token');

            const connectButton = screen.getByRole('button', { name: /connect mealie/i });
            await waitFor(() => expect(connectButton).toBeEnabled());
            await user.click(connectButton);

            expect(await screen.findByText('Could not connect')).toBeInTheDocument();
            expect(screen.getByText('Bad token')).toBeInTheDocument();
            // Should re-enable the form for another attempt rather than getting stuck.
            expect(connectButton).toBeEnabled();
        });

        it('falls back to a generic error message when the failure has no errorMessage', async () => {
            // @ts-expect-error - exercising the defensive fallback branch
            vi.mocked(getUser).mockResolvedValue({});
            const user = userEvent.setup();
            render(<App />);

            const serverInput = await screen.findByPlaceholderText('Enter Mealie Server URL');
            await user.type(serverInput, 'mealie.example.com');
            const tokenInput = screen.getByPlaceholderText('Enter Mealie API Token');
            await user.type(tokenInput, 'bad-token');
            await user.click(screen.getByRole('button', { name: /connect mealie/i }));

            expect(await screen.findByText('Connection failed.')).toBeInTheDocument();
        });
    });

    describe('protocol toggle', () => {
        it('flips between https and http and rewrites the current input value', async () => {
            const user = userEvent.setup();
            const { container } = render(<App />);

            const serverInput = await screen.findByPlaceholderText('Enter Mealie Server URL');
            await user.type(serverInput, 'mealie.example.com');
            expect(serverInput).toHaveValue('https://mealie.example.com');

            const toggle = container.querySelector<HTMLInputElement>('.toggle-switch input')!;
            await user.click(toggle);

            expect(serverInput).toHaveValue('http://mealie.example.com');
        });
    });

    describe('connected settings', () => {
        beforeEach(async () => {
            await chrome.storage.sync.set({
                mealieServer: 'https://mealie.example.com',
                mealieApiToken: 'token123',
                mealieUsername: 'chef',
            });
        });

        it('toggles import tags/categories/open-after-import and persists each independently', async () => {
            const user = userEvent.setup();
            render(<App />);

            const tagsCheckbox = await screen.findByRole('checkbox', {
                name: /import tags from recipe/i,
            });
            const categoriesCheckbox = screen.getByRole('checkbox', {
                name: /import categories from recipe/i,
            });
            const openAfterCheckbox = screen.getByRole('checkbox', {
                name: /open recipe after import/i,
            });

            expect(tagsCheckbox).toBeChecked();
            expect(categoriesCheckbox).toBeChecked();
            expect(openAfterCheckbox).not.toBeChecked();

            await user.click(tagsCheckbox);
            await user.click(openAfterCheckbox);

            await waitFor(async () => {
                const stored = await chrome.storage.sync.get(['importTags', 'openAfterImport']);
                expect(stored.importTags).toBe(false);
                expect(stored.openAfterImport).toBe(true);
            });
        });

        it('switches recipe creation mode and triggers a badge/menu refresh', async () => {
            const user = userEvent.setup();
            render(<App />);

            const htmlRadio = await screen.findByRole('radio', { name: /HTML/i });
            await user.click(htmlRadio);

            await waitFor(async () => {
                const stored = await chrome.storage.sync.get('recipeCreateMode');
                expect(stored.recipeCreateMode).toBe('html');
            });
            expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
        });

        it('defaults to automatic scraping mode', async () => {
            render(<App />);

            const automaticRadio = await screen.findByRole('radio', { name: /Automatic/i });
            const manualRadio = screen.getByRole('radio', { name: /Manual/i });
            expect(automaticRadio).toBeChecked();
            expect(manualRadio).not.toBeChecked();
        });

        it('switches to manual scraping mode and triggers a badge/menu refresh', async () => {
            const user = userEvent.setup();
            render(<App />);

            const manualRadio = await screen.findByRole('radio', { name: /Manual/i });
            await user.click(manualRadio);

            expect(manualRadio).toBeChecked();
            await waitFor(async () => {
                const stored = await chrome.storage.sync.get('autoScrapeMode');
                expect(stored.autoScrapeMode).toBe('manual');
            });
            expect(checkStorageAndUpdateBadge).toHaveBeenCalled();
        });

        it('reacts to external autoScrapeMode storage changes', async () => {
            render(<App />);

            const automaticRadio = await screen.findByRole('radio', { name: /Automatic/i });
            await waitFor(() => expect(automaticRadio).toBeChecked());

            await chrome.storage.sync.set({ autoScrapeMode: 'manual' });

            const manualRadio = screen.getByRole('radio', { name: /Manual/i });
            await waitFor(() => expect(manualRadio).toBeChecked());
        });

        it('disconnects and resets local state back to the connect form', async () => {
            const user = userEvent.setup();
            render(<App />);

            const disconnectButton = await screen.findByRole('button', {
                name: /disconnect server/i,
            });
            await user.click(disconnectButton);

            expect(
                await screen.findByPlaceholderText('Enter Mealie Server URL'),
            ).toBeInTheDocument();

            const stored = await chrome.storage.sync.get([
                'mealieServer',
                'mealieApiToken',
                'mealieUsername',
            ]);
            expect(stored.mealieServer).toBeUndefined();
            expect(stored.mealieApiToken).toBeUndefined();
            expect(stored.mealieUsername).toBeUndefined();
        });
    });

    describe('ShoppingListQuickAdd', () => {
        beforeEach(async () => {
            await chrome.storage.sync.set({
                mealieServer: 'https://mealie.example.com',
                mealieApiToken: 'token123',
                mealieUsername: 'chef',
            });
        });

        it('is collapsed by default and expands on click', async () => {
            const user = userEvent.setup();
            render(<App />);

            const toggle = await screen.findByRole('button', {
                name: /add recipe to shopping list/i,
            });
            expect(screen.queryByPlaceholderText('Search your recipes…')).not.toBeInTheDocument();

            await user.click(toggle);

            expect(screen.getByPlaceholderText('Search your recipes…')).toBeInTheDocument();
        });

        it('searches, selects a recipe, and adds it to the chosen shopping list', async () => {
            vi.mocked(searchRecipesByName).mockResolvedValue([
                { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
            ]);
            vi.mocked(getShoppingLists).mockResolvedValue([
                { id: 'list-1', name: 'Groceries' },
                { id: 'list-2', name: 'Costco' },
            ]);
            vi.mocked(addRecipeToShoppingList).mockResolvedValue(true);

            const user = userEvent.setup();
            render(<App />);

            await user.click(
                await screen.findByRole('button', { name: /add recipe to shopping list/i }),
            );
            await user.type(screen.getByPlaceholderText('Search your recipes…'), 'Chicken');
            await user.click(screen.getByRole('button', { name: /^search$/i }));

            expect(searchRecipesByName).toHaveBeenCalledWith(
                'Chicken',
                'https://mealie.example.com',
                'token123',
            );

            const resultButton = await screen.findByRole('button', { name: 'Chicken Soup' });
            await user.click(resultButton);

            expect(getShoppingLists).toHaveBeenCalledWith('https://mealie.example.com', 'token123');

            const listSelect = await screen.findByRole('combobox');
            expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
            expect(screen.getByRole('option', { name: 'Costco' })).toBeInTheDocument();
            await user.selectOptions(listSelect, 'list-2');

            await user.click(screen.getByRole('button', { name: /add to list/i }));

            expect(addRecipeToShoppingList).toHaveBeenCalledWith(
                'list-2',
                'recipe-1',
                'https://mealie.example.com',
                'token123',
            );
            expect(await screen.findByText(/added "chicken soup" to costco/i)).toBeInTheDocument();
        });

        it('shows an empty state when no recipes match the search', async () => {
            vi.mocked(searchRecipesByName).mockResolvedValue([]);

            const user = userEvent.setup();
            render(<App />);

            await user.click(
                await screen.findByRole('button', { name: /add recipe to shopping list/i }),
            );
            await user.type(screen.getByPlaceholderText('Search your recipes…'), 'Nonexistent');
            await user.click(screen.getByRole('button', { name: /^search$/i }));

            expect(
                await screen.findByText(/no recipes found for "nonexistent"/i),
            ).toBeInTheDocument();
        });

        it('shows an error message when adding to the list fails', async () => {
            vi.mocked(searchRecipesByName).mockResolvedValue([
                { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
            ]);
            vi.mocked(getShoppingLists).mockResolvedValue([{ id: 'list-1', name: 'Groceries' }]);
            vi.mocked(addRecipeToShoppingList).mockResolvedValue(false);

            const user = userEvent.setup();
            render(<App />);

            await user.click(
                await screen.findByRole('button', { name: /add recipe to shopping list/i }),
            );
            await user.type(screen.getByPlaceholderText('Search your recipes…'), 'Chicken');
            await user.click(screen.getByRole('button', { name: /^search$/i }));
            await user.click(await screen.findByRole('button', { name: 'Chicken Soup' }));
            await user.click(await screen.findByRole('button', { name: /add to list/i }));

            expect(await screen.findByText(/failed to add ingredients/i)).toBeInTheDocument();
        });
    });

    describe('ActivityLog', () => {
        it('opens the logs page in a new tab', async () => {
            const createTab = vi.spyOn(chrome.tabs, 'create');
            const user = userEvent.setup();
            render(<App />);

            const link = await screen.findByRole('button', { name: /open activity log/i });
            await user.click(link);

            expect(createTab).toHaveBeenCalledWith(
                expect.objectContaining({ url: expect.stringContaining('logs.html') }),
            );
        });
    });
});
