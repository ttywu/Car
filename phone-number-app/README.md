# 📱 My Phone — a real phone number without a SIM chip

This app gives you a **real phone number** that works in any web browser (phone or computer).

- ✅ Get a number (USA, Canada, UK and more)
- ✅ Send texts
- ✅ Receive texts (good for verification codes)
- ✅ People can call you and leave **voicemail**, and you listen in the app

It uses **Twilio**, a phone company for apps. A number costs about **$1–2 a month**, plus about 1¢ per text.

---

## Step 1: Make a Twilio account

1. Go to <https://www.twilio.com/try-twilio> and sign up.
2. Add some money ($20 is plenty) under **Billing**. A free trial works too, but it can only text numbers you verify first.
3. On the main page (<https://console.twilio.com>) find **Account SID** and **Auth Token**. You will need both.

## Step 2: Put the app online (free, with Render)

Twilio needs a web address so it can send your texts and calls to the app.

1. Go to <https://render.com> and sign up with GitHub.
2. Click **New → Web Service** and pick this repository.
3. Set:
   - **Root Directory:** `phone-number-app`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Under **Environment**, add:
   | Name | Value |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | your Account SID |
   | `TWILIO_AUTH_TOKEN` | your Auth Token |
   | `APP_PASSWORD` | a password you choose |
   | `PUBLIC_URL` | your Render address, like `https://my-phone.onrender.com` |
5. Click **Deploy**.

## Step 3: Use it

1. Open your Render address in the browser.
2. Log in. The username can be anything; the password is your `APP_PASSWORD`.
3. Go to **Get Number**, pick a country, tap **Find numbers**, then **Get this one**.
4. Done! 🎉 Your texts and voicemail will show up in **Inbox**.

Tip: on your phone, use **Add to Home Screen** so it opens like an app.

---

## Run on your own computer instead

```bash
cd phone-number-app
cp .env.example .env     # then fill in the values
npm install
npm start                # open http://localhost:3000
```

To receive texts on your computer, you also need a public address, for example from [ngrok](https://ngrok.com): run `ngrok http 3000`, put the `https://…` address in `PUBLIC_URL`, restart, then tap **Link** on your number.

## Good to know

- **Removing a number** stops the monthly cost, but you lose that number forever.
- Your inbox is saved in `data.json`. On Render's free plan, this file is erased when the app restarts. Your texts are still in your Twilio account under **Monitor → Logs → Messaging**.
- Some apps and banks don't accept internet numbers like this one for verification codes.
- Some countries (e.g. Germany, France, Israel) need you to send ID papers to Twilio before you can get a number there.
