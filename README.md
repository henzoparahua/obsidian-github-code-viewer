# GitHub Code Viewer for Obsidian

Minimalist code viewer linking GitHub repos to your notes :p

## Usage

To use the plugin, simply create a code block with the `github` language tag and paste the URL of the file you want to display.

### Supported URL Formats

* **Full File:** `https://github.com/owner/repo/blob/main/path/to/file.ts`
* **Specific Lines:** `https://github.com/owner/repo/blob/main/path/to/file.ts#L10-L20`

![Github Code Viewer Demo](github-code-viewer.gif)

## Settings

If you want to display code from **private repositories**, you need to provide a GitHub Personal Access Token:

1. Go to Obsidian Settings > Community Plugins > GitHub Code Viewer.
2. Paste your **GitHub Personal Access Token (PAT)**.
3. The token is securely saved locally on your computer.

### Manual Installation

1. Go to the [Releases](https://github.com/henzoparahua/obsidian-github-code-viewer/releases) page of this repository.
2. Download the `main.js`, `manifest.json`, and `styles.css` files from the latest release.
3. Inside your Obsidian vault, navigate to `.obsidian/plugins/` and create a folder named `github-code-viewer`.
4. Place the downloaded files inside the newly created folder.
5. Restart Obsidian, go to Settings > Community Plugins, disable "Safe Mode", and enable **GitHub Code Viewer**.

## Development

To build this plugin locally:

1. Clone this repository.
2. Make sure your NodeJS is at least v16.
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start compilation in watch mode.
5. Run `npm run build` for a production build.

## Support

If you find this plugin helpful, consider supporting me!

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-red)](https://github.com/sponsors/henzoparahua)
