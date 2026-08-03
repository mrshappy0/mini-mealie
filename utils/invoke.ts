export function runCreateRecipe(tab: chrome.tabs.Tab) {
    chrome.storage.sync.get<StorageData>(
        [...storageKeys],
        async ({
            mealieServer,
            mealieApiToken,
            recipeCreateMode,
            importTags,
            importCategories,
            openAfterImport,
        }) => {
            if (!mealieServer || !mealieApiToken) {
                void logEvent({
                    level: 'warn',
                    feature: 'recipe-create',
                    action: 'runCreateRecipe',
                    phase: 'failure',
                    message: 'Missing server or token',
                });
                showBadge('❌', 4);
                return;
            }

            const mode = isRecipeCreateMode(recipeCreateMode)
                ? recipeCreateMode
                : RecipeCreateMode.URL;

            // Check if we should suggest HTML mode instead of creating
            if (mode === RecipeCreateMode.URL && tab.url) {
                const cached = detectionCache.get(tab.url);
                if (cached && cached.outcome !== 'recipe') {
                    // Detection failed - suggest HTML mode via popup
                    void logEvent({
                        level: 'info',
                        feature: 'recipe-create',
                        action: 'suggestHtmlMode',
                        phase: 'start',
                        message: 'Opening popup to suggest HTML mode',
                        data: { url: sanitizeUrl(tab.url) },
                    });

                    void chrome.storage.local.set({ suggestHtmlMode: true });
                    void chrome.action?.openPopup();
                    return;
                }
            }

            switch (mode) {
                case RecipeCreateMode.URL: {
                    if (!tab.url) {
                        void logEvent({
                            level: 'warn',
                            feature: 'recipe-create',
                            action: 'createFromUrl',
                            phase: 'failure',
                            message: 'No tab URL available',
                        });
                        showBadge('❌', 4);
                        return;
                    }

                    const tabUrl = tab.url;
                    await beginActivity('Creating recipe (URL)');

                    const result = await withOperation(
                        {
                            feature: 'recipe-create',
                            action: 'createFromUrl',
                            message: 'Creating recipe from URL',
                            data: { url: sanitizeUrl(tabUrl) },
                        },
                        () =>
                            createRecipeFromURL(
                                tabUrl,
                                mealieServer,
                                mealieApiToken,
                                importTags ?? true,
                                importCategories ?? true,
                            ),
                        (res) => res !== 'failure',
                    );
                    const success = result !== 'failure';

                    if (success) {
                        invalidateDetectionCacheForUrl(tabUrl);
                    }

                    await endActivity(
                        success ? '✅' : '❌',
                        success ? 'Recipe created successfully' : 'Recipe creation failed',
                    );

                    if (result !== 'failure' && openAfterImport) {
                        await maybeOpenRecipeAfterImport(mealieServer, mealieApiToken, result.slug);
                    }
                    return;
                }

                case RecipeCreateMode.HTML: {
                    if (tab.id == null) {
                        void logEvent({
                            level: 'warn',
                            feature: 'recipe-create',
                            action: 'createFromHtml',
                            phase: 'failure',
                            message: 'No tab ID available',
                        });
                        showBadge('❌', 4);
                        return;
                    }

                    const tabId = tab.id;
                    const tabUrl = tab.url;
                    await beginActivity('Creating recipe (HTML)');

                    const htmlData: { url?: string; htmlLength?: number } = {
                        url: tabUrl ? sanitizeUrl(tabUrl) : undefined,
                    };
                    const html = await withOperation(
                        {
                            feature: 'html-capture',
                            action: 'getPageHTML',
                            message: 'Capturing page HTML',
                            data: htmlData,
                        },
                        async () => {
                            const captured = await getPageHTML(tabId);
                            if (captured) {
                                htmlData.htmlLength = captured.length;
                            }
                            return captured;
                        },
                        (captured) => captured !== null,
                    );
                    if (!html) {
                        await endActivity('❌', 'Failed to capture page HTML');
                        return;
                    }

                    const result = await withOperation(
                        {
                            feature: 'recipe-create',
                            action: 'createFromHtml',
                            message: 'Creating recipe from HTML',
                            data: { url: tabUrl ? sanitizeUrl(tabUrl) : undefined },
                        },
                        () =>
                            createRecipeFromHTML(
                                html,
                                mealieServer,
                                mealieApiToken,
                                tabUrl,
                                importTags ?? true,
                                importCategories ?? true,
                            ),
                        (res) => res !== 'failure',
                    );
                    const success = result !== 'failure';

                    await endActivity(
                        success ? '✅' : '❌',
                        success ? 'Recipe created successfully' : 'Recipe creation failed',
                    );

                    if (result !== 'failure' && openAfterImport) {
                        await maybeOpenRecipeAfterImport(mealieServer, mealieApiToken, result.slug);
                    }
                    return;
                }
            }
        },
    );
}

async function maybeOpenRecipeAfterImport(
    mealieServer: string,
    mealieApiToken: string | undefined,
    slug: string,
) {
    if (!mealieApiToken || !slug) {
        void logEvent({
            level: 'warn',
            feature: 'recipe-create',
            action: 'openAfterImport',
            phase: 'failure',
            message: 'Cannot open recipe: missing token or slug',
            data: { slug },
        });
        return;
    }

    const user = await getUser(mealieServer, mealieApiToken);
    const groupSlug = 'username' in user ? user.groupSlug : undefined;
    const errorMessage = 'username' in user ? undefined : user.errorMessage;

    const recipeUrl =
        groupSlug && slug
            ? `${normalizeMealieServerBaseUrl(mealieServer)}/g/${encodeURIComponent(groupSlug)}/r/${encodeURIComponent(slug)}`
            : undefined;

    void logEvent({
        level: recipeUrl ? 'info' : 'warn',
        feature: 'recipe-create',
        action: 'openAfterImport',
        phase: recipeUrl ? 'success' : 'failure',
        message: recipeUrl
            ? 'Opening recipe in new tab'
            : 'Cannot open recipe: failed to fetch group slug',
        data: {
            slug,
            groupSlug,
            errorMessage,
            recipeUrl: recipeUrl ? sanitizeUrl(recipeUrl) : undefined,
        },
    });

    if (recipeUrl) {
        void chrome.tabs.create({ url: recipeUrl });
    }
}

async function getPageHTML(tabId: number) {
    try {
        // Firefox's chrome.* namespace is callback-only (calling without a callback
        // returns undefined instead of a Promise), while Chrome returns a Promise.
        // Support both, mirroring the tabs.query shim in storage.ts.
        const results = await new Promise<chrome.scripting.InjectionResult<string>[]>(
            (resolve, reject) => {
                const result = chrome.scripting.executeScript<[], string>(
                    {
                        target: { tabId },
                        func: () => document.documentElement.outerHTML,
                    },
                    (callbackResults) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        resolve(callbackResults);
                    },
                ) as unknown;
                if (result instanceof Promise) void result.then(resolve, reject);
            },
        );

        const html = results[0]?.result;
        return typeof html === 'string' ? html : null;
    } catch (error) {
        void logEvent({
            level: 'warn',
            feature: 'html-capture',
            action: 'getPageHTML',
            phase: 'failure',
            message: 'executeScript failed',
            data: { error: error instanceof Error ? error.message : String(error) },
        });
        return null;
    }
}
