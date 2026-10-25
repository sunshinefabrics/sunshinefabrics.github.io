/* ==================================================================
   store.js - the register itself

   The register is append-only. An entry is never removed; a wrong
   entry is VOIDED and stays visible. Stock, History and the CSV all
   read this one array, so the three can never disagree.

   Quantities are whole grams (integers), so totals never drift the
   way repeated floating point addition does.

   Every change is written to localStorage immediately and
   synchronously. Google Drive is a second copy on top of that, never
   the only copy - see drive.js.
   ================================================================== */
(function (global) {
"use strict";

var KEY         = "sunshineFabrics.v3";
var DEVICE_KEY  = "sunshineFabrics.device";
var LEGACY_V2   = "sunshine.v2";
var LEGACY_ROWS = "sunshine";
var LEGACY_QUAL = "sunshineQualities";

var DEFAULT_QUALITIES = ["PREMIUM MARS","LOOPKNIT","MICRO DOTKNIT","JERSEY","SUPER LACOSTA",
  "MICRO NIRMAL KNIT","NJS","SHC","MHC","SUPER SALEENA","PP","FOOTBALL KNIT","SUBLIMATION FABRICS"];

/* ---------------- small helpers ---------------- */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function todayISO(){
  var d = new Date(), p = function(n){ return String(n).padStart(2,"0"); };
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}
function dmy(iso){
  var p = String(iso||"").split("-");
  return p.length === 3 ? p[2]+"-"+p[1]+"-"+p[0] : (iso||"");
}
function kg(grams){ return (grams/1000).toFixed(2); }
function toGrams(v){
  var n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n*1000) : NaN;
}
/* "BLACK ", "black" and "BLACK" must not become three stock rows. */
function norm(s){ return String(s==null?"":s).trim().replace(/\s+/g," ").toUpperCase(); }

/* edit distance, capped - used to catch colour typos */
function editDistance(a,b){
  if(Math.abs(a.length-b.length) > 2) return 9;
  var m = a.length, n = b.length, i, j, t;
  var prev = [], cur = [];
  for(i=0;i<=n;i++) prev[i] = i;
  for(i=1;i<=m;i++){
    cur[0] = i;
    for(j=1;j<=n;j++){
      cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a.charAt(i-1)===b.charAt(j-1) ? 0 : 1));
    }
    t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

/* ---------------- storage that never throws ---------------- */
var storageOK = true;
var storageMsg = "";

function readStore(k){
  try { return localStorage.getItem(k); }
  catch(e){ storageOK = false; storageMsg = "This browser is blocking storage."; return null; }
}
function writeStore(k,v){
  try { localStorage.setItem(k,v); return true; }
  catch(e){
    storageOK = false;
    storageMsg = (e && e.name === "QuotaExceededError")
      ? "Storage is full. Download a backup, then remove old entries."
      : "This browser is blocking storage, so nothing can be saved. Check private mode or site-data settings.";
    return false;
  }
}

function deviceId(){
  var d = readStore(DEVICE_KEY);
  if(!d){ d = uid(); writeStore(DEVICE_KEY, d); }
  return d;
}

/* ---------------- state ---------------- */
var db = emptyDb();
var listeners = [];

function emptyDb(){
  return {
    version: 3,
    businessName: "SUNSHINE FABRICS",
    entries: [],
    qualities: [],
    nextSlip: 1,
    // When the counter was last restarted by hand. Slips issued before
    // this moment are left out of the "next number" working, so a
    // deliberate restart is not undone by old paperwork.
    slipResetAt: null,
    lock: null,
    lastBackup: null,
    rev: 0,          // bumped on every local change
    syncedRev: 0     // the rev last pushed to Drive
  };
}

function emit(){ listeners.forEach(function(f){ try{ f(); }catch(e){} }); }

/* Writes to this device first, always. Drive comes after. */
function persist(){
  db.rev++;
  writeStore(KEY, JSON.stringify(db));
  emit();
}
/* for bookkeeping writes that are not register changes (e.g. sync marks) */
function persistQuiet(){
  writeStore(KEY, JSON.stringify(db));
  emit();
}

/* ---------------- load + migrate ---------------- */
function load(){
  var raw = readStore(KEY), parsed;
  if(raw){
    try{
      parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.entries)){
        db = Object.assign(emptyDb(), parsed);
        if(!db.qualities.length) db.qualities = DEFAULT_QUALITIES.slice();
        return;
      }
    }catch(e){ /* fall through */ }
  }
  if(!migrate(LEGACY_V2)) migrateV1();
}

