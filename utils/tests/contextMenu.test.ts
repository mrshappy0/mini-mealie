import { describe, it, expect, vi, beforeEach } from "vitest";
import { addContextMenu, removeContextMenu } from "../contextMenu";

// Mocking the Chrome API
beforeEach(() => {
  global.chrome = {
    contextMenus: {
      removeAll: vi.fn((callback) => callback && callback()),
      create: vi.fn(),
    },
  } as unknown as typeof chrome;
});

describe("Context Menu Utility", () => {
  it("should remove all existing context menus before adding a new one", () => {
    addContextMenu();
    
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
    expect(chrome.contextMenus.create).toHaveBeenCalledWith({
      id: "scrapeRecipe",
      title: "Import recipe to Mealie",
      contexts: ["page"],
    });
  });

  it("should remove all context menus when removeContextMenu is called", () => {
    removeContextMenu();
    
    expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
  });
});