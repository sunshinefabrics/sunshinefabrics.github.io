# Sunshine Fabrics — Stock Register

Inward / outward stock software for fabric quality, colour and quantity.
It runs entirely in the browser. There is no server to maintain.

## Files

| File | What it is |
|---|---|
| `index.html` | The screens |
| `css/app.css` | All styling |
| `js/config.js` | **The only file you normally edit** — business name, Google Client ID |
| `js/store.js` | The register: entries, stock calculation, merging |
| `js/drive.js` | Google Drive sync |
| `js/ui.js` | Forms, tables, printing |

## Hosting

Upload the whole folder. Anything that serves static files works — Netlify,
Vercel, GitHub Pages, Cloudflare Pages, or ordinary cPanel hosting. `index.html`
must sit at the top of the folder.

Use **https**, not http. Google sign-in will not work otherwise.

It also runs without any hosting at all: open `index.html` straight from the
folder. Everything works except Google Drive, which Google only permits on a
real https address.

---

## How the data is kept safe

Three rules the software follows:

1. **This device is the master copy.** Every entry is written to the browser's
   own storage the moment you press Save, before anything is sent anywhere. If
   the internet is down, Google is unreachable, or the sign-in has run out,
   nothing is lost.

2. **Drive is merged, never overwritten.** Before writing to Drive the software
   checks whether the copy there has changed. If it has, it pulls that copy and
   combines it with this one. Each entry has its own identity, so two devices
   that both worked offline end up with the union of their work — no one's
   entries disappear. This is the mistake that cost data in the earlier version.

   Drive cannot be told *"write this only if nobody else has"*, so after
   writing, the software looks again. If another device got in during that
   moment, its entries are pulled back and the two are written together.

   The same applies to two tabs or windows open on one computer: a tab folds in
   whatever the other one saved before writing, and each tab shows the other's
   entries straight away without a reload.

3. **Nothing is ever deleted.** A wrong entry is *voided*: it stays in History
   marked as voided, and the stock is recalculated. A correction voids the old
   entry and writes a new one beside it. The Stock screen, the History screen
   and the CSV always add up to the same figures.

### Still take backups

Setup → **Download Backup** saves the whole register as one file. That copy
depends on neither this browser nor Google. Do it weekly. **Restore from
Backup** puts it back.

---

## Turning on Google Drive sync

Without this, the software works perfectly well on one computer. Set it up when
the register needs to be shared between, say, the counter PC and the owner's
phone.

The register is kept as **one file in your own Google Drive**. The software can
only see that one file — the permission it asks for (`drive.file`) does not let
it read anything else in your Drive.

### 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/>
2. Top bar → **Select a project** → **New Project**
3. Name it `Sunshine Fabrics` → **Create**

### 2. Switch on the Drive API

1. Left menu → **APIs & Services** → **Library**
2. Search **Google Drive API** → **Enable**

### 3. Fill in the consent screen

1. **APIs & Services** → **OAuth consent screen**
2. User type **External** → **Create**
3. App name `Sunshine Fabrics`, your email in both email boxes → **Save and Continue**
4. **Scopes** → **Add or Remove Scopes** → tick
   `https://www.googleapis.com/auth/drive.file` → **Update** → **Save and Continue**
5. **Test users** → **Add Users** → add every Google account that will use the
   software → **Save and Continue**

> While the app is in *Testing*, only the accounts listed as test users can sign
> in, and they must sign in again every 7 days. Press **Publish App** on the
> consent screen to stop that. `drive.file` is a non-sensitive permission, so
> Google does not require a security review for it.

### 4. Create the Client ID

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
2. Application type **Web application**
3. Under **Authorised JavaScript origins** → **Add URI**, enter exactly:

   ```
   https://sunshinefabrics.github.io
   ```

   No trailing slash, no `/index.html`. If it is ever moved to another address,
   add that one too. The Setup tab always shows the address to use, read from
   wherever the software is actually running.
4. **Create**, then copy the **Client ID** (it ends in `.apps.googleusercontent.com`)

### 5. Paste it in

Open `js/config.js` and put it between the quotes:

```js
googleClientId: "1234567890-abcdefg.apps.googleusercontent.com",
```

Re-upload that file. A **Connect Google Drive** button now appears in the bar
under the heading.

> The Client ID is public by design and it is safe in this file. Google only
> accepts it from the addresses listed in step 3, so nobody else can use it.
> **A Client Secret is a different thing — this software never needs one. Do not
> put a secret in these files.**

### Using it day to day

Everything to do with Drive lives at the top of the **Setup** tab, and the bar
under the heading mirrors it.