/* v2 was the previous single-file rewrite */
function migrate(key){
  var raw = readStore(key), old;
  if(!raw) return false;
  try{ old = JSON.parse(raw); }catch(e){ return false; }
  if(!old || !Array.isArray(old.entries)) return false;
  db = Object.assign(emptyDb(), old, { version:3, rev:0, syncedRev:0 });
  if(!db.qualities.length) db.qualities = DEFAULT_QUALITIES.slice();
  persistQuiet();
  return true;
}

/* v1 was the original file: {type:"Inward", q, c, k, r, n, slipId, reportDeleted} */
function migrateV1(){
  var rows = [], quals = null;
  try{ rows  = JSON.parse(readStore(LEGACY_ROWS) || "[]"); }catch(e){ rows = []; }
  try{ quals = JSON.parse(readStore(LEGACY_QUAL) || "null"); }catch(e){ quals = null; }

  db = emptyDb();
  db.qualities = (Array.isArray(quals) && quals.length) ? quals.map(norm) : DEFAULT_QUALITIES.slice();

  var maxSlip = 0;
  (Array.isArray(rows) ? rows : []).forEach(function(o){
    var grams = toGrams(o.k);
    if(!Number.isFinite(grams)) return;
    var slipNo = parseInt(String(o.n||"").trim(), 10);
    if(Number.isFinite(slipNo)) maxSlip = Math.max(maxSlip, slipNo);
    db.entries.push({
      id: uid(),
      type: o.type === "Outward" ? "OUT" : "IN",
      date: o.date || "",
      quality: norm(o.q),
      colour: norm(o.c),
      grams: grams,
      party: "",
      remarks: o.r || "",
      slipNo: Number.isFinite(slipNo) ? slipNo : null,
      slipId: o.slipId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      voidedAt: null, voidReason: "", correctsId: null, forced: false,
      // the old build hid rows from reports while still counting them
      // in stock; carried across as a note so the numbers stay honest
      note: o.reportDeleted ? "Hidden from reports in the old version" : ""
    });
  });

  db.nextSlip = maxSlip + 1;
  db.qualities = unique(db.qualities.concat(db.entries.map(function(e){ return e.quality; })).filter(Boolean));
  if(db.entries.length) persistQuiet();
}

function unique(a){ return Array.from(new Set(a)); }

/* ---------------- derived ---------------- */
function live(){ return db.entries.filter(function(e){ return !e.voidedAt; }); }

function stockRows(){
  var m = new Map();
  live().forEach(function(e){
    var k = e.quality + "\u0000" + e.colour, r = m.get(k);
    if(!r){ r = { quality:e.quality, colour:e.colour, in:0, out:0 }; m.set(k,r); }
    if(e.type === "IN") r.in += e.grams; else r.out += e.grams;
  });
  return Array.from(m.values()).map(function(r){
    r.bal = r.in - r.out; return r;
  }).sort(function(a,b){
    return a.quality.localeCompare(b.quality) || a.colour.localeCompare(b.colour);
  });
}

function availableGrams(quality, colour){
  var bal = 0;
  live().forEach(function(e){
    if(e.quality === quality && e.colour === colour) bal += (e.type === "IN" ? e.grams : -e.grams);
  });
  return bal;
}

function totals(){
  var i = 0, o = 0;
  live().forEach(function(e){ if(e.type === "IN") i += e.grams; else o += e.grams; });
  return { in:i, out:o, bal:i-o };
}

/* ---------------- period reporting ----------------
   A stock statement for a date range: what was on hand before it
   started, what came in, what went out, and what is left. Because the
   register is append-only, every one of these is just a sum over the
   same entries the Stock tab uses, so the report can never tell a
   different story from the rest of the software.                    */

function isoDate(d){
  var p = function(n){ return String(n).padStart(2,"0"); };
  return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate());
}

/* offset 0 = this month, -1 = last month, -2 = the one before */
function monthRange(offset){
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth() + (offset||0), 1);
  var end   = new Date(now.getFullYear(), now.getMonth() + (offset||0) + 1, 0);
  return { from: isoDate(start), to: isoDate(end) };
}

function yearRange(){
  var now = new Date();
  return { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: isoDate(now) };
}

/* The window to compare against. A whole calendar month compares with
   the calendar month before it; any other range compares with the
   same number of days immediately before it. */
