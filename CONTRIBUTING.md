# Contributing

Thanks for helping improve LeanToken. Contributions should fit the existing dependency-free Node.js CLI and preserve its cross-platform behavior.

## Before opening a pull request

1. Open an issue for substantial behavior changes so the approach can be discussed.
2. Keep changes focused. In the same change, add an entry under `## [Unreleased]` in `CHANGELOG.md` (CI fails pull requests that change `src/` or `bin/` without one), update `ROADMAP.md` when an item starts, ships or is dropped, and update `README.md`, `docs/usage.md` and `docs/09-system-architecture.md` when behavior or structure changes. Savings and latency figures must be measured (`lean audit`, `npm run benchmark`).
3. Run the tests and benchmark:

   ```sh
   npm test
   npm run benchmark
   ```

   To run one component's test group:

   ```sh
   node -e "require('./test/pruner.test').run()"
   ```

4. Describe the behavior changed, the commands used to verify it, and any platform-specific limitations in the pull request.

The test runner uses Node's built-in `assert`; there is no separate build or lint step configured at present. CI checks Node.js 18, 20, and 22 on Linux, macOS, and Windows.

## Releasing

Maintainers run `npm version patch|minor|major`, then `git push --follow-tags`. The `Release to npm` workflow (`.github/workflows/release.yml`) publishes any version on `main` that is not on npm yet, tags it and creates the GitHub Release from its changelog entry. Do not run `npm publish` by hand.

## Reporting issues

Use the GitHub issue templates for bug reports and feature requests. Include a minimal reproduction, expected behavior, actual behavior, and relevant Node.js and operating-system versions. Do not include secrets, private transcripts, or sensitive repository content.

## License

By submitting a contribution, you agree that it is distributed under the repository's MIT License.
