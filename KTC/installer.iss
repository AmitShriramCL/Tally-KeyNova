; KTC Connector -- Inno Setup installer script
; Requires: Inno Setup 6  (https://jrsoftware.org/isinfo.php)
;
; To build the installer:
;   1. First run build.bat to produce dist\KTC-Connector.exe
;   2. Open this file in Inno Setup Compiler and click Build > Compile
;   3. Installer will be created at:  installer_output\KTC-Connector-Setup.exe
;
; The installer:
;   - Needs no administrator rights (installs per-user)
;   - Copies KTC-Connector.exe to %LocalAppData%\KTCConnector\
;   - Creates a Start Menu shortcut
;   - Launches the app at the end of installation
;   - The app itself handles adding to Windows startup (winreg)

[Setup]
AppName=KTC Connector
AppVersion=1.0
AppPublisher=KeyNova
DefaultDirName={localappdata}\KTCConnector
DefaultGroupName=KTC Connector
OutputDir=installer_output
OutputBaseFilename=KTC-Connector-Setup
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\KTC-Connector.exe
WizardStyle=modern

[Files]
Source: "dist\KTC-Connector.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\KTC Connector";           Filename: "{app}\KTC-Connector.exe"
Name: "{group}\Uninstall KTC Connector"; Filename: "{uninstallexe}"

[Run]
; Launch the app silently after install — it will appear in the system tray
Filename: "{app}\KTC-Connector.exe"; \
    Description: "Start KTC Connector now"; \
    Flags: postinstall nowait skipifsilent

[UninstallRun]
; Remove from Windows startup when uninstalling
Filename: "reg.exe"; \
    Parameters: "delete ""HKCU\Software\Microsoft\Windows\CurrentVersion\Run"" /v KTCConnector /f"; \
    Flags: runhidden waituntilterminated

[Messages]
WelcomeLabel2=This will install KTC Connector on your computer.%n%nKTC Connector runs in the background (system tray) and bridges the KeyNova web app to your TallyPrime software.%n%nYou only need to install this once. It will start automatically every time Windows starts.
