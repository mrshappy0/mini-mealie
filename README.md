[![Contributors][contributors-shield]][contributors-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]
[![Coverage Status][coverage-shield]][coverage-url]

# Mini Mealie

Mini Mealie is a Chrome extension built using WXT and React, designed to speed up recipe scraping. This extension integrates with Mealie to scrape recipes and import into Mealie.

---

## 🚀 Features

- Scrape recipes from any webpage using Mealie API
- Store Mealie API token securely using `chrome.storage.sync`.
- Supports selecting any Mealie server you want to import too

---

## ⚙️ Requirements and Dependencies

- **Node.js** v22.x or later
- **pnpm** (Package Manager)
- **Chrome** (for testing and development)
- Dependencies:
    - **WXT** (Web Extension Toolkit)
    - **React** v19.x
    - **TypeScript** 5.7.3

---

## 📦 Installation and Setup

1. **Clone the repository:**

2. **Install dependencies using pnpm:**

    ```bash
    pnpm install
    ```

3. **Start the development server:**

    ```bash
    pnpm dev
    ```

4. **Build the extension for production:**

    ```bash
    pnpm build
    ```

5. **Load the extension in Chrome:**
    - Go to `chrome://extensions/`
    - Enable **Developer Mode**
    - Click **Load unpacked** and select the `dist` folder

---

## 🔑 Configuration

- To use the Mealie integration, you will need to **generate an API token** in your Mealie instance.
- Save the token securely within the extension popup.
- Ensure the following permissions are set in `wxt.config.ts`:
    ```json
    "permissions": [
            "storage",
            "activeTab",
            "contextMenus",
            "scripting",
        ],
    ```

---

## 🚀 Usage

1. **Right-click** on any recipe webpage.
2. Select **"Scrape Recipe with Mealie"** from the context menu.
3. The recipe will be scraped and added to your Mealie instance.
4. If using the "Buy Me a Coffee" feature, users can click the donation button in the popup.

---

## 👨‍💻 Development and Contribution

- This is a private repository. Only authorized contributors have access.
- Branching strategy:
    - `main`: Stable production build
    - `dev`: Active development branch

### Setting Up Local Development

1. Ensure you have **Node.js** and **pnpm** installed.
2. Install dependencies with:
    ```bash
    pnpm install
    ```
3. Start the development server with:
    ```bash
    pnpm dev
    ```

### Pull Requests and Code Reviews

- Create a feature branch from `dev`:
    ```bash
    git checkout -b feature/[feature-name]
    ```
- Push your changes and create a pull request against `dev`.
- Ensure all tests and lint checks pass before requesting a review.

---

## 📄 License

This project is **proprietary and confidential**. Unauthorized copying, distribution, or modification of this software, via any medium, is strictly prohibited.

---

## ☕ Support Me

If you find this project useful, consider [buying me a coffee](https://www.buymeacoffee.com/yourusername) to show your support!

---

## 📧 Contact

For questions or collaboration requests, contact:

- **Adam Shappy** - atom@shaplabs.net
- **GitHub** - https://github.com/mrshappy0

---

## License

Distributed under the AGPL License. See LICENSE for more information.

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
