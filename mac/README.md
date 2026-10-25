# Beyond Power Control for Mac

A native macOS app (SwiftUI + CoreBluetooth) for controlling a Beyond Power
resistance machine, such as the Voltra, from your Mac.

## Install it on your Mac with Xcode

1. Install Xcode 15 or later from the Mac App Store. The app needs macOS 13
   (Ventura) or later.
2. Open `mac/BeyondPower.xcodeproj` in Xcode.
3. At the top of the window, make sure the scheme is **BeyondPower** and the
   destination is **My Mac**.
4. Press **Run** (⌘R). The app opens, and macOS asks to let it use Bluetooth.
   Click **Allow**.

If Xcode shows a signing error, click the project in the sidebar, choose the
**BeyondPower** target, open **Signing & Capabilities**, and pick your Apple ID
under **Team** (any free Apple ID works) or set it to **Sign to Run Locally**.
If the bundle ID is taken, change `com.example.BeyondPowerControl` to
something unique.

### Keep it in Applications

To have it like any other app, without opening Xcode each time:

1. In Xcode choose **Product › Archive**.
2. In the Organizer window, click **Distribute App › Custom › Copy App**, and
   save it.
3. Drag **Beyond Power Control.app** into your **Applications** folder.

## Using it

- **Demo mode** shows the controls working without a machine.
- **Connect** tab: turn the machine on, close the Beyond Power phone app (the
  machine accepts one connection at a time), click **Scan**, then **Connect**.
- Weight: −5 / −1 / +1 / +5 or the slider (5–200 lb); click `lb` to switch to
  kg. Modes: Weight, Eccentric, Chains, Isokinetic, Elastic.
- **Load** applies resistance. **STOP / Unload** or the `Esc` key releases it.
  The app also unloads when the machine disconnects or the app quits.
- Live reps, force, cable position and a force graph.

## Setting up your machine

Beyond Power has not published its Bluetooth commands, so the app doesn't ship
with them. You set them once:

1. Connect, then open the **Explorer** tab. It lists every service and
   characteristic on the machine. Use **Read**, **Subscribe** and **Write** to
   try them; results show in the **Log** tab and along the bottom of the window.
2. Use **Use in profile** on a characteristic to make it the write (commands)
   or notify (live data) characteristic.
3. In **Machine profile**, enter the commands as hex bytes. Placeholders insert
   the current setting, for example `01 {weight_lb10:u16le}` sends `01`
   followed by the weight in tenths of a pound as a little-endian 16-bit
   number. To learn the real commands, capture what the official phone app
   sends (for example with Android's Bluetooth HCI snoop log).
4. Click **Save profile**. **Export…** and **Import…** use the same JSON format
   as the web version in `beyond-power/`, so profiles work in both.

Until a command is filled in, its button only writes a note in the log and
sends nothing to the machine. Test new commands at a light weight, standing
clear of the cable, and keep `Esc` within reach.
