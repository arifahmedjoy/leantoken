# LeanToken PowerShell Integration Hook (Windows PowerShell 5.1 and PowerShell 7 on Windows, macOS, Linux)
# From the repository root, dot-source this file to route common verbose
# commands through lean prune:
# . ./src/shell/hooks.ps1

$script:LeanTokenCli = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($PSScriptRoot, '..', '..', 'bin', 'lean.js'))
# The real git executable (git.exe on Windows, git elsewhere), resolved once
$script:LeanTokenGit = (Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source

function git {
    if ($args.Count -gt 0 -and @('status', 'st', 'diff', 'log') -contains $args[0]) {
        & node $script:LeanTokenCli prune git @args
    } else {
        & $script:LeanTokenGit @args
    }
}

function pytest {
    & node $script:LeanTokenCli prune pytest @args
}

Write-Host "⚡ LeanToken shell hooks active (zero-latency command pruning enabled)" -ForegroundColor Cyan
