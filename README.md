# Car Dash

A browser-based car game. Once published, it will be available at
<https://ttywu.github.io/Car/>.

Use the Left/Right arrow keys or A/D to dodge traffic. Hold Up/W to accelerate
and Down/S to slow down. Pull into the matching edge lane as a gas station
passes to refill your fuel. On touch screens, use the steering and pedal buttons
below the road. Hit another car to win; use Play again to start a new run. Your
best score is saved in your browser.

## Playing locally

In VS Code, run **Terminal: Run Task** and choose **Play Car Dash (local
server)**. Then open <http://localhost:8000/> in a browser.

## Publishing

The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes
the site to GitHub Pages whenever changes are pushed to `main`. After the
workflow completes, the game is available at <https://ttywu.github.io/Car/>.

## iOS app

See [ios/README.md](ios/README.md) for opening and building the iOS app in Xcode.

## iPhone demo video

[media/car-dash-iphone-demo.mp4](media/car-dash-iphone-demo.mp4) is a one-minute
recording of Car Dash in an emulated iPhone 17 Pro screen. Regenerate it with
`node tools/record-iphone-demo.js` (requires Playwright and ffmpeg).
