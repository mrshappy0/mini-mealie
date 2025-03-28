import './App.css';

import { ChangeEvent, useEffect, useState } from 'react';

import miniMealieLogo from '/mini-mealie.svg';

enum Protocol {
    HTTP = 'http://',
    HTTPS = 'https://',
}

function App() {
    const [protocol, setProtocol] = useState<Protocol>(Protocol.HTTPS);
    const [mealieServer, setMealieServer] = useState('');
    const [inputServer, setInputServer] = useState<string>(Protocol.HTTPS);
    const [mealieApiToken, setMealieApiToken] = useState('');
    const [inputToken, setInputToken] = useState('');
    const [isSaveDisabled, setIsSaveDisabled] = useState(true);

    useEffect(() => {
        chrome.storage.sync.get(['mealieServer', 'mealieApiToken'], (data) => {
            if (data.mealieServer) {
                setMealieServer(data.mealieServer);
            } else {
                setInputServer(protocol);
            }

            if (data.mealieApiToken) {
                setMealieApiToken(data.mealieApiToken);
            }
        });
    }, [protocol]);

    useEffect(() => {
        const isDisabled = inputServer.trim() === '' || inputToken.trim() === '';
        setIsSaveDisabled(isDisabled);
    }, [inputServer, inputToken]);

    const saveSettings = () => {
        if (inputServer.trim() === protocol || inputToken.trim() === '') {
            return;
        }
        chrome.storage.sync.set({ mealieServer: inputServer, mealieApiToken: inputToken }, () => {
            setMealieServer(inputServer);
            setMealieApiToken(inputToken);
        });
    };

    const handleServerChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;

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
        setProtocol((prev) => (prev === Protocol.HTTPS ? Protocol.HTTP : Protocol.HTTPS));
        setInputServer((prev) =>
            prev.replace(
                /^https?:\/\//,
                protocol === Protocol.HTTPS ? Protocol.HTTP : Protocol.HTTPS,
            ),
        );
    };

    const clearSettings = () => {
        chrome.storage.sync.remove(['mealieServer', 'mealieApiToken'], () => {
            setMealieServer('');
            setInputServer('');
            setMealieApiToken('');
            setInputToken('');
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
                {mealieServer === '' || mealieApiToken === '' ? (
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
                            Connect Mealie
                        </button>
                    </>
                ) : (
                    <>
                        <h3>Settings saved successfully!</h3>
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
