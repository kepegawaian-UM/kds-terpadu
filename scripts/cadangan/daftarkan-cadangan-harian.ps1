# Mendaftarkan cadangan harian otomatis di Windows Task Scheduler (seperti "KDS2 Backup Harian").
# Jalankan SEKALI, di PowerShell biasa (bukan Administrator) milik pengguna yang akan menjalankannya.
#   powershell -ExecutionPolicy Bypass -File scripts\cadangan\daftarkan-cadangan-harian.ps1 -Jam "17:30"
# Tugas memakai StartWhenAvailable: bila komputer mati pada jam itu, dijalankan begitu komputer menyala.
# Hapus tugas:  Unregister-ScheduledTask -TaskName "KDS Terpadu Cadangan Harian" -Confirm:$false

param(
    [string]$Jam = "17:30",
    [string]$NamaTugas = "KDS Terpadu Cadangan Harian"
)

$ErrorActionPreference = "Stop"
$skrip = Join-Path $PSScriptRoot "cadangkan-database.ps1"
if (-not (Test-Path $skrip)) { throw "cadangkan-database.ps1 tidak ditemukan di $PSScriptRoot" }

$aksi = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $skrip)
$pemicu = New-ScheduledTaskTrigger -Daily -At $Jam
$setelan = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $NamaTugas -Action $aksi -Trigger $pemicu -Settings $setelan -Description "Cadangan harian database KDS Terpadu ke Google Drive" -Force | Out-Null
Write-Host "Terdaftar: '$NamaTugas' setiap hari pukul $Jam. Periksa hasilnya di cadangan.log pada folder tujuan."
