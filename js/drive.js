/* ==================================================================
   drive.js - Google Drive sync

   How this is kept safe
   ---------------------
   1. This device is the source of truth. Every change is already in
      localStorage before Drive is contacted, so a failed or expired
      sync can never lose an entry.
   2. Before writing, the copy in Drive is checked. If it moved since
      we last saw it, it is pulled and MERGED into ours first. Nothing
      is ever overwritten blind - that is what wiped data in the old
      Firebase code.
   3. After writing, the copy in Drive is checked again. Drive has no
      way to say "write this only if nobody else has", so if another
      device wrote in the moment between our read and our write, its
      entries are now underneath ours. We pull them back and write the
      two together.
   4. Google access tokens last about an hour. A new one can usually be
      had without showing anything, so a device left alone picks itself
      up again by itself. When Google will not give one quietly the
      status turns to "Reconnect" and changes queue up until it is
      clicked. They are never dropped.
   5. A device that is only being looked at makes no changes, so nothing
      would ever prompt it to check Drive. It therefore also looks on a
      timer, and whenever it is brought back to the front.
   ================================================================== */
(function (global) {
"use strict";

var SCOPE    = "https://www.googleapis.com/auth/drive.file"; // only files this app creates
var FILES    = "https://www.googleapis.com/drive/v3/files";
var ABOUT    = "https://www.googleapis.com/drive/v3/about";  // who is signed in
var UPLOAD   = "https://www.googleapis.com/upload/drive/v3/files";
var FILE_KEY = "sunshineFabrics.driveFileId";
var VER_KEY  = "sunshineFabrics.driveVersion";
var SEEN_KEY = "sunshineFabrics.driveSignedIn";

/* How many times to pull and write again when another device keeps
   getting in first. Three is far more than a shop will ever need. */
var MAX_RETRIES = 3;

var cfg        = global.SUNSHINE_CONFIG || {};
var tokenClient = null;
var token      = null;     // { value, expiresAt }
var state      = { status:"off", message:"", lastSync:null, busy:false };
var listeners  = [];
var saveTimer  = null;
var pollTimer  = null;
var silentTry  = null;     // a quiet token request already in flight
var silentFail = 0;        // when one last failed, so we do not keep asking
var lastCheck  = 0;        // when we last looked at Drive, for debouncing
var account    = null;     // who is signed in, for the token we hold
var wrongLogin = false;    // signed in, but not an account this register belongs to

function emit(){ listeners.forEach(function(f){ try{ f(status()); }catch(e){} }); }

function set(st, msg){
  state.status = st;
  state.message = msg || "";
  emit();
}

function status(){
  return {
    status: state.status,
    message: state.message,
    lastSync: state.lastSync,
    busy: state.busy,
    pending: global.Store ? Store.pendingChanges() : 0,
    configured: !!cfg.googleClientId,
    account: account ? { email: account.email, name: account.name } : null,
    tiedTo: allowedAccounts()
  };
}

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

/* Remembered across reloads, so we say "Connect" the first time and
   "Reconnect" after - and so a reload knows it may ask Google quietly. */
var everSignedIn = lsGet(SEEN_KEY) === "1";

/* How often a quiet device looks to see whether another one has been
   working. Seconds; 60 unless config.js says otherwise. */
var POLL_MS = Math.max(15, Number(cfg.drivePollSeconds) || 60) * 1000;

/* ---------------- start-up ---------------- */
function init(){
  if(!cfg.googleClientId){
    set("off", "Running on this device only.");
    return;
  }
  waitForGis(function (ok){
    if(!ok){ set("error", "Could not reach Google. Working on this device only."); return; }
    try{
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.googleClientId,
        scope: SCOPE,
        callback: function(){}      // replaced per request
      });
      set("ready", "Not connected.");
      startWatching();

      // This device has been connected before, so ask Google for a
      // token without showing anything. It answers if the account is
      // still signed in and has already allowed this app - which is
      // what spares a phone a tap every time it is picked up.
      if(everSignedIn){
        set("connecting", "Reconnecting to Google Drive...");
        silentToken().then(function(ok2){
          if(ok2) sync(false, true);   // first job after a reload: see what the others did
          else set("expired", "Sign-in has expired. Changes are saved here and waiting.");
        });
      }
    }catch(e){
      set("error", "Google sign-in could not start: " + e.message);
    }
  });
}

