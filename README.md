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

3. **Delete does not erase.** There is a **Delete** button on the Inward list,
   on every slip in the Outward list, on every line of Stock and on every row of
   History. They all do the same thing: the entry stops counting in the figures
   the moment it is pressed, and it stays in History marked as deleted. A
   correction deletes the old entry and writes the new one beside it.

   That is why the Stock screen, the History screen and the CSV always add up to
   the same number, and why a wrong press can be found afterwards instead of
   turning up weeks later as an unexplained hole in the stock.

   **Delete on a slip takes the whole slip.** **Delete on a line of Stock takes
   every entry behind that line** — the inward as well as the outward, not just
   the balance. Each one says how much it is about to take before it takes it,
   and asks for a reason. To take out one item of a slip rather than all of it,
   use Delete beside that line in History.

   To see what has been deleted, tick **Show deleted entries** in History.

   The two exceptions are **Setup → Start Fresh** and **Setup → Merge Old
   Entries**, each the subject of its own section below.

### Starting the register over

**Setup → Start Fresh** empties the register completely and puts slip numbers
back at 1. It is for clearing out practice entries before the real register
begins, or for opening a clean book at a new financial year.

This is the only place in the software that truly removes entries instead of
marking them deleted, so it asks for the words START FRESH to be typed and
**downloads a backup before it does anything**. That file is the only way back.
Tick boxes decide whether the quality list and the password survive it.

**Deleting the file in Google Drive does not clear anything.** The register
lives on each device as well, and the first device to sync would simply put it
all back — a new file would appear with the old figures in it. The clearing has
to be done in the software, which is what Start Fresh is for.

Once it is done, that device's empty register goes up at the next sync and
**replaces** what is in Drive rather than merging with it. Every other phone or
computer on the same register then clears itself to match the next time it
syncs, and says so. The same protection now covers **Restore from Backup**: a
restored register is not quietly re-filled by the copy sitting in Drive.

Do it while nobody else is entering, and take the backup seriously.

### Merging old entries

**Setup → Merge Old Entries** folds every entry up to a date you choose into a
single opening line per quality and colour. **The stock figures do not change** —
each opening line carries exactly the balance the entries behind it left, so
Stock, the CSV and the totals read the same before and after.

What it is for: a register that has grown large. The Backup panel shows how much
of the browser's allowance is in use and roughly how many more entries will fit,
and warns when that gets tight. There is normally room for well over ten
thousand entries, so this is a once-a-year job at the close of the old book —
not something to reach for at the first sign of a long list. If History simply
feels slow, that is a different thing and is already handled; see the note under
*Day-to-day notes*.

What it costs. The individual lines before that date are **removed, not marked
deleted**. The slips they belong to cannot be reprinted afterwards, reports
cannot be run for those months, and the party history behind them goes too. A
backup downloads first and **that file is the only place the removed detail will
exist**. The word MERGE has to be typed, as with Start Fresh.

Like Start Fresh and Restore, a merge **replaces** the copy in Drive rather than
being combined with it — otherwise another device would simply hand back the very
entries that were just folded. Two things follow:

- It refuses to run while this device still has changes waiting for Drive, and
  offers to send them up first.
- Work sitting unsent on **another** device cannot be rescued from here. Do it
  while nobody else is entering, exactly as with Start Fresh.

Every other phone or computer folds itself to match at its next sync. Merging to
the same date a second time does nothing.

The opening lines are marked **Opening** in History, and the Reports tab counts
them as opening stock rather than as goods received — so a report covering the
date the line was drawn still adds up.

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
| **Disconnect** | Stops syncing and **withdraws this app's permission**. The register stays on this device. To empty only this device, clear the browser's site data instead — see below. |

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

### If the file in Drive is deleted

Nothing is lost. The register is on each device first; Drive is the second copy.
The next time a device syncs it notices the file has gone and uploads the
register again, and the other devices then join that new file. Deleting it is a
safe way to start the Drive copy afresh.

