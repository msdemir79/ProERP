# DMR Nexus uygulamasının ProERP adlı Windows hizmetinin başlatma komutunu günceller; veri ve paketlere dokunmaz.
# Yönetici PowerShell: & 'E:\ProERP\scripts\repair-proerp-service.ps1'
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nssm = 'C:\NSSM\win64\nssm.exe'
$node = 'C:\Program Files\nodejs\node.exe'
foreach ($file in @($nssm, $node, (Join-Path $projectRoot 'dist\server.cjs'))) {
  if (-not (Test-Path -LiteralPath $file)) { throw "Gerekli dosya bulunamadı: $file" }
}
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'DMR Nexus hizmet ayarları için PowerShell Yönetici olarak açılmalı.'
}
$service = Get-Service -Name ProERP
if ($service.Status -ne 'Running') {
  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    throw '3000 portunda geçici bir sunucu çalışıyor. Önce geliştirme sunucusunu durdurun, sonra bu betiği yeniden çalıştırın.'
  }
}
& $nssm set ProERP Application $node
if ($LASTEXITCODE -ne 0) { throw 'ProERP Application ayarı başarısız.' }
& $nssm set ProERP AppParameters 'scripts\start.mjs'
if ($LASTEXITCODE -ne 0) { throw 'ProERP AppParameters ayarı başarısız.' }
& $nssm set ProERP AppDirectory $projectRoot
if ($LASTEXITCODE -ne 0) { throw 'ProERP AppDirectory ayarı başarısız.' }
Set-Service -Name ProERP -StartupType Automatic
if ((Get-Service -Name ProERP).Status -eq 'Running') { Restart-Service -Name ProERP }
else { Start-Service -Name ProERP }
for ($attempt = 0; $attempt -lt 15; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 5
    $running = (Get-Service -Name ProERP).Status -eq 'Running'
    $production = -not $health.database.PSObject.Properties['version']
    if ($health.status -eq 'ok' -and $running -and $production) {
      Write-Output 'DMR Nexus üretim hizmeti çalışıyor: http://localhost:3000'
      exit 0
    }
  } catch { Start-Sleep -Seconds 2 }
}
throw 'Hizmet başladı fakat sağlık kontrolü geçmedi. logs/service-out.log ve logs/service-error.log dosyalarını inceleyin.'