function waitForGis(done){
  var tries = 0;
  (function poll(){
    if(global.google && google.accounts && google.accounts.oauth2) return done(true);
    if(++tries > 40) return done(false);           // ~8 seconds
    setTimeout(poll, 200);
  })();
}

/* ---------------- tokens ----------------
   requestAccessToken opens Google's popup. Google requires this to
   come from a real click, so it is only called from Connect / Sync. */
function requestToken(interactive){
  return new Promise(function(resolve, reject){
    if(!tokenClient) return reject(new Error("Google sign-in is not ready."));
    tokenClient.callback = function(res){
      if(res && res.access_token){
        token = { value: res.access_token, expiresAt: Date.now() + ((res.expires_in || 3600) - 60) * 1000 };
        everSignedIn = true;
        lsSet(SEEN_KEY, "1");
        resolve(token);
      }else{
        reject(new Error((res && res.error) ? res.error : "Sign-in was cancelled."));
      }
    };
    tokenClient.error_callback = function(err){
      reject(new Error(plainError(err && err.type)));
    };
    try{
      tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
    }catch(e){ reject(e); }
  });
}

function haveValidToken(){ return token && token.expiresAt > Date.now(); }

/* Ask Google for a token without putting anything on screen. It only
   works where the account is still signed in and has already allowed
   this app, so a refusal is ordinary and is not reported as a fault.
   After one refusal we leave it alone for a while rather than asking
   again every minute. */
function silentToken(){
  if(!tokenClient || !everSignedIn) return Promise.resolve(false);
  if(silentTry) return silentTry;
  if(Date.now() - silentFail < 5 * 60000) return Promise.resolve(false);
  silentTry = requestToken(false)
    .then(function(){ silentTry = null; return true; })
    .catch(function(){ silentTry = null; silentFail = Date.now(); return false; });
  return silentTry;
}

/* Google's codes are no use to someone running a fabric shop. */
function plainError(code){
  switch(code){
    case "popup_failed_to_open":
      return "The Google sign-in window could not open. Allow pop-ups for this site, then try again.";
    case "popup_closed":
      return "Sign-in was closed before it finished.";
    case "access_denied":
      return "Google would not allow this account. Check it is listed under Test users, or publish the app.";
    case "invalid_client":
      return "Google did not recognise the Client ID. Check js/config.js and the authorised origins.";
    case "idpiframe_initialization_failed":
      return "Google sign-in could not start in this browser. Third-party cookies may be blocked.";
    default:
      return code ? ("Google sign-in failed (" + code + ").") : "Google sign-in failed.";
  }
}

/* ---------------- HTTP ---------------- */
function api(url, opts){
  opts = opts || {};
  opts.headers = Object.assign({ Authorization: "Bearer " + token.value }, opts.headers || {});
  return fetch(url, opts).then(function(res){
    if(res.status === 401 || res.status === 403){
      token = null;
      var err = new Error("Google sign-in has expired.");
      err.needsAuth = true;
      throw err;
    }
    if(!res.ok) return res.text().then(function(t){
      var err = new Error("Drive error " + res.status + ": " + t.slice(0,140));
      err.status = res.status;
      throw err;
    });
    return res;
  });
}

function fileMeta(id){
  return api(FILES + "/" + id + "?fields=id,version,modifiedTime").then(function(r){ return r.json(); });
}

/* ---------------- which account is this? ----------------
   The register lives in whichever Google account signs in. Sign in
   with the wrong one - a personal Gmail on the shop's phone, say - and
   this device would copy the whole register into that account's Drive
   and then carry on in a second, separate register. Neither is obvious
   from the screen, so when the software is tied to an account it
   checks before it writes anything.

   Reading the signed-in address needs no extra permission: drive.file
   is enough for this call, so the consent screen does not change. */
