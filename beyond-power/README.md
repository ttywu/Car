# Beyond Power Control

A desktop app for controlling a Beyond Power resistance machine (such as the
Voltra) from your PC over Bluetooth. It is an installable web app: it runs in
its own window, works offline, and uses the Bluetooth built into Chrome or Edge.

## Run it on your PC

You need Python 3 and Chrome or Edge, plus Bluetooth on the PC.

- **Windows:** double-click `start-windows.bat`. It opens the app in its own
  Edge window.
- **macOS / Linux:** run `./start-mac-linux.sh`.

To keep it as a real app, click **Install app** in the top bar (or use the
install icon in the address bar). After that it shows up in the Start menu or
Launchpad like any other program.

Try **Demo mode** first to see the controls without a machine.

## Controls

- Weight: −5 / −1 / +1 / +5 buttons or the slider (5–200 lb). Click `lb` to
  switch to kg.
- Modes: Weight, Eccentric, Chains, Isokinetic, Elastic.
- **Load** applies resistance. **STOP / Unload** or the `Esc` key releases it
  at any time. The app also unloads if the machine disconnects or the window is
  closed.
- Live reps, force, cable position and a force graph come from the machine's
  telemetry.

## Setting up your machine (important)

Beyond Power has not published the Bluetooth commands its machines use, so the
app does not ship with them. You set them once in **Machine profile**:

1. Turn the machine on and close the official Beyond Power app on your phone
   (the machine only accepts one connection).
2. Click **Connect machine** and pick it from the list. If the name doesn't
   show up, clear the "Device name starts with" field.
3. The **GATT explorer** lists every service and characteristic the app can
   see. Use **Read**, **Subscribe** and **Write** to try them; results appear
   in the log. If the machine's own service is missing, find its UUID with the
   free nRF Connect app on your phone, put it in "Service UUID", save and
   reconnect.
4. To learn the exact commands, capture what the official app sends (for
   example with Android's Bluetooth HCI snoop log) and enter them as hex bytes.
   Placeholders insert the current setting, for example
   `01 {weight_lb10:u16le}` sends `01` followed by the weight in tenths of a
   pound as a little-endian 16-bit number.
5. Click **Save profile**. Use **Export** to keep a copy or share it.

Until a command is filled in, that button only writes a note in the log and
sends nothing to the machine.

Safety: test new commands at a light weight, standing clear of the cable, and
keep `Esc` within reach.