function previousRange(from, to){
  if(!from || !to) return null;
  var f = new Date(from + "T00:00:00"), t = new Date(to + "T00:00:00");
  var lastOfMonth = new Date(f.getFullYear(), f.getMonth()+1, 0).getDate();
  if(f.getDate() === 1 && t.getDate() === lastOfMonth && f.getMonth() === t.getMonth()){
    var ps = new Date(f.getFullYear(), f.getMonth()-1, 1);
    var pe = new Date(f.getFullYear(), f.getMonth(), 0);
    return { from: isoDate(ps), to: isoDate(pe) };
  }
  var days = Math.round((t - f) / 86400000) + 1;
  var pe2 = new Date(f.getTime() - 86400000);
  var ps2 = new Date(pe2.getTime() - (days-1) * 86400000);
  return { from: isoDate(ps2), to: isoDate(pe2) };
}

function periodSummary(from, to){
  var rows = new Map(), parties = new Map();
  var opening = 0, received = 0, issued = 0, undated = 0, counted = 0;

  live().forEach(function(e){
    var d = e.date || "";
    if(!d) undated++;

    var before   = from ? (d < from) : false;
    var inPeriod = (!from || d >= from) && (!to || d <= to);
    if(!before && !inPeriod) return;

    var key = e.quality + "\u0000" + e.colour;
    var r = rows.get(key);
    if(!r){ r = { quality:e.quality, colour:e.colour, opening:0, received:0, issued:0 }; rows.set(key, r); }

    var signed = (e.type === "IN" ? e.grams : -e.grams);
    if(before){
      r.opening += signed;
      opening   += signed;
      return;
    }
    counted++;
    if(e.type === "IN"){ r.received += e.grams; received += e.grams; }
    else               { r.issued   += e.grams; issued   += e.grams; }

    if(e.party){
      var p = parties.get(e.party);
      if(!p){ p = { party:e.party, received:0, issued:0 }; parties.set(e.party, p); }
      if(e.type === "IN") p.received += e.grams; else p.issued += e.grams;
    }
  });

  var list = Array.from(rows.values()).map(function(r){
    r.closing = r.opening + r.received - r.issued;
    return r;
  }).filter(function(r){
    return r.opening || r.received || r.issued;   // drop rows with nothing to say
  }).sort(function(a,b){
    return a.quality.localeCompare(b.quality) || a.colour.localeCompare(b.colour);
  });

  return {
    from: from, to: to,
    opening: opening, received: received, issued: issued,
    closing: opening + received - issued,
    rows: list,
    parties: Array.from(parties.values()).sort(function(a,b){
      return (b.received + b.issued) - (a.received + a.issued);
    }),
    entryCount: counted,
    undated: undated
  };
}

function knownColours(){ return unique(db.entries.map(function(e){ return e.colour; }).filter(Boolean)).sort(); }
function knownParties(){ return unique(db.entries.map(function(e){ return e.party;  }).filter(Boolean)).sort(); }

function suggestColour(value){
  var v = norm(value);
  if(!v) return null;
  var known = knownColours();
  if(known.indexOf(v) >= 0) return { exact:true, name:v };
  var near = known.find(function(k){ return editDistance(k,v) === 1; });
  return near ? { exact:false, name:near } : null;
}

/* ---------------- writes ---------------- */
function newEntry(fields){
  var now = new Date().toISOString();
  return Object.assign({
    id: uid(), type:"IN", date:"", quality:"", colour:"", grams:0,
    party:"", remarks:"", slipNo:null, slipId:null,
    createdAt: now, updatedAt: now,
    voidedAt:null, voidReason:"", correctsId:null, forced:false, note:"",
    device: deviceId()
  }, fields);
}

function addInward(f){
  var e = newEntry({ type:"IN", date:f.date, quality:f.quality, colour:norm(f.colour),
                     grams:f.grams, party:norm(f.party), remarks:(f.remarks||"").trim() });
  db.entries.push(e);
  rememberQuality(e.quality);
  persist();
  return e;
}

function addSlip(lines, meta){
  var slipNo = db.nextSlip++;
  var slipId = uid();
  var now = new Date().toISOString();
  var party = norm(meta.party);
  lines.forEach(function(l){
    db.entries.push(newEntry({
      type:"OUT", date:meta.date, quality:l.quality, colour:norm(l.colour), grams:l.grams,
      party:party, remarks:(l.remarks||"").trim(), slipNo:slipNo, slipId:slipId,
      createdAt:now, updatedAt:now, forced: !!meta.forced
    }));
    rememberQuality(l.quality);
  });
  persist();
  return { slipNo:slipNo, slipId:slipId, grams: lines.reduce(function(s,l){ return s+l.grams; },0) };
}

function voidEntry(id, reason){
  var e = db.entries.find(function(x){ return x.id === id; });
  if(!e || e.voidedAt) return null;
  e.voidedAt = new Date().toISOString();
  e.updatedAt = e.voidedAt;
  e.voidReason = (reason||"").trim();
  persist();
  return e;
}