function allowedAccounts(){
  var list = cfg.allowedGoogleAccounts;
  if(!list) return [];
  if(typeof list === "string") list = [list];
  if(!list.length) return [];
  return list.map(function(s){ return String(s).trim().toLowerCase(); }).filter(Boolean);
}

function ensureAccount(){
  if(account && account.token === token.value) return Promise.resolve(account);
  return api(ABOUT + "?fields=user(emailAddress,displayName)")
    .then(function(r){ return r.json(); })
    .then(function(j){
      var u = (j && j.user) || {};
      account = {
        token: token.value,
        email: String(u.emailAddress || "").toLowerCase(),
        name:  u.displayName || ""
      };
      return account;
    });
}

/* Resolves when the account may use this register. Rejects otherwise,
   and a failure to find out at all also rejects - better to wait,
   with everything safe on the device, than to write the shop's figures
   into somebody else's Drive. */
function checkAccount(){
  var allow = allowedAccounts();
  if(!allow.length) return ensureAccount().catch(function(){ return null; });
  return ensureAccount().then(function(a){
    if(a.email && allow.indexOf(a.email) >= 0) return a;
    var err = new Error(
      "Signed in as " + (a.email || "an unrecognised account") + ", but this register belongs to " +
      allow.join(" or ") + ". Nothing has been sent. Press the button and choose that account instead."
    );
    err.wrongAccount = true;
    throw err;
  });
}

function findFile(){
  var id = lsGet(FILE_KEY);
  if(id){
    return fileMeta(id).catch(function(e){
      // Only a file that is really gone justifies forgetting which one
      // it was. A dropped connection must not send us hunting by name.
      if(e.needsAuth || e.status !== 404) throw e;
      lsSet(FILE_KEY, "");
      return searchFile();
    });
  }
  return searchFile();
}

function searchFile(){
  var q = encodeURIComponent("name='" + (cfg.driveFileName||"sunshine-fabrics-register.json") + "' and trashed=false");
  return api(FILES + "?q=" + q + "&spaces=drive&fields=files(id,version,modifiedTime)")
    .then(function(r){ return r.json(); })
    .then(function(j){
      var f = (j.files || [])[0];
      if(f) lsSet(FILE_KEY, f.id);
      return f || null;
    });
}

/* A failed request must never be mistaken for an empty Drive - that
   would have us write our copy over a perfectly good one. So only a
   file we genuinely cannot read comes back as nothing, and then
   writing a good one over it is the only way out. */
function downloadFile(id){
  return api(FILES + "/" + id + "?alt=media")
    .then(function(r){ return r.json().catch(function(){ return null; }); });
}

function createFile(data){
  var boundary = "sunshine" + Date.now();
  var meta = {
    name: cfg.driveFileName || "sunshine-fabrics-register.json",
    mimeType: "application/json",
    description: "Sunshine Fabrics stock register - do not rename or delete."
  };
  var body =
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(meta) + "\r\n" +
    "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(data) + "\r\n" +
    "--" + boundary + "--";
  return api(UPLOAD + "?uploadType=multipart&fields=id,version", {
    method: "POST",
    headers: { "Content-Type": "multipart/related; boundary=" + boundary },
    body: body
  }).then(function(r){ return r.json(); });
}