Two notes. **Google's "delete" means the bin**, and a file in the bin is removed
for good only after 30 days — the software treats a binned file as gone straight
away rather than carrying on writing to something about to vanish. And if you
later **restore it from the bin**, you will have two files of the same name and
the software may pick either; delete one of them.

### If you clear the browser's data

Clearing Chrome's site data wipes the register **on that device** — it lives in
the browser's own storage. Nothing is lost as long as Drive has it: press
**Connect** and the device pulls the whole register back. An empty device can
never overwrite Drive, because it holds nothing the Drive copy has not got, so
the sync only runs in the safe direction.

Two things to get right.

**Take a backup first.** If Drive was never connected, that browser storage was
the only copy there was.

**Do not press Disconnect on the way out.** Disconnect withdraws this app's
permission, and the `drive.file` permission is exactly what lets the software see
the one file it created. Withdraw it and that file can become invisible to the
app, which then finds nothing in Drive. It will **not** quietly start a second
register in that state — it stops and says so, because a register with no entries
is never written to Drive as a new file. The way out is to press Connect and
allow the app again. Clearing site data on its own leaves the permission intact,
which is why it is the safe way round.

If two files of the same name ever do end up in Drive, the software uses the one
changed most recently and says so in the status line. Delete the spare.

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

## Printing

Setup → **Printing** chooses what the **Print** buttons on this computer or
phone put on paper:

| Choice | What comes out |
|---|---|
| **A5 sheet** | The full slip: customer, slip number, items in a ruled table, signature lines. The copy for the file. |
| **Thermal 80 mm** | The usual counter-receipt roll. |
| **Thermal 58 mm** | The narrow roll, as on a hand-held billing machine. |

**This choice stays on the device it was made on.** It is not kept in the
register and never goes to Drive, so the counter can print receipts on its roll
while the owner's phone prints A5 sheets, and neither changes the other.

On a roll the page is **cut to the length of the receipt** — the software
measures what it has just drawn and tells the printer exactly how long the page
is, so no blank paper is fed through after each one.

Two things to set once on a thermal printer, both in the browser's print box:
turn **Headers and footers** off, and set **Margins** to None. Otherwise the
roll comes out with the web address and the date printed across it. Set the
printer's own paper width in Windows to match the choice above. **Print a test
receipt** in the same panel prints made-up figures so this can be lined up
without issuing a real slip number.

The **Print Receipt** button beside a slip you have just saved always prints a
roll receipt, whatever the setting says, and **Print Slip (A5)** beside it
always prints the sheet. Everywhere else — History, Stock, the recent slips —
one Print button follows the setting.

A printed slip always adds up. If a line of it was deleted afterwards, the
reprint prints the word DELETED where the weight would have been, rather than a
figure the total leaves out.

Printing happens inside the page itself, so a pop-up blocker cannot stop it.

## Day-to-day notes

- **Outward refuses to issue more than you have.** If the goods really are there
  and the inward just has not been typed yet, use **Force Issue** — the slip is
  then marked FORCED so it can be found later.
- **Colours are matched loosely.** `black`, `BLACK ` and `BLACK` are one colour.
  Typing `BLAK` offers *"Did you mean BLACK?"*.
- **A quality in use cannot be removed**, only renamed, so history stays correct.
- **Printing** is covered in its own section above.
- **History draws the latest 300 entries** that match the filters. The totals
  below the table are still worked out over every one of them, and a **Show all**
  button sits beside the count. Without this a long register would redraw
  thousands of rows on every letter typed into the search box.
- **If storage ever fills up**, a red bar says so, and says whether what you have
  just typed reached Google Drive. Take a backup at once: an entry made in that
  state is not on the device. The Backup panel shows how much room is left long
  before it gets that far.
- **On a phone** the fields are sized so the browser does not zoom the page in
  every time one is tapped, and all six tabs fit across the screen. Add it to
  the home screen and it opens like an app.
