# LeanToken Website

Source for the LeanToken landing page at [leantoken.dev](https://leantoken.dev/).

This `website` branch contains only the marketing site. The LeanToken CLI lives on
the [`main`](https://github.com/arifahmedjoy/leantoken/tree/main) branch. Report
CLI bugs and feature requests there, not here.

## Stack

- [Astro](https://astro.build/) 7: static site generation
- [Tailwind CSS](https://tailwindcss.com/) 4 via `@tailwindcss/vite`
- Node.js `>=22.23.4` (see `engines` in `package.json`)

## Project structure

```text
public/
  assets/          favicon, Open Graph images
  robots.txt
  sitemap.xml
src/
  pages/
    index.astro    the landing page (single page)
  styles/
    global.css     global styles and Tailwind entry
astro.config.mjs
```

## Local development

```sh
npm ci
npm run dev       # dev server at http://localhost:4321
npm run build     # static output in dist/
npm run preview   # serve the built dist/ locally
```

## Content and SEO checklist

When you change the page, keep these in sync:

- `<title>`, meta description, Open Graph and Twitter tags in `src/pages/index.astro`
- JSON-LD `softwareVersion` and the version on the page, matched to the latest CLI release
- `public/sitemap.xml` when you add or remove pages
- `public/assets/og-image.png`, regenerated from `og-image.svg` (1200×630) when you change the social card

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