function updateFile(id, data){
  return api(UPLOAD + "/" + id + "?uploadType=media&fields=id,version", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(function(r){ return r.json(); });
}

/* ---------------- connect / disconnect ---------------- */
function connect(){
  if(!cfg.googleClientId){ set("off", "Running on this device only."); return Promise.resolve(false); }
  set("connecting", "Waiting for Google...");
  // A deliberate press is also how the user picks a different account,
  // so forget any earlier refusal and let Google ask again.
  wrongLogin = false;
  account = null;
  silentFail = 0;
  return requestToken(true)
    .then(function(){ return sync(true, true); })   // first connect always pulls what is already there
    .catch(function(e){ set("ready", e.message); return false; });
}

function disconnect(){
  if(token && global.google && google.accounts && google.accounts.oauth2){
    try{ google.accounts.oauth2.revoke(token.value); }catch(e){}
  }
  token = null;
  account = null;
  wrongLogin = false;
  everSignedIn = false;      // stop the quiet reconnect attempts as well
  silentTry = null;
  lsSet(SEEN_KEY, "");
  lsSet(FILE_KEY, "");
  lsSet(VER_KEY, "");
  set("ready", "Disconnected.");
}

/* ---------------- the sync itself ---------------- */
/* interactive - may show Google's popup (must come from a click)
   force       - always pull and merge first, even if Drive looks
                 unchanged. Used by Connect and by "Refresh from Drive". */
function sync(interactive, force){
  if(!cfg.googleClientId) return Promise.resolve(false);
  if(state.busy) return Promise.resolve(false);
  // The wrong account is signed in. Only a deliberate press clears
  // that - the timer must not keep asking Google every minute.
  if(wrongLogin && !interactive) return Promise.resolve(false);

  if(!haveValidToken()){
    if(interactive){
      return requestToken(true).then(function(){ return runSync(force); })
        .catch(function(e){ set("expired", e.message); return false; });
    }
    // Try for a new token quietly before giving up and asking the user.
    return silentToken().then(function(ok){
      if(ok) return runSync(force);
      set(everSignedIn ? "expired" : "ready",
          everSignedIn ? "Sign-in has expired. Changes are saved here and waiting."
                       : "Not connected. Changes are saved on this device.");
      return false;
    });
  }
  return runSync(force);
}

function runSync(force){
  state.busy = true;
  set("syncing", "Syncing...");
  var merged = null;
  var uploadedRev = null;
  var seeded = false;

  /* Read the register and its revision number together, so what we
     mark as synced is exactly what went up. Taking the revision any
     earlier - before a merge, say - leaves a change that has already
     been uploaded still showing as waiting. */
  function payload(){
    uploadedRev = Store.db().rev;
    return Store.snapshot();
  }

  /* Nothing of ours is missing up there, so there is nothing to send.
     Everything we hold is already in Drive. */
  function alreadyThere(version){
    lsSet(VER_KEY, String(version || ""));
    uploadedRev = Store.db().rev;
    return {};
  }

  function noteMerge(m){
    if(!m) return;
    if(!merged) merged = { added:0, voided:0, conflicts:[] };
    merged.added  += m.added  || 0;
    merged.voided += m.voided || 0;
    if(m.superseded) merged.superseded = true;
    if(m.cleared != null) merged.cleared = (merged.cleared || 0) + m.cleared;
    (m.conflicts || []).forEach(function(c){
      if(merged.conflicts.indexOf(c) < 0) merged.conflicts.push(c);
    });
  }

  /* Pull the copy in Drive, combine it with ours, and send ours back
     only if we are holding something it has not got. */
  function mergeThenPush(file, tries){
    return downloadFile(file.id).then(function(remote){
      var ahead = true;
      if(remote){
        ahead = Store.aheadOf(remote);     // asked before the merge, while the two still differ
        noteMerge(Store.mergeRemote(remote));
      }
      if(!ahead) return alreadyThere(file.version);
      return push(file.id, tries);
    });
  }

  /* Write, then look again. Drive cannot be told "write this only if
     nobody else has", so if the file moved between our read and our
     write, another device's entries are now underneath ours. Pull them
     back and write the two together. */
  function push(id, tries){
    return updateFile(id, payload()).then(function(saved){
      lsSet(VER_KEY, String(saved.version || ""));
      if(tries <= 0) return {};
      return fileMeta(id).then(function(now){
        if(String(now.version || "") === String(saved.version || "")) return {};
        return mergeThenPush(now, tries - 1);
      });
    });
  }

  // Nothing goes out, and nothing is read, until we know whose Drive
  // we are talking to.
  return checkAccount()
    .then(findFile)
    .then(function(file){
      if(!file){
        // nothing in Drive yet - this device seeds it
        return createFile(payload()).then(function(created){
          lsSet(FILE_KEY, created.id);
          lsSet(VER_KEY, String(created.version || ""));
          seeded = true;
          return {};
        });
      }
      var lastSeen = lsGet(VER_KEY);
      // Pull and merge whenever Drive has moved on since our last sync.
      if(force || String(file.version || "") !== String(lastSeen || "")){
        return mergeThenPush(file, MAX_RETRIES);
      }
      // Drive is where we left it. With nothing of our own waiting,
      // this is a device simply keeping an eye out - leave the file be.
      if(Store.pendingChanges() <= 0) return alreadyThere(file.version);
      return push(file.id, MAX_RETRIES);
    })
    .then(function(){
      if(uploadedRev != null) Store.markSynced(uploadedRev);
      state.lastSync = new Date().toISOString();
      state.busy = false;

      var note = "All changes saved to Google Drive.";
      if(seeded) note = "Register uploaded to Google Drive.";
      if(merged && merged.cleared != null){
        note = "Another device started the register fresh. " +
               (merged.cleared ? merged.cleared + " older entr" +
                 (merged.cleared === 1 ? "y was" : "ies were") + " cleared on this one."
                               : "This device was already empty.");
      }
      else if(merged && merged.superseded){
        note = "The register from this device has replaced the copy in Google Drive.";
      }
      else if(merged && (merged.added || merged.voided)){
        note = "Merged " + merged.added + " new and " + merged.voided + " deleted entr" +
               ((merged.added + merged.voided) === 1 ? "y" : "ies") + " from another device.";
      }
      if(merged && merged.conflicts && merged.conflicts.length){
        note += " Check slip no. " + merged.conflicts.join(", ") + " - used twice.";
      }
      set("connected", note);
      return true;
    })
    .catch(function(e){
      state.busy = false;
      if(e.wrongAccount){
        // Stop here rather than asking again every minute. Connect
        // clears this, because that is the user choosing an account.
        wrongLogin = true;
        token = null;
        set("blocked", e.message);
      }
      else if(e.needsAuth) set("expired", "Sign-in has expired. Changes are saved here and waiting.");
      else set("error", e.message + " Changes are saved on this device.");
      return false;
    });
}

/* Nudged after each change. Never shows Google's popup by itself, so
   it cannot interrupt someone mid-entry. */
function scheduleSync(){
  if(!cfg.googleClientId) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    saveTimer = null;
    if(Store.pendingChanges() <= 0) return;
    sync(false, false);
  }, 4000);
}

