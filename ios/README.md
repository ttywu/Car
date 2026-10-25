# Car Dash for iOS

This Xcode project packages the existing Car Dash HTML, CSS, and JavaScript in
a native iOS app. The game loads from the app bundle, so it does not need the
website server or an internet connection to play.

## Build on a Mac

1. Open `ios/CarDash.xcodeproj` in Xcode.
2. Select the `CarDash` target, then choose your Apple Developer team under
   **Signing & Capabilities**.
3. Replace `com.example.CarDash` with a unique bundle identifier you control.
4. Choose an iPhone simulator or connected iPhone and press **Run**.

To distribute through the App Store, the app also needs its own icon, store
listing, screenshots, privacy details, and an archive uploaded from Xcode. App
Review decides whether the game meets its requirements; a web-based game
container is not guaranteed approval.

The project needs Xcode on macOS to build and sign. Do not share your Apple ID
password or signing credentials in this repository.