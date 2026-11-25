# Contributing

Thanks for helping improve LeanToken. Contributions should fit the existing dependency-free Node.js CLI and preserve its cross-platform behavior.

## Before opening a pull request

1. Open an issue for substantial behavior changes so the approach can be discussed.
2. Keep changes focused and update the relevant usage or architecture documentation when behavior changes.
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

## Reporting issues

Use the GitHub issue templates for bug reports and feature requests. Include a minimal reproduction, expected behavior, actual behavior, and relevant Node.js and operating-system versions. Do not include secrets, private transcripts, or sensitive repository content.

## License

By submitting a contribution, you agree that it is distributed under the repository's MIT License.
