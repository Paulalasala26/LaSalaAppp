[CmdletBinding()]
param(
    [string]$FirebaseCredentialsPath = ""
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$TaskName = "Viguerapp GS QC TEST Sync"
$BaseUrl = "https://raw.githubusercontent.com/Paulalasala26/LaSalaAppp/test/v1.0/scripts"

# Actualiza copias locales desde la rama TEST. Cada archivo existente queda con .bak.
$Files = @(
    "pilot_gs_qc_preinjerto.py",
    "pilot_gs_qc_carga_injerto.py",
    "gs_qc_import.py",
    "sync_gs_qc_test.py"
)
foreach ($Name in $Files) {
    $Target = Join-Path $Root $Name
    $Temp = "$Target.download"
    Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$Name" -OutFile $Temp
    if (Test-Path $Target) {
        Copy-Item $Target "$Target.bak" -Force
    }
    Move-Item $Temp $Target -Force
}

$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
if (Test-Path $VenvPython) {
    $Python = $VenvPython
} else {
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $PythonCommand) {
        throw "No encuentro Python. Instálalo o configura .venv\Scripts\python.exe en $Root."
    }
    $Python = $PythonCommand.Source
}

$DependencyCheck = "import mysql.connector, firebase_admin, keyring; from keyring.backends.Windows import WinVaultKeyring"
& $Python -c $DependencyCheck
if ($LASTEXITCODE -ne 0) {
    throw "Faltan dependencias. Instala mysql-connector-python, firebase-admin y keyring en este Python."
}

# Pide las credenciales GS una sola vez y las almacena en Windows Credential Manager.
$CredentialCheck = @'
import keyring
from keyring.backends.Windows import WinVaultKeyring
keyring.set_keyring(WinVaultKeyring())
user = keyring.get_password("ViguerappGS", "mysql-user")
password = keyring.get_password("ViguerappGS", "mysql-password")
if user and password:
    print("Credenciales GS ya disponibles en Windows Credential Manager.")
else:
    import getpass
    user = input("Usuario MySQL [global]: ").strip() or "global"
    password = getpass.getpass("Contraseña MySQL (se guardará localmente): ")
    if not password:
        raise SystemExit("No se indicó contraseña; no se registró la tarea.")
    keyring.set_password("ViguerappGS", "mysql-user", user)
    keyring.set_password("ViguerappGS", "mysql-password", password)
    print("Credenciales GS guardadas localmente.")
'@
$CredentialScript = Join-Path $env:TEMP "viguerapp_gs_keyring_setup.py"
Set-Content -Path $CredentialScript -Value $CredentialCheck -Encoding UTF8
try {
    & $Python $CredentialScript
    if ($LASTEXITCODE -ne 0) { throw "No se pudieron guardar las credenciales GS." }
} finally {
    Remove-Item $CredentialScript -Force -ErrorAction SilentlyContinue
}

if (-not $FirebaseCredentialsPath) {
    $FirebaseCredentialsPath = Read-Host "Ruta del JSON de cuenta de servicio de Firebase TEST"
}
$FirebaseCredentialsPath = [System.IO.Path]::GetFullPath($FirebaseCredentialsPath)
if (-not (Test-Path $FirebaseCredentialsPath -PathType Leaf)) {
    throw "No existe el JSON de credenciales: $FirebaseCredentialsPath"
}
$FirebaseProject = & $Python -c "import json,sys; print(json.load(open(sys.argv[1],encoding='utf-8')).get('project_id',''))" $FirebaseCredentialsPath
if ($LASTEXITCODE -ne 0 -or $FirebaseProject.Trim() -ne "la-sala-app-test") {
    throw "La credencial debe pertenecer a Firebase TEST (la-sala-app-test)."
}

$Runner = Join-Path $Root "sync_gs_qc_test.py"
$Arguments = ('"{0}" --firebase-credentials "{1}"' -f $Runner, $FirebaseCredentialsPath)
$Action = New-ScheduledTaskAction -Execute $Python -Argument $Arguments -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -Daily -At "06:00" -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Hours 14)
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "Lee GS en modo solo lectura y sincroniza QC Preinjerto y Carga Injerto en Firebase TEST; conserva registros existentes." -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Tarea registrada e iniciada: $TaskName"
Write-Host "Horario: cada hora entre 06:00 y 20:00, cuando esta sesión de Windows esté iniciada."
Write-Host "Log: $(Join-Path $Root ('logs\gs_qc_test_' + (Get-Date -Format yyyyMMdd) + '.log'))"
