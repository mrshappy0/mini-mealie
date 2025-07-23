import './App.css';

import { ChangeEvent, useEffect, useState } from 'react';

import miniMealieLogo from '/mini-mealie.svg';

function App() {
    const [protocol, setProtocol] = useState<Protocol>(Protocol.HTTPS);
    const [mealieServer, setMealieServer] = useState('');
    const [inputServer, setInputServer] = useState<string>(Protocol.HTTPS);
    const [mealieApiToken, setMealieApiToken] = useState('');
    const [inputToken, setInputToken] = useState('');
    const [isSaveDisabled, setIsSaveDisabled] = useState(true);
    const [username, setUsername] = useState<string | undefined>();
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [ladderEnabled, setLadderEnabled] = useState(true);

    const handleToggleLadder = () => {
        const newValue = !ladderEnabled;
        setLadderEnabled(newValue);
        chrome.storage.sync.set({ ladderEnabled: newValue });
    };

    useEffect(() => {
        chrome.storage.sync.get<StorageData>(
            [...storageKeys],
            ({ mealieServer, mealieApiToken, mealieUsername, ladderEnabled }: StorageData) => {
                if (mealieServer) setMealieServer(mealieServer);
                setInputServer(protocol);
                if (mealieApiToken) setMealieApiToken(mealieApiToken);
                if (mealieUsername) setUsername(mealieUsername);
                setLadderEnabled(ladderEnabled ?? true);
            },
        );
    }, [protocol]);

    useEffect(() => {
        const isDisabled = inputServer.trim() === '' || inputToken.trim() === '';
        setIsSaveDisabled(isDisabled);
    }, [inputServer, inputToken]);

    const saveSettings = async () => {
        if (inputServer.trim() === protocol || inputToken.trim() === '') return;

        setLoading(true);
        setIsSaveDisabled(true);
        const result = await getUser(inputServer, inputToken);

        if (!('username' in result)) {
            setError(true);
            setLoading(false);
            clearSettings();
            return;
        }
        chrome.storage.sync.set(
            {
                mealieServer: inputServer,
                mealieApiToken: inputToken,
                mealieUsername: result.username,
                ladderEnabled: false,
            },
            () => {
                setMealieServer(inputServer);
                setMealieApiToken(inputToken);
                setUsername(result.username);
                setLoading(false);
                setIsSaveDisabled(false);
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
        chrome.storage.sync.remove<StorageData>([...storageKeys], () => {
            setMealieServer('');
            setMealieApiToken('');
            setInputToken('');
            setUsername(undefined);
            setInputServer(Protocol.HTTPS);
            setProtocol(Protocol.HTTPS);
        });
    };
    return (
        <>
            <div>
                <a
                    href={mealieServer ? mealieServer : '#'}
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
                                        saveSettings();
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
                                    saveSettings();
                                }
                            }}
                        />

                        <button onClick={saveSettings} disabled={isSaveDisabled}>
                            {loading ? 'Connecting...' : 'Connect Mealie'}
                        </button>
                        {error && <h3>Invalid Server Settings</h3>}
                    </>
                ) : (
                    <>
                        <div className="ladder-toggle">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={ladderEnabled}
                                    onChange={handleToggleLadder}
                                />
                                <span>
                                    {ladderEnabled
                                        ? 'Paywall Ladder Enabled'
                                        : 'Paywall Ladder Disabled'}
                                </span>
                            </label>
                        </div>
                        <div className="connected-message">
                            <p className="greeting">
                                Hi <strong>{username}</strong> — your server is connected!
                            </p>
                        </div>
                        <button onClick={clearSettings}>Disconnect Server</button>
                    </>
                )}
            </div>
            <p className="read-the-docs">
                Built to extend the functionality of{' '}
                <a href="https://mealie.io/" target="_blank" rel="noopener noreferrer">
                    Mealie
                </a>
                . Visit their website to learn more about this self-hosted recipe manager.
            </p>
            <div className="buy-me-a-coffee-container">
                <BuyMeACoffeeButton />
            </div>
        </>
    );
}

export default App;
