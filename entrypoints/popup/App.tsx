import './App.css';

import { ChangeEvent, useEffect, useState } from 'react';

import miniMealieLogo from '/mini-mealie.svg';
import {
    clearMealieCredentialsLocal,
    mergeMealieCredentialsFromLocalIfNeeded,
    mirrorMealieCredentialsToLocal,
} from '@/utils/storage';
import { isRecipeCreateMode, RecipeCreateMode } from '@/utils/types/storageTypes';

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
                setImportTags(storedImportTags ?? true);
                setImportCategories(storedImportCategories ?? true);
                setOpenAfterImport(storedOpenAfterImport ?? false);

                // Check if we should suggest HTML mode
                chrome.storage.local.get(['suggestHtmlMode'], ({ suggestHtmlMode }) => {
                    if (suggestHtmlMode) {
                        setRecipeCreateMode(RecipeCreateMode.HTML);
                        // TODO: investigate if we can await this call
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
                ladderEnabled: false,
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
            // TODO: investigate if we can await this call
            void checkStorageAndUpdateBadge();
        });
    };

    const handleImportTagsChange = () => {
        const newValue = !importTags;
        setImportTags(newValue);
        // TODO: investigate if we can await this call
        void chrome.storage.sync.set({ importTags: newValue });
    };

    const handleImportCategoriesChange = () => {
        const newValue = !importCategories;
        setImportCategories(newValue);
        // TODO: investigate if we can await this call
        void chrome.storage.sync.set({ importCategories: newValue });
    };

    const handleOpenAfterImportChange = () => {
        const newValue = !openAfterImport;
        setOpenAfterImport(newValue);
        // TODO: investigate if we can await this call
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
                                        // TODO: investigate if we can await this call
                                        void saveSettings();
                                    }
                                }}
                            />
                        </div>
                        <input
                            type="text"
                            placeholder="Enter Mealie API Token"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !isSaveDisabled) {
                                    // TODO: investigate if we can await this call
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

function ActivityLog() {
    const handleOpenLogs = () => {
        // TODO: investigate if we can await this call
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
