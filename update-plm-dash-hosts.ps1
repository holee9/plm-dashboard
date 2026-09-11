param(
    [Parameter(Mandatory = $true)]
    [string]$TargetIp,
    [Parameter(Mandatory = $true)]
    [string]$HostName
)

$ErrorActionPreference = 'Stop'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$backupPath = Join-Path $env:TEMP 'hosts.plm-dash.backup'
$lines = if (Test-Path -LiteralPath $hostsPath) {
    Copy-Item -LiteralPath $hostsPath -Destination $backupPath -Force
    Get-Content -LiteralPath $hostsPath
} else {
    @()
}

$updated = foreach ($line in $lines) {
    $commentAt = $line.IndexOf('#')
    $content = if ($commentAt -ge 0) { $line.Substring(0, $commentAt) } else { $line }
    $comment = if ($commentAt -ge 0) { $line.Substring($commentAt) } else { '' }
    $fields = @($content.Trim() -split '\s+' | Where-Object { $_ })

    if ($fields.Count -lt 2) {
        $line
        continue
    }

    $aliases = @($fields[1..($fields.Count - 1)] | Where-Object { $_ -ine $HostName })
    if ($aliases.Count -eq ($fields.Count - 1)) {
        $line
    } elseif ($aliases.Count -gt 0) {
        $rebuilt = '{0}  {1}' -f $fields[0], ($aliases -join '  ')
        if ($comment) { '{0}  {1}' -f $rebuilt, $comment } else { $rebuilt }
    } elseif ($comment) {
        $comment
    }
}

$updated += '{0}  {1}' -f $TargetIp, $HostName
Set-Content -LiteralPath $hostsPath -Value $updated -Encoding ASCII
