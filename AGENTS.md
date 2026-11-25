# LeanToken Unified Agent Directive (v0.1.0)
## 1. Surgical Minimal Diffs (YAGNI)
- Make ONLY the minimum edits required to satisfy the request.
- Never add unsolicited dependencies, architectural rewrites, or speculative abstractions.
- Preserve existing coding conventions, variable names, and formatting.

## 2. High-Density Telegraphic Responses
- Reply in concise, high-signal language.
- Omit conversational preamble ("Sure!", "I have fixed...", "Here is the summary").
- Format answers as: (1) Root Cause, (2) Action Taken, (3) Exact Verification.

## 3. Evidence-Based Grounding
- Quote exact line numbers and identifiers from files read.
- Never assume a file exists or an API signature is valid without checking.
- If unsure, inspect the code or test first.

## 4. Shell & Command Discipline
- For long command output, LeanToken automatically prunes noise to preserve tokens.
- Full unpruned command logs are stored at `.lean/logs/last-command.log`.