/* ---------------- keeping up with the other devices ----------------
   A device that is only being looked at never makes a change, so
   nothing would ever prompt it to check Drive. Without this the
   counter PC and the owner's phone each sit on their own figures until
   somebody remembers to press Refresh - and an Outward slip refused
   for "not enough stock" might be refused against yesterday's numbers. */
function startWatching(){
  if(pollTimer || !cfg.googleClientId) return;
  pollTimer = setInterval(function(){ catchUp(true); }, POLL_MS);

  if(!global.addEventListener) return;
  global.addEventListener("online", function(){ catchUp(false); });
  global.addEventListener("focus",  function(){ catchUp(false); });
  global.addEventListener("pagehide", flush);
  if(global.document && global.document.addEventListener){
    global.document.addEventListener("visibilitychange", function(){
      if(global.document.hidden) flush();
      else catchUp(false);
    });
  }
}

/* One small request that asks Drive only whether the file has moved
   on. Nothing is written unless it has, or unless we have something
   of our own waiting. */
function catchUp(onTimer){
  if(!cfg.googleClientId || state.busy) return;
  if(onTimer && global.document && global.document.hidden) return;   // asleep in a pocket
  if(global.navigator && global.navigator.onLine === false) return;
  var now = Date.now();
  if(now - lastCheck < 5000) return;        // one trigger per moment is enough
  lastCheck = now;
  sync(false, false);
}

/* About to be put away. Push now rather than waiting out the pause -
   a backgrounded tab on a phone may never get another chance. The
   entries are safe on the device either way; this only spares the
   other devices a wait. */
function flush(){
  if(!cfg.googleClientId) return;
  if(Store.pendingChanges() <= 0) return;
  if(saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  if(haveValidToken()) sync(false, false);
}

global.Drive = {
  init: init,
  connect: connect,
  disconnect: disconnect,
  sync: sync,
  scheduleSync: scheduleSync,
  catchUp: catchUp,
  status: status,
  onState: function(f){ listeners.push(f); }
};

})(window);
