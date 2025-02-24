import { showBadge, clearBadge } from "./badge";
import { addContextMenu, removeContextMenu } from "./contextMenu";

export const checkStorageAndUpdateBadge = () => {
    chrome.storage.sync.get(
        ["mealieServer", "mealieApiToken"],
        ({ mealieServer, mealieApiToken }) => {
            const hasServer = !!mealieServer;
            const hasToken = !!mealieApiToken;

            if (!hasServer || !hasToken) {
                showBadge("❌");
                removeContextMenu();
            } else {
                clearBadge();
                addContextMenu();
            }
        }
    );
};