import { useState } from "react";
import reactLogo from "@/assets/react.svg";
import wxtLogo from "/wxt.svg";
import "./App.css";

function App() {
    const [mealieApiToken, setMealieApiToken] = useState("");
    const [inputToken, setInputToken] = useState("");

    // Load the token when the component mounts
    useEffect(() => {
        chrome.storage.sync.get("mealieApiToken", (data) => {
            if (data.mealieApiToken) {
                setMealieApiToken(data.mealieApiToken);
            }
        });
    }, []);

    const saveToken = () => {
        chrome.storage.sync.set({ mealieApiToken: inputToken }, () => {
            setMealieApiToken(inputToken); // Only update after saving
            alert("Mealie API Token saved!");
        });
    };

    const clearToken = () => {
        chrome.storage.sync.remove("mealieApiToken", () => {
            setMealieApiToken("");
            setInputToken(""); // Clear input state too
            alert("Mealie API Token removed!");
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
                {mealieApiToken === "" ? (
                    <>
                        <input
                            type="text"
                            placeholder="Enter Mealie API Token"
                            value={inputToken}
                            onChange={(e) => setInputToken(e.target.value)}
                        />
                        <button onClick={saveToken}>Save Token</button>
                    </>
                ) : (
                    // If mealieApiToken is set, show success message and option to clear
                    <>
                        <p>✅ Token saved successfully!</p>
                        <button onClick={clearToken}>Remove Token</button>
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
