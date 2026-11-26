# LeanToken Website

Source for the LeanToken landing page at [leantoken.dev](https://leantoken.dev/).

This `website` branch contains only the marketing site. The LeanToken CLI lives on
the [`main`](https://github.com/arifahmedjoy/leantoken/tree/main) branch and is
published as [`@arifahmedjoy/leantoken` on npm](https://www.npmjs.com/package/@arifahmedjoy/leantoken).
Install it with `npm install -g @arifahmedjoy/leantoken`. Report CLI bugs and
feature requests on the main branch, not here.

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
- JSON-LD `softwareVersion` and the displayed version, matched to the latest CLI release on npm
- Product claims, commands, setup steps, and supported integrations, checked against the main branch README and `docs/usage.md`
- The Context7 widget script and its library identifier in `src/pages/index.astro`; keep any privacy copy clear that it is separate from the local CLI
- `public/sitemap.xml` when you add or remove pages
- `public/assets/og-image.png`, regenerated from `og-image.svg` (1200×630) when you change the social card

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
