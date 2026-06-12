import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
    // Persist Chrome profile data across dev sessions
    // This allows the extension to remember logins, settings, etc.
    chromiumArgs: ['--user-data-dir=./.wxt/chrome-data'],

    // Auto-open useful pages for development
    startUrls: [
        'https://www.allrecipes.com/recipe/286369/cheesy-ground-beef-and-potatoes/',
        'https://www.katheats.com/homemade-nutty-granola-recipe',
        'https://example.com', // Non-recipe page for testing detection behavior
    ],
});
