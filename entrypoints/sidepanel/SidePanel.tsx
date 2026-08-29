import { useEffect, useState } from 'react';

import { mergeMealieCredentialsFromLocalIfNeeded } from '@/utils/storage';

type ShoppingStatus = { type: 'success' | 'error'; message: string };

export function SidePanel() {
    const [mealieServer, setMealieServer] = useState('');
    const [mealieApiToken, setMealieApiToken] = useState('');
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        chrome.storage.sync.get<StorageData>([...storageKeys], (syncData: StorageData) => {
            void chrome.runtime.lastError;
            mergeMealieCredentialsFromLocalIfNeeded(syncData, (data: StorageData) => {
                setMealieServer(data.mealieServer ?? '');
                setMealieApiToken(data.mealieApiToken ?? '');
                setLoaded(true);
            });
        });
    }, []);

    return (
        <div className="sidepanel">
            <header className="sidepanel-header">
                <h1>Add to Shopping List</h1>
            </header>
            {!loaded ? (
                <p className="sidepanel-empty">Loading…</p>
            ) : !mealieServer || !mealieApiToken ? (
                <p className="sidepanel-empty">
                    Connect your Mealie server from the extension popup first.
                </p>
            ) : (
                <ShoppingListFinder mealieServer={mealieServer} mealieApiToken={mealieApiToken} />
            )}
        </div>
    );
}

function ShoppingListFinder({
    mealieServer,
    mealieApiToken,
}: {
    mealieServer: string;
    mealieApiToken: string;
}) {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [results, setResults] = useState<RecipeSummary[]>([]);
    const [selectedRecipe, setSelectedRecipe] = useState<RecipeSummary | null>(null);
    const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
    const [selectedListId, setSelectedListId] = useState('');
    const [loadingLists, setLoadingLists] = useState(false);
    const [adding, setAdding] = useState(false);
    const [status, setStatus] = useState<ShoppingStatus | null>(null);

    const resetSelection = () => {
        setSelectedRecipe(null);
        setStatus(null);
    };

    const handleSearch = async () => {
        const trimmed = query.trim();
        if (!trimmed) return;

        setSearching(true);
        setSearched(false);
        setStatus(null);
        resetSelection();

        const matches = await searchRecipesByName(trimmed, mealieServer, mealieApiToken);

        setResults(matches);
        setSearched(true);
        setSearching(false);
    };

    const handleSelectRecipe = async (recipe: RecipeSummary) => {
        setSelectedRecipe(recipe);
        setStatus(null);

        if (lists) return;

        setLoadingLists(true);
        const fetched = await getShoppingLists(mealieServer, mealieApiToken);
        setLoadingLists(false);

        if (fetched === 'failure') {
            setStatus({ type: 'error', message: 'Could not load shopping lists.' });
            return;
        }

        setLists(fetched);
        const [firstList] = fetched;
        if (firstList) {
            setSelectedListId(firstList.id);
        }
    };

    const handleAddToList = async () => {
        if (!selectedRecipe || !selectedListId) return;

        setAdding(true);
        setStatus(null);
        const success = await addRecipeToShoppingList(
            selectedListId,
            selectedRecipe.id,
            mealieServer,
            mealieApiToken,
        );
        setAdding(false);

        const listName = lists?.find((list) => list.id === selectedListId)?.name ?? 'your list';
        setStatus(
            success
                ? { type: 'success', message: `Added "${selectedRecipe.name}" to ${listName}.` }
                : {
                      type: 'error',
                      message: 'Failed to add ingredients. Check the activity log for details.',
                  },
        );
    };

    return (
        <div>
            <div className="shopping-search-row">
                <input
                    type="text"
                    placeholder="Search recipes to add…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !searching && query.trim()) {
                            void handleSearch();
                        }
                    }}
                    autoFocus
                />
                <button
                    type="button"
                    onClick={() => void handleSearch()}
                    disabled={searching || !query.trim()}
                >
                    {searching ? 'Searching…' : 'Search'}
                </button>
            </div>

            {searched && results.length === 0 && (
                <p className="shopping-empty">No recipes found for &quot;{query.trim()}&quot;.</p>
            )}

            {results.length > 0 && !selectedRecipe && (
                <ul className="shopping-results">
                    {results.map((recipe) => (
                        <li key={recipe.id}>
                            <button type="button" onClick={() => void handleSelectRecipe(recipe)}>
                                {recipe.name}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {selectedRecipe && (
                <div className="shopping-selected">
                    <p>
                        Adding <strong>{selectedRecipe.name}</strong>
                    </p>
                    {loadingLists && <p>Loading your shopping lists…</p>}
                    {!loadingLists && lists && lists.length === 0 && (
                        <p className="shopping-empty">
                            No shopping lists found — create one in Mealie first.
                        </p>
                    )}
                    {!loadingLists && lists && lists.length > 0 && (
                        <>
                            <select
                                value={selectedListId}
                                onChange={(e) => setSelectedListId(e.target.value)}
                            >
                                {lists.map((list) => (
                                    <option key={list.id} value={list.id}>
                                        {list.name ?? 'Untitled list'}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => void handleAddToList()}
                                disabled={adding}
                            >
                                {adding ? 'Adding…' : 'Add to List'}
                            </button>
                        </>
                    )}
                    <button type="button" className="shopping-back" onClick={resetSelection}>
                        ← Back to results
                    </button>
                </div>
            )}

            {status && (
                <p className={status.type === 'success' ? 'shopping-success' : 'shopping-error'}>
                    {status.message}
                </p>
            )}
        </div>
    );
}
