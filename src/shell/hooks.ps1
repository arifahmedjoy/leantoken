# LeanToken PowerShell Integration Hook
# Source this file in $PROFILE to automatically route common verbose commands through lean prune:
# . D:\lean-token\src\shell\hooks.ps1

function git {
    param([Parameter(ValueFromRemainingArguments = $true)]$args)
    if ($args.Count -gt 0 -and ($args[0] -eq 'status' -or $args[0] -eq 'st' -or $args[0] -eq 'diff' -or $args[0] -eq 'log')) {
        & node "D:\lean-token\bin\lean.js" prune git $args
    } else {
        & (Get-Command git.exe -CommandType Application) $args
    }
}

function pytest {
    param([Parameter(ValueFromRemainingArguments = $true)]$args)
    & node "D:\lean-token\bin\lean.js" prune pytest $args
}

Write-Host "⚡ LeanToken shell hooks active (zero-latency command pruning enabled)" -ForegroundColor Cyan
