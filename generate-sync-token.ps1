param(
  [int]$Bytes = 32
)

$buffer = New-Object byte[] $Bytes
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
$token = [BitConverter]::ToString($buffer) -replace '-', ''
Write-Host $token
