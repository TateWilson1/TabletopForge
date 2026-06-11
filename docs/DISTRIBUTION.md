# Distribution

TabletopForge is designed to be usable without asking end users to install Node.js, npm, or developer tools.

## Recommended First Release: Hosted Website

Use GitHub Pages for the first public release. Users visit a normal website link, and the app runs entirely in their browser.

The example workflow in `docs/github-pages-workflow.example.yml` builds the static site and publishes the `out/` folder whenever `main` changes. To use it, copy it to `.github/workflows/deploy-pages.yml` with a GitHub token that has workflow permission. In the repository settings, enable GitHub Pages with **Source: GitHub Actions**.

Expected URL:

```text
https://tatewilson1.github.io/TabletopForge/
```

## Desktop Release Later

For a Windows `.exe`, package the same static `out/` folder with a desktop wrapper. Tauri is the better first choice because the installer is usually much smaller than an Electron installer.

Good release target:

- Website for most users
- Windows installer for offline workshops, classrooms, and clients that prefer a local desktop app

## Future AI Backend

When backend AI is added, keep the current static frontend and add an API service behind it. The completed session scorecard already exports structured session context that can be sent to that backend later.
