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

`Sunshine_Stock_Outward_Colour_Quantity.html` is the original first version, kept
for reference. It is not used and can be deleted once you are satisfied.

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
3. Under **Authorised JavaScript origins** → **Add URI**, enter the exact address
   the software is hosted at, for example `https://stock.sunshinefabrics.in`
   — no trailing slash, no path. Add `http://localhost:8000` too if you test locally.
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

- Press **Connect Google Drive** once. Pick the Google account.
- After that it saves by itself a few seconds after each change.
- Google signs you out after about an hour. The bar then says **Reconnect**, and
  shows how many changes are waiting. They are safe on the device; press
  Reconnect and they go up. A browser-only app cannot avoid this — staying
  signed in permanently would need a server.
- On a second device, sign in with the same Google account and press Connect.
  The two registers merge.

### If two devices issue the same slip number

Both devices hand out slip numbers from their own count, so working offline they
can reach the same number. The software does not quietly renumber anyone's
paperwork — after a merge it says *"Check slip no. 7 — used twice."* Correct one
of them in History.

---

## The app lock

Setup → **Set / Change Password**. The password is stored as a hash, not as
plain text, and the register is not drawn on screen until it is entered.

**It is a deterrent, not security.** Anyone who can open these files and knows a
little can still read the data. Keeping the numbers from a determined person
needs a server login, which means a different kind of software. Decide whether
that matters before relying on this.

## Day-to-day notes

- **Outward refuses to issue more than you have.** If the goods really are there
  and the inward just has not been typed yet, use **Force Issue** — the slip is
  then marked FORCED so it can be found later.
- **Colours are matched loosely.** `black`, `BLACK ` and `BLACK` are one colour.
  Typing `BLAK` offers *"Did you mean BLACK?"*.
- **A quality in use cannot be removed**, only renamed, so history stays correct.
- **Printing** gives an A5 slip with customer, slip number, items and signature
  lines. It prints from the page itself, so pop-up blockers cannot stop it.
