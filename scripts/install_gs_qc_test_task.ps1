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
$XmlUser = [System.Security.SecurityElement]::Escape([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$XmlPython = [System.Security.SecurityElement]::Escape($Python)
$XmlArguments = [System.Security.SecurityElement]::Escape($Arguments)
$XmlRoot = [System.Security.SecurityElement]::Escape($Root)

$TriggerXml = @()
for ($Hour = 6; $Hour -le 20; $Hour++) {
    $Start = (Get-Date).Date.AddHours($Hour).ToString("yyyy-MM-dd'T'HH:mm:ss")
    $TriggerXml += "<CalendarTrigger><StartBoundary>$Start</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>"
}
$Triggers = $TriggerXml -join ""

$TaskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Lee GS y sincroniza QC Preinjerto y Carga Injerto en Firebase TEST, conservando inspecciones existentes.</Description></RegistrationInfo>
  <Triggers>$Triggers</Triggers>
  <Principals><Principal id="Author"><UserId>$XmlUser</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowHardTerminate>true</AllowHardTerminate>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT20M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>$XmlPython</Command><Arguments>$XmlArguments</Arguments><WorkingDirectory>$XmlRoot</WorkingDirectory></Exec></Actions>
</Task>
"@

$TaskXmlPath = Join-Path $env:TEMP "viguerapp_gs_qc_test_task.xml"
Set-Content -Path $TaskXmlPath -Value $TaskXml -Encoding Unicode
try {
    & "$env:SystemRoot\System32\schtasks.exe" /Create /TN $TaskName /XML $TaskXmlPath /F
    if ($LASTEXITCODE -ne 0) { throw "schtasks.exe no pudo registrar la tarea." }
} finally {
    Remove-Item $TaskXmlPath -Force -ErrorAction SilentlyContinue
}

& "$env:SystemRoot\System32\schtasks.exe" /Run /TN $TaskName
if ($LASTEXITCODE -ne 0) { throw "La tarea quedó registrada, pero no se pudo iniciar ahora." }
Write-Host "Tarea registrada e iniciada: $TaskName"
Write-Host "Horario: cada hora entre 06:00 y 20:00, cuando esta sesión de Windows esté iniciada."
Write-Host "Log: $(Join-Path $Root ('logs\gs_qc_test_' + (Get-Date -Format yyyyMMdd) + '.log'))"