| Button | What it does |
|---|---|
| **Connect Google Drive** | Signs in. Pulls whatever is already in Drive and merges it with this device. |
| **Sync now** | Pushes this device's changes up straight away, without waiting. |
| **Refresh from Drive** | Pulls the Drive copy and merges it in at once. You should rarely need it — see below. |
| **Disconnect** | Stops syncing. The register stays on this device. |

- After connecting, it saves by itself a few seconds after each change, and
  again on the way out if the phone is put away mid-entry.
- **It keeps up with the other devices on its own.** Every minute, and whenever
  the window is brought back to the front, it asks Drive whether anything has
  changed and pulls it in. So the counter PC and the owner's phone show the
  same figures without anyone pressing anything. A device with nothing to say
  only asks the question — it does not write. Change how often in
  `js/config.js` with `drivePollSeconds`.
- Google's sign-in lasts about an hour. When it runs out the software asks
  Google for a new one quietly, and usually gets it, so nothing appears on
  screen. If Google will not — the account was signed out, or the app is still
  in *Testing* and the seven days are up — the bar says **Reconnect** and shows
  how many changes are waiting. They are safe on the device; press Reconnect
  and they go up.
- On a second device, sign in with the same Google account and press Connect.
  The two registers merge; neither one's entries are lost.
- Opening the register on the same computer when it is already open in another
  tab is safe. Both tabs stay in step.

### Who can actually see the register

The register lives in **one Google account's Drive**, so that account is what
protects it. Two things follow.

**Somebody else opening the web address sees nothing of yours.** The page is
public, but the data is not in the page. If a stranger signs in with their own
Google account they get an empty register in *their* Drive. They cannot reach
yours, because the permission the software asks for (`drive.file`) only ever
shows it files it created itself, in whichever account is signed in.

**The danger is the opposite one: the right person signing in with the wrong
account.** Use a personal Gmail on the shop's phone by mistake and the whole
register would be copied into that personal Drive, and from then on that device
would quietly keep a second, separate register. Nobody would notice for weeks.

So the software is tied to the account that owns the register. `js/config.js`:

```js
allowedGoogleAccounts: ["app.sunshinefabrics@gmail.com"],
```

Sign in with anything else and it refuses before sending a single entry, says
which account was used and which was expected, and keeps everything safely on
the device. The Setup tab always shows which account is signed in, so a wrong
one is visible rather than silent. Leave the list empty to allow any account.

> This is a guard against mistakes, not a lock. Anyone who can read these files
> could edit out the check — but it would gain them nothing, because the data is
> not in the files. **The real protection is the Google account's own password
> and two-step verification.** Put 2-step verification on that account; it is
> the one thing that actually keeps the figures private.

### If two devices issue the same slip number

Both devices hand out slip numbers from their own count, so **while they are
offline** they can reach the same number. The software does not quietly
renumber anyone's paperwork — after a merge it says *"Check slip no. 7 — used
twice."* Correct one of them in History.

Two tabs on one computer cannot clash this way: each one checks the shared
count before taking a number. Restarting the slip book does not count as a
clash either — slip 1 of the new book and slip 1 of the old are different
slips, and the software knows which book each belongs to.

---

## The app lock

Setup → **Set / Change Password**. The password is stored as a hash, not as
plain text, and the register is not drawn on screen until it is entered.

**It is a deterrent, not security.** It stops a customer leaning over the
counter and reading the screen. It does not stop someone with the device and a
little knowledge, because the register is sitting in that browser's own storage
either way.

The two things that genuinely protect the figures are different:

1. **The Google account's password and two-step verification**, which is what
   stands between anyone else and the copy in Drive.
2. **Physical control of the devices**, which is what stands between anyone else
   and the copy on each device.

Neither is something this software can do for you. Keeping the numbers from a
determined person who has one of the devices would need a server login, which
means a different kind of software. Decide whether that matters before relying
on this.

## Day-to-day notes

- **Outward refuses to issue more than you have.** If the goods really are there
  and the inward just has not been typed yet, use **Force Issue** — the slip is
  then marked FORCED so it can be found later.
- **Colours are matched loosely.** `black`, `BLACK ` and `BLACK` are one colour.
  Typing `BLAK` offers *"Did you mean BLACK?"*.
- **A quality in use cannot be removed**, only renamed, so history stays correct.
- **Printing** gives an A5 slip with customer, slip number, items and signature
  lines. It prints from the page itself, so pop-up blockers cannot stop it.
- **On a phone** the fields are sized so the browser does not zoom the page in
  every time one is tapped, and all six tabs fit across the screen. Add it to
  the home screen and it opens like an app.
