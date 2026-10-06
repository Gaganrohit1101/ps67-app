# Run in an Administrator PowerShell. Only the four demo ports on Wi-Fi are allowed.
$ErrorActionPreference = 'Stop'
$taskAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $taskAdmin) { throw 'Open PowerShell as Administrator, then run this script again.' }
$taskNic = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address -and $_.InterfaceAlias -eq 'Wi-Fi' } | Select-Object -First 1
if (-not $taskNic) { throw 'No connected Wi-Fi interface found.' }
$taskAddress = $taskNic.IPv4Address.IPAddress
$taskName = 'PS67-LAN-Demo'
$taskExisting = Get-NetFirewallRule -Name $taskName -ErrorAction SilentlyContinue
if ($taskExisting) {
    Set-NetFirewallRule -Name $taskName -Enabled True -Direction Inbound -Action Allow -Profile Private,Public -Protocol TCP -LocalPort 5000,8000,8001,8002 -LocalAddress $taskAddress -RemoteAddress LocalSubnet -InterfaceAlias $taskNic.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
} else {
    New-NetFirewallRule -Name $taskName -DisplayName 'PS67 LAN demo (Wi-Fi only)' -Enabled True -Direction Inbound -Action Allow -Profile Private,Public -Protocol TCP -LocalPort 5000,8000,8001,8002 -LocalAddress $taskAddress -RemoteAddress LocalSubnet -InterfaceAlias $taskNic.InterfaceAlias -EdgeTraversalPolicy Block | Out-Null
}
Write-Output "PS67 firewall access enabled for local Wi-Fi devices at $taskAddress on ports 5000, 8000, 8001 and 8002."
