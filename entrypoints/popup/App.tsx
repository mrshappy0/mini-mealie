import './App.css';

import { type ChangeEvent, useEffect, useState } from 'react';

import miniMealieLogo from '/mini-mealie.svg';
import {
    clearMealieCredentialsLocal,
    mergeMealieCredentialsFromLocalIfNeeded,
    mirrorMealieCredentialsToLocal,
} from '@/utils/storage';
import {
    AutoScrapeMode,
    isAutoScrapeMode,
    isRecipeCreateMode,
    RecipeCreateMode,
} from '@/utils/types/storageTypes';

/**
 * Returns the URL only when it uses a safe http/https protocol,
 * otherwise returns '#' to prevent javascript: URL injection.
 */
function toSafeHref(url: string): string {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '#';
    } catch {
        return '#';
    }
}

/** True if the field contains a URL with a hostname (not just `https://`). */
function hasMealieHostInput(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.hostname.length > 0;
    } catch {
        return false;
    }
}

function App() {
    const [protocol, setProtocol] = useState<Protocol>(Protocol.HTTPS);
    const [mealieServer, setMealieServer] = useState('');
    const [inputServer, setInputServer] = useState<string>(Protocol.HTTPS);
    const [mealieApiToken, setMealieApiToken] = useState('');
    const [inputToken, setInputToken] = useState('');
    const [isSaveDisabled, setIsSaveDisabled] = useState(true);
    const [username, setUsername] = useState<string | undefined>();
    const [recipeCreateMode, setRecipeCreateMode] = useState<RecipeCreateMode>(
        RecipeCreateMode.URL,
    );
    const [autoScrapeMode, setAutoScrapeMode] = useState<AutoScrapeMode>(AutoScrapeMode.AUTOMATIC);
    const [error, setError] = useState(false);
    const [connectErrorDetail, setConnectErrorDetail] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [importTags, setImportTags] = useState(true);
    const [importCategories, setImportCategories] = useState(true);
    const [openAfterImport, setOpenAfterImport] = useState(false);

    useEffect(() => {
        chrome.storage.sync.get<StorageData>([...storageKeys], (syncData: StorageData) => {
            void chrome.runtime.lastError;

            mergeMealieCredentialsFromLocalIfNeeded(syncData, (data: StorageData) => {
                const {
                    mealieServer: storedServer,
                    mealieApiToken: storedToken,
                    mealieUsername,
                    recipeCreateMode: storedRecipeCreateMode,
                    autoScrapeMode: storedAutoScrapeMode,
                    importTags: storedImportTags,
                    importCategories: storedImportCategories,
                    openAfterImport: storedOpenAfterImport,
                } = data;

                if (storedServer) {
                    setMealieServer(storedServer);
                    setInputServer(storedServer);
                    setProtocol(
                        storedServer.startsWith(`${Protocol.HTTP}`)
                            ? Protocol.HTTP
                            : Protocol.HTTPS,
                    );
                } else {
                    setInputServer(Protocol.HTTPS);
                }

                if (storedToken) {
                    setMealieApiToken(storedToken);
                    setInputToken(storedToken);
                }

                if (mealieUsername) setUsername(mealieUsername);
                if (isRecipeCreateMode(storedRecipeCreateMode)) {
                    setRecipeCreateMode(storedRecipeCreateMode);
                }
                if (isAutoScrapeMode(storedAutoScrapeMode)) {
                    setAutoScrapeMode(storedAutoScrapeMode);
                }
                setImportTags(storedImportTags ?? true);
                setImportCategories(storedImportCategories ?? true);
                setOpenAfterImport(storedOpenAfterImport ?? false);

                // Check if we should suggest HTML mode
                chrome.storage.local.get(['suggestHtmlMode'], ({ suggestHtmlMode }) => {
                    if (suggestHtmlMode) {
                        setRecipeCreateMode(RecipeCreateMode.HTML);
                        void chrome.storage.local.remove('suggestHtmlMode');
                        updateRecipeCreateMode(RecipeCreateMode.HTML);
                    }
                });
            });
        });
    }, []);

    // Listen for storage changes (e.g., when context menu switches mode)
    useEffect(() => {
        const handleStorageChange = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: chrome.storage.AreaName,
        ) => {
            if (areaName !== 'sync' && areaName !== 'local') return;

            if (changes.mealieServer?.newValue !== undefined) {
                const next = changes.mealieServer.newValue as string | undefined;
                setMealieServer(next ?? '');
                setInputServer(next && next.length > 0 ? next : Protocol.HTTPS);
            }
            if (changes.mealieApiToken?.newValue !== undefined) {
                const next = changes.mealieApiToken.newValue as string | undefined;
                setMealieApiToken(next ?? '');
                setInputToken(next ?? '');
            }
            if (changes.mealieUsername?.newValue !== undefined) {
                setUsername(changes.mealieUsername.newValue as string | undefined);
            }

            if (areaName === 'sync' && changes.recipeCreateMode?.newValue) {
                const newMode = changes.recipeCreateMode.newValue;
                if (isRecipeCreateMode(newMode)) {
                    setRecipeCreateMode(newMode);
                }
            }

            if (areaName === 'sync' && changes.autoScrapeMode?.newValue) {
                const newScrapeMode = changes.autoScrapeMode.newValue;
                if (isAutoScrapeMode(newScrapeMode)) {
                    setAutoScrapeMode(newScrapeMode);
                }
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        };
    }, []);

    useEffect(() => {
        const isDisabled = !hasMealieHostInput(inputServer) || inputToken.trim() === '';
        setIsSaveDisabled(isDisabled);
    }, [inputServer, inputToken]);

    useEffect(() => {
        setConnectErrorDetail(null);
        setError(false);
    }, [inputServer, inputToken]);

    const saveSettings = async () => {
        if (!hasMealieHostInput(inputServer) || inputToken.trim() === '') {
            setConnectErrorDetail('Enter your full Mealie URL (with hostname) and API token.');
            setError(true);
            return;
        }

        setError(false);
        setConnectErrorDetail(null);
        setLoading(true);
        setIsSaveDisabled(true);
        const result = await getUser(inputServer.trim(), inputToken.trim());

        if (!('username' in result)) {
            setConnectErrorDetail(
                'errorMessage' in result ? result.errorMessage : 'Connection failed.',
            );
            setError(true);
            setLoading(false);
            setIsSaveDisabled(false);
            return;
        }
        chrome.storage.sync.set(
            {
                mealieServer: inputServer.trim(),
                mealieApiToken: inputToken.trim(),
                mealieUsername: result.username,
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        '[Mini Mealie] storage.sync.set failed:',
                        chrome.runtime.lastError.message,
                    );
                    setConnectErrorDetail(
                        chrome.runtime.lastError.message ?? 'storage.sync.set failed',
                    );
                    setError(true);
                    setLoading(false);
                    setIsSaveDisabled(false);
                    return;
                }
                mirrorMealieCredentialsToLocal({
                    mealieServer: inputServer.trim(),
                    mealieApiToken: inputToken.trim(),
                    mealieUsername: result.username,
                });
                setMealieServer(inputServer.trim());
                setMealieApiToken(inputToken.trim());
                setUsername(result.username);
                setLoading(false);
                setIsSaveDisabled(false);
                void checkStorageAndUpdateBadge();
            },
        );
    };

    const handleServerChange = ({ target: { value } }: ChangeEvent<HTMLInputElement>) => {
        if (!value.startsWith(protocol)) {
            setInputServer(protocol);
        } else {
            setInputServer(value);
        }
    };

    const handleServerFocus = (e: ChangeEvent<HTMLInputElement>) => {
        // Place cursor at the end of the text
        const length = e.target.value.length;
        e.target.setSelectionRange(length, length);
    };

    const handleToggle = () => {
        setProtocol((prev) => {
            const next = prev === Protocol.HTTPS ? Protocol.HTTP : Protocol.HTTPS;
            setInputServer((currentServer) => currentServer.replace(/^https?:\/\//, next));
            return next;
        });
    };

    const clearSettings = () => {
        clearMealieCredentialsLocal();
        chrome.storage.sync.remove<StorageData>([...storageKeys], () => {
            setMealieServer('');
            setMealieApiToken('');
            setInputToken('');
            setUsername(undefined);
            setInputServer(Protocol.HTTPS);
            setProtocol(Protocol.HTTPS);
            setRecipeCreateMode(RecipeCreateMode.URL);
            setAutoScrapeMode(AutoScrapeMode.AUTOMATIC);
            setImportTags(true);
            setImportCategories(true);
            setOpenAfterImport(false);
            setError(false);
            setConnectErrorDetail(null);
        });
    };

    const updateRecipeCreateMode = (next: RecipeCreateMode) => {
        chrome.storage.sync.set({ recipeCreateMode: next }, async () => {
            setRecipeCreateMode(next);
            // Trigger context menu update with new mode
            void checkStorageAndUpdateBadge();
        });
    };

    const updateAutoScrapeMode = (next: AutoScrapeMode) => {
        chrome.storage.sync.set({ autoScrapeMode: next }, async () => {
            setAutoScrapeMode(next);
            // Trigger context menu update with new mode
            void checkStorageAndUpdateBadge();
        });
    };

    const handleImportTagsChange = () => {
        const newValue = !importTags;
        setImportTags(newValue);
        void chrome.storage.sync.set({ importTags: newValue });
    };

    const handleImportCategoriesChange = () => {
        const newValue = !importCategories;
        setImportCategories(newValue);
        void chrome.storage.sync.set({ importCategories: newValue });
    };

    const handleOpenAfterImportChange = () => {
        const newValue = !openAfterImport;
        setOpenAfterImport(newValue);
        void chrome.storage.sync.set({ openAfterImport: newValue });
    };
    return (
        <>
            <div>
                <a
                    href={toSafeHref(mealieServer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`logo ${mealieServer && mealieApiToken ? 'active' : ''}`}
                    title={
                        mealieServer && mealieApiToken
                            ? 'Visit Mealie server'
                            : 'Connect to a Mealie server'
                    }
                    onClick={(e) => {
                        if (!mealieServer || !mealieApiToken) {
                            e.preventDefault();
                        }
                    }}
                >
                    <img src={miniMealieLogo} className="logo" alt="Mini Mealie Logo" />
                </a>
            </div>
            <h2 className="header">Mini Mealie</h2>
            <div className="card">
                {mealieServer === '' || mealieApiToken === '' || !username ? (
                    <>
                        <div className="protocol-toggle-container">
                            <div className="toggle-container">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={protocol === Protocol.HTTPS}
                                        onChange={handleToggle}
                                    />
                                    <span
                                        className={`slider ${
                                            protocol === Protocol.HTTPS ? 'locked' : 'unlocked'
                                        }`}
                                    >
                                        {protocol === Protocol.HTTPS ? '🔒' : ''}
                                    </span>
                                </label>
                            </div>
                            <input
                                type="text"
                                placeholder="Enter Mealie Server URL"
                                value={inputServer}
                                onChange={handleServerChange}
                                onFocus={handleServerFocus}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !isSaveDisabled) {
                                        void saveSettings();
                                    }
                                }}
                            />
                        </div>
                        <input
                            type="password"
                            autoComplete="off"
                            placeholder="Enter Mealie API Token"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isSaveDisabled) {
                                    void saveSettings();
                                }
                            }}
                        />

                        <button onClick={saveSettings} disabled={isSaveDisabled}>
                            {loading ? 'Connecting...' : 'Connect Mealie'}
                        </button>
                        {error && (
                            <>
                                <h3>Could not connect</h3>
                                <p className="connect-error-detail">
                                    {connectErrorDetail ??
                                        'Check your Mealie URL and API token, CORS/proxy settings, and Mealie logs.'}
                                </p>
                            </>
                        )}
                        <ActivityLog />
                    </>
                ) : (
                    <>
                        <div className="connected-message">
                            <p className="greeting">
                                Hi <strong>{username}</strong> — your server is connected!
                            </p>
                        </div>

                        <div className="recipe-mode-card">
                            <div
                                className="segmented"
                                role="radiogroup"
                                aria-label="Recipe creation mode"
                            >
                                <label
                                    className={
                                        recipeCreateMode === RecipeCreateMode.URL
                                            ? 'segmented-option is-active'
                                            : 'segmented-option'
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="recipeCreateMode"
                                        value={RecipeCreateMode.URL}
                                        checked={recipeCreateMode === RecipeCreateMode.URL}
                                        onChange={() =>
                                            updateRecipeCreateMode(RecipeCreateMode.URL)
                                        }
                                    />
                                    <span className="segmented-label">URL</span>
                                    <span className="segmented-subtitle">Send page link</span>
                                </label>

                                <label
                                    className={
                                        recipeCreateMode === RecipeCreateMode.HTML
                                            ? 'segmented-option is-active'
                                            : 'segmented-option'
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="recipeCreateMode"
                                        value={RecipeCreateMode.HTML}
                                        checked={recipeCreateMode === RecipeCreateMode.HTML}
                                        onChange={() =>
                                            updateRecipeCreateMode(RecipeCreateMode.HTML)
                                        }
                                    />
                                    <span className="segmented-label">HTML</span>
                                    <span className="segmented-subtitle">Send page content</span>
                                </label>
                            </div>
                        </div>

                        <div className="recipe-mode-card">
                            <div
                                className="segmented"
                                role="radiogroup"
                                aria-label="Automatic scraping mode"
                            >
                                <label
                                    className={
                                        autoScrapeMode === AutoScrapeMode.AUTOMATIC
                                            ? 'segmented-option is-active'
                                            : 'segmented-option'
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="autoScrapeMode"
                                        value={AutoScrapeMode.AUTOMATIC}
                                        checked={autoScrapeMode === AutoScrapeMode.AUTOMATIC}
                                        onChange={() =>
                                            updateAutoScrapeMode(AutoScrapeMode.AUTOMATIC)
                                        }
                                    />
                                    <span className="segmented-label">Automatic</span>
                                    <span className="segmented-subtitle">Scan pages as opened</span>
                                </label>

                                <label
                                    className={
                                        autoScrapeMode === AutoScrapeMode.MANUAL
                                            ? 'segmented-option is-active'
                                            : 'segmented-option'
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="autoScrapeMode"
                                        value={AutoScrapeMode.MANUAL}
                                        checked={autoScrapeMode === AutoScrapeMode.MANUAL}
                                        onChange={() => updateAutoScrapeMode(AutoScrapeMode.MANUAL)}
                                    />
                                    <span className="segmented-label">Manual</span>
                                    <span className="segmented-subtitle">Scan only when I ask</span>
                                </label>
                            </div>
                        </div>

                        <div className="import-options">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={importTags}
                                    onChange={handleImportTagsChange}
                                />
                                <span>Import tags from recipe</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={importCategories}
                                    onChange={handleImportCategoriesChange}
                                />
                                <span>Import categories from recipe</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={openAfterImport}
                                    onChange={handleOpenAfterImportChange}
                                />
                                <span>Open recipe after import</span>
                            </label>
                        </div>

                        <ShoppingListQuickAdd
                            mealieServer={mealieServer}
                            mealieApiToken={mealieApiToken}
                        />

                        <ActivityLog />

                        <button onClick={clearSettings}>Disconnect Server</button>
                    </>
                )}
            </div>
            <p className="read-the-docs">
                Built to extend the functionality of{' '}
                <a href="https://mealie.io/" target="_blank" rel="noopener noreferrer">
                    Mealie
                </a>
            </p>
            <div className="buy-me-a-coffee-container">
                <BuyMeACoffeeButton />
            </div>
        </>
    );
}

type ShoppingStatus = { type: 'success' | 'error'; message: string };

function ShoppingListQuickAdd({
    mealieServer,
    mealieApiToken,
}: {
    mealieServer: string;
    mealieApiToken: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
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
        <div className="collapsible-section">
            <button
                type="button"
                className="collapsible-toggle"
                onClick={() => setIsOpen((prev) => !prev)}
                aria-expanded={isOpen}
            >
                🛒 Add Recipe to Shopping List {isOpen ? '▲' : '▼'}
            </button>
            {isOpen && (
                <div className="collapsible-body">
                    <div className="shopping-search-row">
                        <input
                            type="text"
                            placeholder="Search your recipes…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !searching && query.trim()) {
                                    void handleSearch();
                                }
                            }}
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
                        <p className="shopping-empty">
                            No recipes found for &quot;{query.trim()}&quot;.
                        </p>
                    )}

                    {results.length > 0 && !selectedRecipe && (
                        <ul className="shopping-results">
                            {results.map((recipe) => (
                                <li key={recipe.id}>
                                    <button
                                        type="button"
                                        onClick={() => void handleSelectRecipe(recipe)}
                                    >
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
                            <button
                                type="button"
                                className="shopping-back"
                                onClick={resetSelection}
                            >
                                ← Back to results
                            </button>
                        </div>
                    )}

                    {status && (
                        <p
                            className={
                                status.type === 'success'
                                    ? 'shopping-success'
                                    : 'connect-error-detail'
                            }
                        >
                            {status.message}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

function ActivityLog() {
    const handleOpenLogs = () => {
        void chrome.tabs.create({ url: chrome.runtime.getURL('logs.html') });
    };

    return (
        <div className="activity-log">
            <button className="activity-log-link" onClick={handleOpenLogs}>
                Open Activity Log ↗
            </button>
        </div>
    );
}

export default App;