function correctEntry(id, fields){
  var e = db.entries.find(function(x){ return x.id === id; });
  if(!e || e.voidedAt) return null;
  var now = new Date().toISOString();
  e.voidedAt = now; e.updatedAt = now; e.voidReason = "Replaced by a correction";
  var fixed = Object.assign({}, e, {
    id: uid(), date:fields.date, quality:fields.quality, colour:norm(fields.colour), grams:fields.grams,
    createdAt: now, updatedAt: now, voidedAt:null, voidReason:"", correctsId: e.id, note:"",
    device: deviceId()
  });
  db.entries.push(fixed);
  rememberQuality(fixed.quality);
  persist();
  return fixed;
}

function rememberQuality(q){
  if(q && db.qualities.indexOf(q) < 0){ db.qualities.push(q); db.qualities.sort(); }
}

function addQuality(name){
  var n = norm(name);
  if(!n) return { ok:false, msg:"Enter a name." };
  if(db.qualities.indexOf(n) >= 0) return { ok:false, msg:"That quality already exists." };
  db.qualities.push(n); db.qualities.sort(); persist();
  return { ok:true, name:n };
}

function renameQuality(from, to){
  var n = norm(to);
  if(!n) return { ok:false, msg:"Enter a name." };
  if(n !== from && db.qualities.indexOf(n) >= 0) return { ok:false, msg:"A quality with that name already exists." };
  db.qualities = db.qualities.map(function(x){ return x === from ? n : x; });
  var stamp = new Date().toISOString();
  db.entries.forEach(function(e){ if(e.quality === from){ e.quality = n; e.updatedAt = stamp; } });
  persist();
  return { ok:true, name:n };
}

function removeQuality(q){
  var used = db.entries.filter(function(e){ return e.quality === q; }).length;
  if(used) return { ok:false, msg:'"'+q+'" is used by '+used+' entr'+(used===1?"y":"ies")+" and cannot be removed. Rename it instead, so the history stays correct." };
  if(db.qualities.length <= 1) return { ok:false, msg:"At least one quality is needed." };
  db.qualities = db.qualities.filter(function(x){ return x !== q; });
  persist();
  return { ok:true };
}

function countForQuality(q){ return db.entries.filter(function(e){ return e.quality === q; }).length; }
function balanceForQuality(q){
  return live().filter(function(e){ return e.quality === q; })
               .reduce(function(s,e){ return s + (e.type==="IN" ? e.grams : -e.grams); }, 0);
}

/* ---------------- merge (used by Drive sync) ----------------
   Entries are immutable apart from being voided, and every entry has
   its own id. So two copies of the register can be combined by taking
   the union of their entries - no change is ever thrown away.        */
function mergeRemote(remote){
  if(!remote || !Array.isArray(remote.entries)) return { added:0, voided:0, conflicts:[] };

  var wasQualities = db.qualities.join("\u0000"),
      wasSlip      = db.nextSlip,
      wasBackup    = db.lastBackup,
      wasLock      = db.lock;

  var byId = new Map();
  db.entries.forEach(function(e){ byId.set(e.id, e); });

  var added = 0, voided = 0;
  remote.entries.forEach(function(r){
    var mine = byId.get(r.id);
    if(!mine){
      db.entries.push(r);
      byId.set(r.id, r);
      added++;
      return;
    }
    // A void is deliberate and cannot be undone, so it always wins.
    if(r.voidedAt && !mine.voidedAt){
      mine.voidedAt = r.voidedAt;
      mine.voidReason = r.voidReason || mine.voidReason;
      mine.updatedAt = r.updatedAt || r.voidedAt;
      voided++;
    }else if((r.updatedAt||"") > (mine.updatedAt||"")){
      Object.assign(mine, r);
    }
  });

  db.qualities = unique(db.qualities.concat(remote.qualities || [])).filter(Boolean).sort();
  db.lastBackup = maxStr(db.lastBackup, remote.lastBackup);
  if(remote.lock && !db.lock) db.lock = remote.lock;

  // Slip numbers are handed out per device, so two devices working
  // offline can reach for the same number. Report any clash instead of
  // silently renumbering someone's paperwork.
  var conflicts = duplicateSlipNumbers();
  // Whichever side restarted the counter most recently wins, so a reset
  // made on one device is not reversed by another device's older slips.
  var localReset  = db.slipResetAt || "";
  var remoteReset = remote.slipResetAt || "";
  if(remoteReset > localReset){
    db.slipResetAt = remote.slipResetAt;
    db.nextSlip = remote.nextSlip || 1;
  }else if(localReset > remoteReset){
    // keep ours as it stands
  }else{
    db.nextSlip = Math.max(db.nextSlip, remote.nextSlip || 1);
  }
  // Never hand out a number already used since the last restart.
  db.nextSlip = Math.max(db.nextSlip, highestSlipNo() + 1);

  // A merge that brought nothing new is not a change, and must not
  // count as one - otherwise every sync leaves a change "waiting".
  var changed = added > 0 || voided > 0 ||
                db.qualities.join("\u0000") !== wasQualities ||
                db.nextSlip !== wasSlip ||
                db.lastBackup !== wasBackup ||
                db.lock !== wasLock;
  if(changed) persist(); else persistQuiet();

  return { added:added, voided:voided, conflicts:conflicts, changed:changed };
}

