# LeanToken PowerShell Integration Hook
# From the repository root, dot-source this file to route common verbose
# commands through lean prune:
# . .\src\shell\hooks.ps1

$script:LeanTokenCli = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\bin\lean.js'))

function git {
    param([Parameter(ValueFromRemainingArguments = $true)]$args)
    if ($args.Count -gt 0 -and ($args[0] -eq 'status' -or $args[0] -eq 'st' -or $args[0] -eq 'diff' -or $args[0] -eq 'log')) {
        & node $script:LeanTokenCli prune git $args
    } else {
        $realGit = (Get-Command git.exe -CommandType Application | Select-Object -First 1).Source
        & $realGit $args
    }
}

function pytest {
    param([Parameter(ValueFromRemainingArguments = $true)]$args)
    & node $script:LeanTokenCli prune pytest $args
}

Write-Host "⚡ LeanToken shell hooks active (zero-latency command pruning enabled)" -ForegroundColor Cyan
