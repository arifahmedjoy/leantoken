# Contributing to the LeanToken Website

Thank you for helping improve [leantoken.dev](https://leantoken.dev/). This guide
covers the `website` branch only. For the CLI, see
[CONTRIBUTING.md on `main`](https://github.com/arifahmedjoy/leantoken/blob/main/CONTRIBUTING.md).

## What belongs here

- Copy, layout, styling, and accessibility fixes on the landing page
- SEO metadata, the sitemap, robots.txt, and Open Graph assets
- Build and tooling changes for the Astro site

CLI behavior, docs, and releases belong on `main`.

## Workflow

1. Branch from `website`, for example `website-fix-hero-copy`.
2. Open pull requests against **`website`**, not `main`.
3. Keep changes focused. Discuss large redesigns in an issue first.

## Before opening a pull request

```sh
npm ci
npm run build     # must succeed with no errors
npm run preview   # check the built page
```

Check:

- [ ] The page renders correctly at mobile (~375px) and desktop widths
- [ ] Keyboard navigation and visible focus states work, and images have `alt` text
- [ ] Claims about the CLI match its current behavior and version on `main`
- [ ] Meta tags, JSON-LD, and `sitemap.xml` are updated if relevant
- [ ] No new runtime dependencies unless discussed first

Include screenshots for visual changes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), for example
`feat:`, `fix:`, `style:`, `docs:`, or `chore:`.

## Code of Conduct

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By submitting a contribution, you agree that it is distributed under the
repository's [MIT License](LICENSE).