/* The highest slip number issued SINCE the last restart. Slips from
   before a restart are deliberately ignored, which is what lets the
   numbering begin again at 1. */
function highestSlipNo(){
  var since = db.slipResetAt || "";
  return db.entries.reduce(function(m,e){
    if(e.slipNo == null) return m;
    if(since && (e.createdAt || "") < since) return m;
    return e.slipNo > m ? e.slipNo : m;
  }, 0);
}

/* The highest number ever used, restarts included - for the warning. */
function highestSlipNoEver(){
  return db.entries.reduce(function(m,e){
    return (e.slipNo != null && e.slipNo > m) ? e.slipNo : m;
  }, 0);
}

function resetSlipNumber(startAt){
  var n = parseInt(startAt, 10);
  if(!Number.isFinite(n) || n < 1) n = 1;
  db.nextSlip = n;
  db.slipResetAt = new Date().toISOString();
  persist();
  return n;
}

function duplicateSlipNumbers(){
  var seen = new Map(), bad = [];
  db.entries.forEach(function(e){
    if(e.slipNo == null || !e.slipId) return;
    var known = seen.get(e.slipNo);
    if(!known){ seen.set(e.slipNo, e.slipId); }
    else if(known !== e.slipId && bad.indexOf(e.slipNo) < 0){ bad.push(e.slipNo); }
  });
  return bad;
}

function maxStr(a,b){ if(!a) return b||null; if(!b) return a; return a > b ? a : b; }

/* ---------------- export shapes ---------------- */
function snapshot(){ return JSON.parse(JSON.stringify(db)); }

function replaceAll(incoming){
  if(!incoming || !Array.isArray(incoming.entries)) return false;
  db = Object.assign(emptyDb(), incoming, { rev: db.rev + 1, syncedRev: 0 });
  if(!db.qualities.length) db.qualities = DEFAULT_QUALITIES.slice();
  persist();
  return true;
}

function markSynced(rev){ db.syncedRev = rev; persistQuiet(); }
function pendingChanges(){ return Math.max(0, db.rev - db.syncedRev); }
function markBackedUp(){ db.lastBackup = new Date().toISOString(); persistQuiet(); }
function setLock(hash){ db.lock = hash; persistQuiet(); }

/* ---------------- public ---------------- */
global.Store = {
  // lifecycle
  load: load,
  onChange: function(f){ listeners.push(f); },
  db: function(){ return db; },
  snapshot: snapshot,
  replaceAll: replaceAll,

  // reads
  live: live,
  stockRows: stockRows,
  availableGrams: availableGrams,
  totals: totals,
  knownColours: knownColours,
  knownParties: knownParties,
  suggestColour: suggestColour,
  countForQuality: countForQuality,
  balanceForQuality: balanceForQuality,
  duplicateSlipNumbers: duplicateSlipNumbers,

  // reporting
  periodSummary: periodSummary,
  monthRange: monthRange,
  yearRange: yearRange,
  previousRange: previousRange,

  // writes
  addInward: addInward,
  addSlip: addSlip,
  voidEntry: voidEntry,
  correctEntry: correctEntry,
  addQuality: addQuality,
  renameQuality: renameQuality,
  removeQuality: removeQuality,
  resetSlipNumber: resetSlipNumber,
  highestSlipNoEver: highestSlipNoEver,

  // sync bookkeeping
  mergeRemote: mergeRemote,
  markSynced: markSynced,
  pendingChanges: pendingChanges,
  markBackedUp: markBackedUp,
  setLock: setLock,
  deviceId: deviceId,

  // storage health
  storageOK: function(){ return storageOK; },
  storageMessage: function(){ return storageMsg; },

  // helpers shared with the UI
  uid: uid, kg: kg, toGrams: toGrams, norm: norm, todayISO: todayISO, dmy: dmy
};

})(window);
