import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addRecipeToShoppingList, getShoppingLists, searchRecipesByName } from '@/utils/network';

import { SidePanel } from '../SidePanel';

vi.mock('@/utils/network', () => ({
    searchRecipesByName: vi.fn(),
    getShoppingLists: vi.fn(),
    addRecipeToShoppingList: vi.fn(),
}));

describe('SidePanel', () => {
    beforeEach(() => {
        fakeBrowser.reset();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prompts to connect when no credentials are stored', async () => {
        render(<SidePanel />);

        expect(
            await screen.findByText(/connect your mealie server from the extension popup first/i),
        ).toBeInTheDocument();
    });

    it('searches, selects a recipe, and adds it to the chosen shopping list', async () => {
        await chrome.storage.sync.set({
            mealieServer: 'https://mealie.example.com',
            mealieApiToken: 'token123',
        });
        vi.mocked(searchRecipesByName).mockResolvedValue([
            { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
        ]);
        vi.mocked(getShoppingLists).mockResolvedValue([
            { id: 'list-1', name: 'Groceries' },
            { id: 'list-2', name: 'Costco' },
        ]);
        vi.mocked(addRecipeToShoppingList).mockResolvedValue(true);

        const user = userEvent.setup();
        render(<SidePanel />);

        const searchInput = await screen.findByPlaceholderText('Search your recipes…');
        await user.type(searchInput, 'Chicken');
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
        await chrome.storage.sync.set({
            mealieServer: 'https://mealie.example.com',
            mealieApiToken: 'token123',
        });
        vi.mocked(searchRecipesByName).mockResolvedValue([]);

        const user = userEvent.setup();
        render(<SidePanel />);

        const searchInput = await screen.findByPlaceholderText('Search your recipes…');
        await user.type(searchInput, 'Nonexistent');
        await user.click(screen.getByRole('button', { name: /^search$/i }));

        expect(await screen.findByText(/no recipes found for "nonexistent"/i)).toBeInTheDocument();
    });

    it('shows an error message when adding to the list fails', async () => {
        await chrome.storage.sync.set({
            mealieServer: 'https://mealie.example.com',
            mealieApiToken: 'token123',
        });
        vi.mocked(searchRecipesByName).mockResolvedValue([
            { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
        ]);
        vi.mocked(getShoppingLists).mockResolvedValue([{ id: 'list-1', name: 'Groceries' }]);
        vi.mocked(addRecipeToShoppingList).mockResolvedValue(false);

        const user = userEvent.setup();
        render(<SidePanel />);

        const searchInput = await screen.findByPlaceholderText('Search your recipes…');
        await user.type(searchInput, 'Chicken');
        await user.click(screen.getByRole('button', { name: /^search$/i }));
        await user.click(await screen.findByRole('button', { name: 'Chicken Soup' }));
        await user.click(await screen.findByRole('button', { name: /add to list/i }));

        expect(await screen.findByText(/failed to add ingredients/i)).toBeInTheDocument();
    });

    it('shows an error when shopping lists fail to load', async () => {
        await chrome.storage.sync.set({
            mealieServer: 'https://mealie.example.com',
            mealieApiToken: 'token123',
        });
        vi.mocked(searchRecipesByName).mockResolvedValue([
            { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
        ]);
        vi.mocked(getShoppingLists).mockResolvedValue('failure');

        const user = userEvent.setup();
        render(<SidePanel />);

        const searchInput = await screen.findByPlaceholderText('Search your recipes…');
        await user.type(searchInput, 'Chicken');
        await user.click(screen.getByRole('button', { name: /^search$/i }));
        await user.click(await screen.findByRole('button', { name: 'Chicken Soup' }));

        expect(await screen.findByText(/could not load shopping lists/i)).toBeInTheDocument();
    });

    it('lets the user go back to results after selecting a recipe', async () => {
        await chrome.storage.sync.set({
            mealieServer: 'https://mealie.example.com',
            mealieApiToken: 'token123',
        });
        vi.mocked(searchRecipesByName).mockResolvedValue([
            { id: 'recipe-1', name: 'Chicken Soup', slug: 'chicken-soup' },
            { id: 'recipe-2', name: 'Beef Stew', slug: 'beef-stew' },
        ]);
        vi.mocked(getShoppingLists).mockResolvedValue([{ id: 'list-1', name: 'Groceries' }]);

        const user = userEvent.setup();
        render(<SidePanel />);

        const searchInput = await screen.findByPlaceholderText('Search your recipes…');
        await user.type(searchInput, 'Chicken');
        await user.click(screen.getByRole('button', { name: /^search$/i }));
        await user.click(await screen.findByRole('button', { name: 'Chicken Soup' }));

        await user.click(await screen.findByRole('button', { name: /back to results/i }));

        expect(screen.getByRole('button', { name: 'Chicken Soup' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Beef Stew' })).toBeInTheDocument();
    });
});
