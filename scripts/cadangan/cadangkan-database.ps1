# Cadangan database KDS Terpadu (PostgreSQL) ke folder (mis. Google Drive).
#
# Cara kerja: membaca CADANGAN_DATABASE_URL dari berkas .env.cadangan (TIDAK di-commit) atau dari variabel
# lingkungan, menjalankan pg_dump (format custom, termampat), memeriksa hasilnya dengan pg_restore --list,
# lalu menghapus cadangan yang lebih tua dari -SimpanHari. Kata sandi tidak pernah dicetak atau dicatat.
#
# PENTING untuk Neon: pakai alamat koneksi LANGSUNG (tanpa "-pooler" di nama host), bukan alamat pooled.
#
# Contoh:  powershell -ExecutionPolicy Bypass -File scripts\cadangan\cadangkan-database.ps1
#          ... -Tujuan "G:\My Drive\_OLD ARCHIVE\__ANAS\bak\kds-terpadu" -SimpanHari 45

param(
    [string]$BerkasEnv = "",
    [string]$Tujuan = "G:\My Drive\_OLD ARCHIVE\__ANAS\bak\kds-terpadu",
    [int]$SimpanHari = 45
)

$ErrorActionPreference = "Stop"
$akar = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ($BerkasEnv -eq "") { $BerkasEnv = Join-Path $akar ".env.cadangan" }

function Tulis-Log([string]$pesan) {
    $baris = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $pesan
    Write-Host $baris
    if (Test-Path $Tujuan) { Add-Content -Path (Join-Path $Tujuan "cadangan.log") -Value $baris -Encoding UTF8 }
}

# 1. alamat koneksi
$url = $env:CADANGAN_DATABASE_URL
if (-not $url -and (Test-Path $BerkasEnv)) {
    $baris = Get-Content $BerkasEnv | Where-Object { $_ -match '^\s*CADANGAN_DATABASE_URL\s*=' } | Select-Object -First 1
    if ($baris) { $url = ($baris -replace '^\s*CADANGAN_DATABASE_URL\s*=\s*', '').Trim().Trim('"') }
}
if (-not $url) { throw "CADANGAN_DATABASE_URL tidak ditemukan (isi di $BerkasEnv atau variabel lingkungan)." }
if ($url -match '-pooler') { throw "Gunakan alamat koneksi LANGSUNG (tanpa '-pooler'): pg_dump tidak cocok dengan pooler." }

# 2. cari pg_dump / pg_restore
function Cari-Alat([string]$nama) {
    $perintah = Get-Command $nama -ErrorAction SilentlyContinue
    if ($perintah) { return $perintah.Source }
    $kandidat = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$nama.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($kandidat) { return $kandidat.FullName }
    throw "$nama tidak ditemukan. Pasang PostgreSQL (alat klien) atau tambahkan folder bin-nya ke PATH."
}
$pgDump = Cari-Alat "pg_dump"
$pgRestore = Cari-Alat "pg_restore"

# 3. buat cadangan
New-Item -ItemType Directory -Force -Path $Tujuan | Out-Null
$nama = "kds_terpadu_{0:yyyyMMdd_HHmmss}.dump" -f (Get-Date)
$berkas = Join-Path $Tujuan $nama
try {
    & $pgDump --format=custom --no-owner --no-privileges "--dbname=$url" "--file=$berkas"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal (kode $LASTEXITCODE)" }

    # 4. periksa: berkas ada, tidak kosong, dan bisa dibaca pg_restore
    $ukuran = (Get-Item $berkas).Length
    if ($ukuran -lt 1024) { throw "berkas cadangan terlalu kecil ($ukuran byte)" }
    $isi = & $pgRestore --list $berkas
    if ($LASTEXITCODE -ne 0 -or ($isi | Measure-Object).Count -lt 10) { throw "berkas cadangan tidak dapat dibaca pg_restore" }
    Tulis-Log ("OK  {0}  {1:N1} MB" -f $nama, ($ukuran / 1MB))
} catch {
    if (Test-Path $berkas) { Remove-Item $berkas -Force }
    Tulis-Log ("GAGAL  {0}" -f ($_.Exception.Message -replace [regex]::Escape($url), '***'))
    exit 1
}

# 5. hapus cadangan lama
$batas = (Get-Date).AddDays(-$SimpanHari)
Get-ChildItem $Tujuan -Filter "kds_terpadu_*.dump" | Where-Object { $_.LastWriteTime -lt $batas } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Tulis-Log ("hapus cadangan lama {0}" -f $_.Name)
}
