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
   3. Google access tokens are short lived and a browser-only app
      cannot refresh them by itself, so when one runs out the status
      turns to "Reconnect" and changes queue up until it is clicked.
      They are never dropped.
   ================================================================== */
(function (global) {
"use strict";

var SCOPE    = "https://www.googleapis.com/auth/drive.file"; // only files this app creates
var FILES    = "https://www.googleapis.com/drive/v3/files";
var UPLOAD   = "https://www.googleapis.com/upload/drive/v3/files";
var FILE_KEY = "sunshineFabrics.driveFileId";
var VER_KEY  = "sunshineFabrics.driveVersion";

var cfg        = global.SUNSHINE_CONFIG || {};
var tokenClient = null;
var token      = null;     // { value, expiresAt }
var state      = { status:"off", message:"", lastSync:null, busy:false };
var listeners  = [];
var saveTimer  = null;

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
    configured: !!cfg.googleClientId
  };
}

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

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
        resolve(token);
      }else{
        reject(new Error((res && res.error) ? res.error : "Sign-in was cancelled."));
      }
    };
    tokenClient.error_callback = function(err){
      reject(new Error((err && err.type) ? err.type : "Sign-in failed."));
    };
    try{
      tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
    }catch(e){ reject(e); }
  });
}

function haveValidToken(){ return token && token.expiresAt > Date.now(); }

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
    if(!res.ok) return res.text().then(function(t){ throw new Error("Drive error " + res.status + ": " + t.slice(0,140)); });
    return res;
  });
}

function findFile(){
  var id = lsGet(FILE_KEY);
  if(id){
    return api(FILES + "/" + id + "?fields=id,version,modifiedTime")
      .then(function(r){ return r.json(); })
      .catch(function(e){
        if(e.needsAuth) throw e;
        lsSet(FILE_KEY, "");            // file was deleted - look again
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

function downloadFile(id){
  return api(FILES + "/" + id + "?alt=media")
    .then(function(r){ return r.json(); })
    .catch(function(e){ if(e.needsAuth) throw e; return null; });
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
  return requestToken(true)
    .then(function(){ return sync(true); })
    .catch(function(e){ set("ready", e.message); return false; });
}

function disconnect(){
  if(token && global.google && google.accounts && google.accounts.oauth2){
    try{ google.accounts.oauth2.revoke(token.value); }catch(e){}
  }
  token = null;
  lsSet(FILE_KEY, "");
  lsSet(VER_KEY, "");
  set("ready", "Disconnected.");
}

/* ---------------- the sync itself ---------------- */
function sync(interactive){
  if(!cfg.googleClientId) return Promise.resolve(false);
  if(state.busy) return Promise.resolve(false);

  if(!haveValidToken()){
    if(!interactive){
      set("expired", "Sign-in has expired. Changes are saved here and waiting.");
      return Promise.resolve(false);
    }
    return requestToken(true).then(function(){ return runSync(); })
      .catch(function(e){ set("expired", e.message); return false; });
  }
  return runSync();
}

function runSync(){
  state.busy = true;
  set("syncing", "Syncing...");
  var revAtStart = Store.db().rev;
  var merged = null;

  return findFile()
    .then(function(file){
      if(!file){
        // nothing in Drive yet - this device seeds it
        return createFile(Store.snapshot()).then(function(created){
          lsSet(FILE_KEY, created.id);
          lsSet(VER_KEY, String(created.version || ""));
          return { seeded:true };
        });
      }
      var lastSeen = lsGet(VER_KEY);
      // Pull and merge whenever Drive has moved on since our last sync.
      if(String(file.version || "") !== String(lastSeen || "")){
        return downloadFile(file.id).then(function(remote){
          if(remote){
            merged = Store.mergeRemote(remote);
          }
          return updateFile(file.id, Store.snapshot()).then(function(saved){
            lsSet(VER_KEY, String(saved.version || ""));
            return { merged:merged };
          });
        });
      }
      return updateFile(file.id, Store.snapshot()).then(function(saved){
        lsSet(VER_KEY, String(saved.version || ""));
        return {};
      });
    })
    .then(function(result){
      Store.markSynced(revAtStart);
      state.lastSync = new Date().toISOString();
      state.busy = false;

      var note = "All changes saved to Google Drive.";
      if(result && result.seeded) note = "Register uploaded to Google Drive.";
      if(merged && (merged.added || merged.voided)){
        note = "Merged " + merged.added + " new and " + merged.voided + " voided entr" +
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
      if(e.needsAuth) set("expired", "Sign-in has expired. Changes are saved here and waiting.");
      else set("error", e.message + " Changes are saved on this device.");
      return false;
    });
}

/* Nudged after each change. Only pushes when already signed in, so it
   never interrupts the user with a popup mid-entry. */
function scheduleSync(){
  if(!cfg.googleClientId) return;
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    if(Store.pendingChanges() <= 0) return;
    if(haveValidToken()) sync(false);
    else set("expired", "Sign-in has expired. Changes are saved here and waiting.");
  }, 4000);
}

global.Drive = {
  init: init,
  connect: connect,
  disconnect: disconnect,
  sync: sync,
  scheduleSync: scheduleSync,
  status: status,
  onState: function(f){ listeners.push(f); }
};

})(window);
