# Mini Mealie

[![Release][release-shield]][release-url]
[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]
[![Coverage Status][coverage-shield]][coverage-url]
[![Commitizen friendly][commitizen-shield]][commitizen-url]
[![Chrome Web Store][chrome-web-store-shield]][chrome-web-store-url]
[![Buy Me a Coffee][coffee-shield]](#-support-me)

Mini Mealie is a Chrome extension built using WXT and React, designed to speed up recipe creation. This extension integrates with Mealie to scrape recipes and import into Mealie.

---

## Features

- Import recipes from any webpage using Mealie API
- Toggle for Paywall ladder
- Each website uses Mealie dry-run to detect a recipe on the active tab
- Store Mealie API token securely using `chrome.storage.sync`.
- Supports connecting to any Mealie server

---

## Requirements and Dependencies

- **Node.js** v22.x or later
- **pnpm** (Package Manager)
- **Chrome** (for testing and development)
- Dependencies:
    - **WXT** (Web Extension Toolkit)
    - **React** v19.x
    - **TypeScript** 5.7.3

---

## Installation and Setup

1. **Clone the repository:**

2. **Install dependencies using pnpm:**

    ```bash
    pnpm install
    ```

3. **Set up your local development environment (optional but recommended):**

    ```bash
    cp .env.local.example .env.local
    ```

    Then edit `.env.local` and fill in your Mealie server details:

    ```env
    WXT_MEALIE_SERVER=https://your-mealie-server.com
    WXT_MEALIE_API_TOKEN=your-api-token-here
    WXT_MEALIE_USERNAME=your-username
    ```

    **Why `.env.local`?**

    - ✅ Pre-populates your Mealie server URL and API token during development
    - ✅ No need to re-login every time you restart the dev browser
    - ✅ Persistent Chrome profile remembers your settings
    - ✅ Your credentials never get committed to git (`.env.local` is gitignored)

    Without `.env.local`, you'll need to manually configure the extension via the popup on each dev session - it will still work, just less convenient!

4. **Start the development server:**

    ```bash
    pnpm dev
    ```

    This will:

    - Start the WXT dev server
    - Open Chrome with the extension loaded in a persistent profile (`.wxt/chrome-data`)
    - Auto-open a recipe page for testing (https://www.allrecipes.com/recipe/286369/)
    - Auto-open the Mini Mealie activity logs page for monitoring
    - Pre-populate your credentials from `.env.local` (if configured)

    Your settings and browser state persist across dev sessions - no need to re-configure!

5. **Build the extension for production:**

    ```bash
    pnpm build
    ```

6. **Load the extension in Chrome:**
    - Go to `chrome://extensions/`
    - Enable **Developer Mode**
    - Click **Load unpacked** and select the `dist` folder

---

## Configuration

- To use the Mealie integration, you will need to **generate an API token** in your Mealie instance.
- Save the token securely within the extension popup.
- Obtain your **local host URL** or public Mealie **instance URL** for API calls.
- Modify your Mealie infrastructure to allow CORS (Cross-Origin Resource Sharing) calls, as the Chrome extension will be making API requests:
    - This involves configuring your reverse proxies, authentication, or other related infrastructure.

---

## Usage

1. **Right-click** on any recipe webpage.
2. Select **"Recipe Detected - Add Recipe to Mealie"** from the context menu.
   2a. _(Optional)_ Enable the paywall ladder feature to send the recipe URL to a paywall ladder before proceeding.
3. The extension will send the recipe URL to the Mealie create recipe endpoint.

---

## Development and Contribution

- **Open Source Invitation**:
    - Contributions are welcome as Mini Mealie evolves. Enhance features or propose new ones!
- **Discussion and Issues**:
    - Use the [discussion page][discussions-url] for suggestions or issue troubleshooting. Feel free to create [detailed issues][issues-url] for bugs or desired features.

### Pull Request Process

1. **Branches**:

    - **`main`**: Stable production build.
    - Develop new features or fixes in a feature branch.
    - Open a pull request (PR) pointing to `main`.

2. **Review**:

    - Request a review from a repository admin.

3. **Release Management**:
    - After a successful review and merge, a GitHub Action evaluates if a new release is necessary based on the PR commits.
    - This project follows Conventional Commits for release determination.
    - Approved releases are published to the Chrome Web Store via an upload workflow.

### Copilot Commit Helper (Optional)

If you use GitHub Copilot Chat in VS Code, you can use the prompt file at `.github/prompts/cz.prompt.md` to:

- Inspect **staged** changes only (`git diff --staged`)
- Propose a strict **Conventional Commits** message
- Iterate with you until you say **"commit those changes"**

Typical flow:

1. Stage your work (`git add ...`).
2. Open the prompt file and run it in Copilot Chat (or paste its contents into chat).
3. Review/tweak the proposed message.
4. When satisfied, respond: **"commit those changes"**.

### Code Reviews

- All pull request reviews must be kept up-to-date with the `main` branch.
- Branch protection rules are enforced to ensure:
    - Passing of ESLint tests.
    - Successful completion of unit tests.
    - Adequate test coverage is maintained.
- All issues must be resolved prior to requesting a review.
- Pull requests require approval from at least one reviewer.

---

## 📄 License

Distributed under the [AGPL License][license-url]. See the [LICENSE](LICENSE) file for more details.

---

## ☕ Support Me

If you find this project useful, consider [buying me a coffee](https://www.buymeacoffee.com/atomos) to show your support!

---

## Contact

For questions or collaboration requests, contact:

- **Adam Shappy** - atom@shaplabs.net
- **GitHub** - https://github.com/mrshappy0

---

[contributors-shield]: https://img.shields.io/github/contributors/mrshappy0/mini-mealie.svg?style=for-the-badge
[contributors-url]: https://github.com/mrshappy0/mini-mealie/graphs/contributors
[stars-shield]: https://img.shields.io/github/stars/mrshappy0/mini-mealie.svg?style=for-the-badge
[stars-url]: https://github.com/mrshappy0/mini-mealie/stargazers
[issues-shield]: https://img.shields.io/github/issues-raw/mrshappy0/mini-mealie.svg?style=for-the-badge
[issues-url]: https://github.com/mrshappy0/mini-mealie/issues
[license-shield]: https://img.shields.io/github/license/mrshappy0/mini-mealie.svg?style=for-the-badge
[license-url]: https://github.com/mrshappy0/mini-mealie/blob/main/LICENSE
[coverage-shield]: https://img.shields.io/endpoint?url=https://adam-shappy.com/mini-mealie/coverage-badge.json&style=for-the-badge
[coverage-url]: https://adam-shappy.com/mini-mealie/coverage-badge.json
[commitizen-shield]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?style=for-the-badge
[commitizen-url]: http://commitizen.github.io/cz-cli/
[coffee-shield]: https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FF813F.svg?style=for-the-badge&logo=buy-me-a-coffee
[release-shield]: https://img.shields.io/github/actions/workflow/status/mrshappy0/mini-mealie/release.yml?branch=main&style=for-the-badge&label=release
[release-url]: https://github.com/mrshappy0/mini-mealie/actions/workflows/release.yml
[discussions-url]: https://github.com/mrshappy0/mini-mealie/discussions
[chrome-web-store-shield]: https://img.shields.io/chrome-web-store/v/lchfnbjpjoeejalacnpjnafenacmdocc.svg?style=for-the-badge
[chrome-web-store-url]: https://chromewebstore.google.com/detail/mini-mealie/lchfnbjpjoeejalacnpjnafenacmdocc
