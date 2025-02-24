import { useState, useEffect } from "react";
import reactLogo from "@/assets/react.svg";
import wxtLogo from "/wxt.svg";
import "./App.css";

function App() {
    const [mealieServer, setMealieServer] = useState("");
    const [inputServer, setInputServer] = useState("");
    const [mealieApiToken, setMealieApiToken] = useState("");
    const [inputToken, setInputToken] = useState("");
    const [isSaveDisabled, setIsSaveDisabled] = useState(true);

    useEffect(() => {
        chrome.storage.sync.get(["mealieServer", "mealieApiToken"], (data) => {
            if (data.mealieServer) {
                setMealieServer(data.mealieServer);
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
        if (inputServer.trim() === "" || inputToken.trim() === "") {
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

    const clearSettings = () => {
        chrome.storage.sync.remove(["mealieServer", "mealieApiToken"], () => {
            setMealieServer("");
            setInputServer("");
            setMealieApiToken("");
            setInputToken("");
        });
    };

    return (
        <>
            <div>
                <a href="https://wxt.dev" target="_blank">
                    <img src={wxtLogo} className="logo" alt="WXT logo" />
                </a>
                <a href="https://react.dev" target="_blank">
                    <img
                        src={reactLogo}
                        className="logo react"
                        alt="React logo"
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
                            onChange={(e) => setInputServer(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Enter Mealie API Token"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
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
