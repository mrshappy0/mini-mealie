import { useState, useEffect, ChangeEvent } from "react";
import miniMealieLogo from "/mini-mealie.svg";
import "./App.css";

function App() {
    const urlPrefix = "http://";
    const [mealieServer, setMealieServer] = useState("");
    const [inputServer, setInputServer] = useState(urlPrefix);
    const [mealieApiToken, setMealieApiToken] = useState("");
    const [inputToken, setInputToken] = useState("");
    const [isSaveDisabled, setIsSaveDisabled] = useState(true);

    useEffect(() => {
        chrome.storage.sync.get(["mealieServer", "mealieApiToken"], (data) => {
            if (data.mealieServer) {
                setMealieServer(data.mealieServer);
            } else {
                setInputServer(urlPrefix);
            }

            if (data.mealieApiToken) {
                setMealieApiToken(data.mealieApiToken);
            }
        });
    }, []);

    useEffect(() => {
        const isDisabled =
            inputServer.trim() === "" || inputToken.trim() === "";
        setIsSaveDisabled(isDisabled);
    }, [inputServer, inputToken]);

    const saveSettings = () => {
        if (inputServer.trim() === urlPrefix || inputToken.trim() === "") {
            return;
        }
        chrome.storage.sync.set(
            { mealieServer: inputServer, mealieApiToken: inputToken },
            () => {
                setMealieServer(inputServer);
                setMealieApiToken(inputToken);
            }
        );
    };

    const handleServerChange = (e: ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;

        if (!value.startsWith(urlPrefix)) {
            setInputServer(urlPrefix);
        } else {
            setInputServer(value);
        }
    };

    const handleServerFocus = (e: ChangeEvent<HTMLInputElement>) => {
        // Place cursor at the end of the text
        const length = e.target.value.length;
        e.target.setSelectionRange(length, length);
    };

    const clearSettings = () => {
        chrome.storage.sync.remove(["mealieServer", "mealieApiToken"], () => {
            setMealieServer("");
            setInputServer("");
            setMealieApiToken("");
            setInputToken("");
            setInputServer(urlPrefix);
        });
    };

    return (
        <>
            <div>
                <a
                    href={mealieServer ? mealieServer : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`logo ${
                        mealieServer && mealieApiToken ? "active" : ""
                    }`}
                    title={
                        mealieServer && mealieApiToken
                            ? "Visit Mealie server"
                            : "Connect to a Mealie server"
                    }
                    onClick={(e) => {
                        if (!mealieServer || !mealieApiToken) {
                            e.preventDefault();
                        }
                    }}
                >
                    <img
                        src={miniMealieLogo}
                        className="logo"
                        alt="Mini Mealie Logo"
                    />
                </a>
            </div>
            <h2 className="header">Mini Mealie</h2>
            <div className="card">
                {mealieServer === "" || mealieApiToken === "" ? (
                    <>
                        <input
                            type="text"
                            placeholder="Enter Mealie Server URL"
                            value={inputServer}
                            onChange={handleServerChange}
                            onFocus={handleServerFocus}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSaveDisabled) {
                                    saveSettings();
                                }
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Enter Mealie API Token"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSaveDisabled) {
                                    saveSettings();
                                }
                            }}
                        />
                        <button
                            onClick={saveSettings}
                            disabled={isSaveDisabled}
                        >
                            Connect Mealie
                        </button>
                    </>
                ) : (
                    <>
                        <h3>Settings saved successfully!</h3>
                        <button onClick={clearSettings}>
                            Disconnect Server
                        </button>
                    </>
                )}
            </div>
            <p className="read-the-docs">
                Click on the WXT and React logos to learn more
            </p>
        </>
    );
}

export default App;
