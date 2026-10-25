# Beyond Power Control for Windows, Linux and Mac

A desktop app for controlling a Beyond Power resistance machine (such as the
Voltra) over Bluetooth. It installs and runs like any other program. It uses the
same screen as `beyond-power/`, packaged with Electron.

## Download

Every push that changes the app runs the **Build desktop app** workflow on
GitHub. Open the repository's **Actions** tab, click the latest
**Build desktop app** run, and download from **Artifacts**:

| Your computer | Download | Then |
| --- | --- | --- |
| Windows 10/11 | `beyond-power-control-windows` | Run `Beyond-Power-Control-…-win-x64.exe` to install, or use the `-portable.exe`, which needs no install. |
| Linux (Ubuntu, Debian, Mint) | `beyond-power-control-linux` | `sudo apt install ./Beyond-Power-Control-…-linux-amd64.deb` |
| Any other Linux | `beyond-power-control-linux` | `chmod +x Beyond-Power-Control-…-linux-x86_64.AppImage`, then run it. |
| Mac | `beyond-power-control-mac` | Open the `.dmg` and drag the app to Applications. |

The apps are not code-signed. On Windows, if SmartScreen warns, click
**More info › Run anyway**. On a Mac, right-click the app and choose **Open** the
first time.

## Bluetooth notes

- **Windows:** Bluetooth must be on (Settings › Bluetooth & devices).
- **Linux:** needs BlueZ, which most desktops include. Make sure Bluetooth is on
  (`bluetoothctl power on`). If the machine asks for a PIN, pair it once in
  your system Bluetooth settings, then connect from the app.
- Close the Beyond Power phone app first. The machine accepts one connection
  at a time.

Click **Connect machine** and pick your machine from the list. **Demo mode**
shows the controls without a machine. See `beyond-power/README.md` for how to
fill in the machine profile. Beyond Power has not published its Bluetooth
commands, so you have to add them once before the app can move the machine.

## Build it yourself

You need Node.js 22.

```sh
cd desktop
npm install
npm start            # run without installing
npm run dist:win     # Windows installer (build on Windows)
npm run dist:linux   # AppImage and .deb (build on Linux)
npm run dist:mac     # .dmg (build on a Mac)
```

Installers land in `desktop/dist/`. The UI files are copied in from
`beyond-power/` at build time, so edit them there.
