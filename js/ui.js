/* ==================================================================
   ui.js - screens, forms and rendering

   Nothing here ever builds markup from a quality, colour, party or
   remark by joining strings. Values go in as text nodes, so a colour
   like  BLUE <SHADE A>  shows in full and a pasted HTML tag stays
   inert text.
   ================================================================== */
(function (global) {
"use strict";

var kg = Store.kg, toGrams = Store.toGrams, norm = Store.norm,
    todayISO = Store.todayISO, dmy = Store.dmy;

function $(s, r){ return (r||document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); }

function el(tag, props, kids){
  var n = document.createElement(tag), k;
  if(props) for(k in props){
    if(k === "class") n.className = props[k];
    else if(k === "text") n.textContent = props[k];        // text, never markup
    else if(k.slice(0,2) === "on") n.addEventListener(k.slice(2), props[k]);
    else if(props[k] !== null && props[k] !== undefined && props[k] !== false) n.setAttribute(k, props[k]);
  }
  (kids||[]).forEach(function(c){
    if(c === null || c === undefined) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
}

function toast(msg){
  var t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(function(){ t.classList.remove("show"); }, 2600);
}

function showError(box, msgs){
  box.textContent = "";
  if(!msgs.length){ box.hidden = true; return; }
  box.hidden = false;
  if(msgs.length === 1){ box.textContent = msgs[0]; return; }
  var ul = el("ul");
  msgs.forEach(function(m){ ul.appendChild(el("li", { text:m })); });
  box.appendChild(el("strong", { text:"Please check:" }));
  box.appendChild(ul);
}

/* ================= header + sync strip ================= */
function renderHeader(){
  var t = Store.totals();
  $("#hdrIn").textContent  = kg(t.in);
  $("#hdrOut").textContent = kg(t.out);
  var b = $("#hdrBal");
  b.textContent = kg(t.bal);
  b.classList.toggle("neg", t.bal < 0);
}

function renderSync(s){
  s = s || Drive.status();
  var dot = $("#syncDot"), txt = $("#syncText"), btn = $("#syncBtn"), pend = $("#syncPending");

  var cls = "dot", label = s.message || "";
  if(s.busy || s.status === "connecting") cls += " busy";
  else if(s.status === "connected") cls += " ok";
  else if(s.status === "expired")   cls += " warn";
  else if(s.status === "error")     cls += " bad";

  if(s.status === "off")       label = "Saved on this device. Google Drive is not set up.";
  if(s.status === "ready" && !s.message) label = "Not connected to Google Drive.";

  dot.className = cls;
  txt.textContent = label;

  // With no Drive set up there is nothing for changes to wait for, so
  // the count would only worry the user.
  var n = (s.status === "off") ? 0 : s.pending;
  pend.textContent = n > 0 ? (n + " change" + (n === 1 ? "" : "s") + " waiting to sync") : "";
  pend.hidden = n <= 0;

  // With no Client ID there is nothing to connect to yet, so the button
  // sends the user to Setup where it is explained, rather than vanishing.
  btn.hidden = false;
  // While it is picking the sign-in back up by itself there is nothing
  // useful to press, so the button waits rather than inviting a second
  // sign-in on top of the first.
  btn.disabled = !!s.busy || s.status === "connecting";
  btn.textContent = (s.status === "off")       ? "Set up Drive"
                  : (s.status === "connected") ? "Sync now"
                  : (s.status === "expired")   ? "Reconnect"
                  : "Connect Google Drive";
  btn.onclick = function(){
    if(s.status === "off")            showView("setup");
    else if(s.status === "connected") Drive.sync(true, false);
    else                              Drive.connect();
  };

  var last = $("#syncLast");
  last.textContent = s.lastSync ? "Last sync " + new Date(s.lastSync).toLocaleTimeString() : "";

  if(!$("#view-setup").hidden) renderDrivePanel(s);
}

/* The Setup tab is the place where Drive is actually managed. */
function renderDrivePanel(s){
  s = s || Drive.status();

  $("#driveNotSetUp").hidden = s.configured;
  $("#driveSetUp").hidden    = !s.configured;
  $("#originBox").textContent = location.origin;

  var dot = $("#setupDot"), label = $("#setupState");
  var cls = "dot", word = "Not set up";
  if(s.busy)                         { cls += " busy"; word = "Working"; }
  else if(s.status === "connecting") { cls += " busy"; word = "Reconnecting"; }
  else if(s.status === "connected")  { cls += " ok";   word = "Connected"; }
  else if(s.status === "expired")   { cls += " warn"; word = "Reconnect needed"; }
  else if(s.status === "error")     { cls += " bad";  word = "Problem"; }
  else if(s.status === "ready")     {                 word = "Not connected"; }
  dot.className = cls;
  label.textContent = word;

  if(!s.configured){ $("#driveLastLine").textContent = ""; return; }

  $("#driveStatusLine").textContent = s.message || "";

  // A sync in progress means we are signed in, so Connect stays away.
  var connected = (s.status === "connected" || s.status === "syncing" || s.busy);
  var connectBtn = $("#driveConnect");
  connectBtn.textContent = (s.status === "expired") ? "Reconnect Google Drive" : "Connect Google Drive";
  connectBtn.hidden = connected;
  connectBtn.disabled = !!s.busy || s.status === "connecting";

  $("#driveSync").hidden     = !connected;
  $("#driveRefresh").hidden  = !connected;
  $("#disconnectDrive").hidden = !connected;
  $("#driveSync").disabled = $("#driveRefresh").disabled = !!s.busy;

  var bits = [];
  if(s.lastSync) bits.push("Last sync " + new Date(s.lastSync).toLocaleString());
  if(s.pending > 0) bits.push(s.pending + " change" + (s.pending === 1 ? "" : "s") + " waiting to go up");
  $("#driveLastLine").textContent = bits.join(" · ");
}

/* ================= shared pickers ================= */
function refreshDatalists(){
  var c = $("#colourList"); c.textContent = "";
  Store.knownColours().forEach(function(v){ c.appendChild(el("option", { value:v })); });
  var p = $("#partyList"); p.textContent = "";
  Store.knownParties().forEach(function(v){ p.appendChild(el("option", { value:v })); });
}

function fillQualitySelect(sel, keep){
  var cur = keep && sel.value;
  sel.textContent = "";
  Store.db().qualities.forEach(function(q){ sel.appendChild(el("option", { value:q, text:q })); });
  if(cur && Store.db().qualities.indexOf(cur) >= 0) sel.value = cur;
}

/* ================= inward ================= */
function colourFeedback(){
  var hint = $("#inColourHint"), v = norm($("#inColour").value);
  hint.textContent = ""; hint.className = "hint";
  if(!v) return;

  var s = Store.suggestColour(v);
  if(s && s.exact){
    hint.textContent = "In stock for " + $("#inQuality").value + ": " +
                       kg(Store.availableGrams($("#inQuality").value, v)) + " KG";
    hint.className = "hint hint-ok";
  }else if(s){
    hint.className = "hint hint-warn";
    hint.appendChild(document.createTextNode("New colour. Did you mean "));
    hint.appendChild(el("button", { class:"btn-link", type:"button", text:s.name, onclick:function(){
      $("#inColour").value = s.name; colourFeedback();
    }}));
    hint.appendChild(document.createTextNode("?"));
  }else{
    hint.textContent = "New colour — it will be added to the list.";
  }
}

function submitInward(ev){
  ev.preventDefault();
  var date = $("#inDate").value,
      quality = $("#inQuality").value,
      colour = norm($("#inColour").value),
      grams = toGrams($("#inQty").value),
      errs = [];

  if(!date) errs.push("Date is required.");
  else if(date > todayISO()) errs.push("Date is in the future.");
  if(!quality) errs.push("Select a quality.");
  if(!colour) errs.push("Colour is required.");
  if(!Number.isFinite(grams) || grams <= 0) errs.push("Quantity must be more than zero.");

  showError($("#inErr"), errs);
  if(errs.length) return;

  Store.addInward({ date:date, quality:quality, colour:colour, grams:grams,
                    party:$("#inParty").value, remarks:$("#inRemarks").value });

  // every field belonging to one entry is cleared, colour included
  $("#inColour").value = ""; $("#inQty").value = ""; $("#inRemarks").value = "";
  $("#inColourHint").textContent = "";
  $("#inColour").focus();

  toast("Inward saved — " + kg(grams) + " KG " + quality + " " + colour);
}

function renderRecentIn(){
  var t = $("#recentIn"); t.textContent = "";
  var rows = Store.db().entries.filter(function(e){ return e.type === "IN"; }).slice(-10).reverse();

  t.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Date" }), el("th", { text:"Quality" }), el("th", { text:"Colour" }),
    el("th", { class:"r", text:"KG" }), el("th", { text:"Supplier" }), el("th", { text:"" })
  ])]));

  if(!rows.length){
    t.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { colspan:"6" },
      [el("div", { class:"empty", text:"No inward entries yet." })])])]));
    return;
  }
  var tb = el("tbody");
  rows.forEach(function(e){
    tb.appendChild(el("tr", { class: e.voidedAt ? "voided" : "" }, [
      el("td", { text:dmy(e.date) }),
      el("td", {}, [el("span", { class: e.voidedAt ? "strike" : "", text:e.quality })]),
      el("td", { text:e.colour }),
      el("td", { class:"r", text:kg(e.grams) }),
      el("td", { class:"muted", text:e.party || "—" }),
      el("td", {}, e.voidedAt ? [el("span", { class:"chip chip-void", text:"Voided" })] : [])
    ]));
  });
  t.appendChild(tb);
}

/* ================= outward ================= */
function addLine(){
  var line = el("div", { class:"line" });
  var qSel = el("select", { class:"lineQ" }); fillQualitySelect(qSel);
  var cIn = el("input", { class:"lineC", list:"colourList", autocomplete:"off", placeholder:"Colour" });
  var kIn = el("input", { class:"lineK", type:"number", step:"0.01", min:"0.01", inputmode:"decimal", placeholder:"0.00" });
  var rIn = el("input", { class:"lineR", placeholder:"optional", autocomplete:"off" });
  var avail = el("div", { class:"hint" });

  function sync(){ updateAvail(line, avail); updateOutTotal(); }
  qSel.addEventListener("change", sync);
  cIn.addEventListener("input", sync);
  kIn.addEventListener("input", sync);

  line.appendChild(el("div", { class:"line-head" }, [
    el("span", { class:"line-no" }),
    el("button", { class:"btn btn-sm", type:"button", text:"Remove", style:"margin-left:auto",
      onclick:function(){ line.remove(); renumberLines(); updateOutTotal(); } })
  ]));
  line.appendChild(el("div", { class:"grid" }, [
    el("div", {}, [el("label", { text:"Quality" }), qSel]),
    el("div", {}, [el("label", { text:"Colour" }), cIn, avail]),
    el("div", {}, [el("label", { text:"Quantity (KG)" }), kIn]),
    el("div", {}, [el("label", { text:"Remarks" }), rIn])
  ]));
  $("#outLines").appendChild(line);
  renumberLines();
  return line;
}

function renumberLines(){
  $$("#outLines .line").forEach(function(l, i){ $(".line-no", l).textContent = "ITEM " + (i+1); });
}

function updateAvail(line, box){
  var q = $(".lineQ", line).value,
      c = norm($(".lineC", line).value),
      want = toGrams($(".lineK", line).value) || 0;
  if(!c){ box.textContent = ""; box.className = "hint"; return; }
  var have = Store.availableGrams(q, c);
  if(have <= 0){
    box.textContent = "No stock recorded for this quality / colour.";
    box.className = "hint hint-bad";
  }else if(want > have){
    box.textContent = "Only " + kg(have) + " KG available — short by " + kg(want-have) + " KG.";
    box.className = "hint hint-bad";
  }else{
    box.textContent = "Available: " + kg(have) + " KG";
    box.className = "hint hint-ok";
  }
}

function updateOutTotal(){
  var t = 0;
  $$("#outLines .line").forEach(function(l){ t += toGrams($(".lineK", l).value) || 0; });
  $("#outTotal").textContent = kg(t);
}

function readLines(){
  return $$("#outLines .line").map(function(l){
    return {
      quality: $(".lineQ", l).value,
      colour: norm($(".lineC", l).value),
      grams: toGrams($(".lineK", l).value),
      remarks: $(".lineR", l).value.trim()
    };
  });
}

function submitOutward(ev){
  ev.preventDefault();
  var date = $("#outDate").value, lines = readLines(), errs = [];

  if(!date) errs.push("Date is required.");
  else if(date > todayISO()) errs.push("Date is in the future.");
  if(!lines.length) errs.push("Add at least one item.");

  lines.forEach(function(l, i){
    var tag = "Item " + (i+1) + ": ";
    if(!l.colour) errs.push(tag + "colour is required.");
    if(!Number.isFinite(l.grams) || l.grams <= 0) errs.push(tag + "quantity must be more than zero.");
  });

  if(!errs.length){
    // Shortages are judged on the whole slip, so two lines of the same
    // quality and colour cannot each slip through on their own.
    var want = new Map();
    lines.forEach(function(l){
      var k = l.quality + "\u0000" + l.colour;
      want.set(k, (want.get(k)||0) + l.grams);
    });
    var short = [];
    want.forEach(function(g, k){
      var parts = k.split("\u0000"), have = Store.availableGrams(parts[0], parts[1]);
      if(g > have) short.push({ q:parts[0], c:parts[1], have:have, want:g });
    });
    if(short.length){
      showError($("#outErr"), short.map(function(s){
        return s.q + " " + s.c + ": issuing " + kg(s.want) + " KG but only " + kg(s.have) + " KG in stock.";
      }).concat("Record the inward first, or use Force Issue if the goods are physically there."));
      $("#outErr").appendChild(el("div", { class:"btn-row", style:"margin-top:10px" }, [
        el("button", { class:"btn-danger btn-sm", type:"button", text:"Force Issue anyway", onclick:function(){
          if(confirm("This takes the balance negative and the slip is marked FORCED.\n\nContinue?")){
            commitSlip(lines, date, true);
          }
        }})
      ]));
      return;
    }
  }

  showError($("#outErr"), errs);
  if(errs.length) return;
  commitSlip(lines, date, false);
}

function commitSlip(lines, date, forced){
  var res = Store.addSlip(lines, { date:date, party:$("#outParty").value, forced:forced });

  $("#outErr").hidden = true;
  $("#outLines").textContent = "";
  addLine();
  $("#outParty").value = "";
  updateOutTotal();

  $("#lastSlipPanel").hidden = false;
  $("#lastSlipNo").textContent = res.slipNo;
  $("#lastSlipTotal").textContent = kg(res.grams);
  $("#printLast").onclick = function(){ printSlip(res.slipId); };

  toast("Slip " + res.slipNo + " saved — " + kg(res.grams) + " KG");
}

/* ================= stock ================= */
function renderStock(){
  var t = $("#stockTable"); t.textContent = "";
  var term = norm($("#stockSearch").value);
  var rows = Store.stockRows().filter(function(r){
    return !term || r.quality.indexOf(term) >= 0 || r.colour.indexOf(term) >= 0;
  });

  t.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Quality" }), el("th", { text:"Colour" }),
    el("th", { class:"r", text:"Received" }), el("th", { class:"r", text:"Issued" }), el("th", { class:"r", text:"Balance" })
  ])]));

  if(!rows.length){
    t.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { colspan:"5" }, [
      el("div", { class:"empty", text: term ? "Nothing matches that search." : "No stock recorded yet." })])])]));
    return;
  }

  var tb = el("tbody");
  rows.forEach(function(r){
    tb.appendChild(el("tr", {}, [
      el("td", { text:r.quality }),
      el("td", { text:r.colour }),
      el("td", { class:"r", text:kg(r.in) }),
      el("td", { class:"r", text:kg(r.out) }),
      el("td", { class:"r " + (r.bal < 0 ? "neg" : ""), text:kg(r.bal) })
    ]));
  });
  t.appendChild(tb);

  var tot = rows.reduce(function(a, r){
    return { in:a.in+r.in, out:a.out+r.out, bal:a.bal+r.bal };
  }, { in:0, out:0, bal:0 });

  t.appendChild(el("tfoot", {}, [el("tr", {}, [
    el("td", { colspan:"2", text:"Total — " + rows.length + " item" + (rows.length === 1 ? "" : "s") }),
    el("td", { class:"r", text:kg(tot.in) }),
    el("td", { class:"r", text:kg(tot.out) }),
    el("td", { class:"r " + (tot.bal < 0 ? "neg" : ""), text:kg(tot.bal) })
  ])]));
}

/* ================= reports ================= */
var lastReport = null;          // kept so Print and CSV use the shown period

function setPeriod(from, to){
  $("#repFrom").value = from || "";
  $("#repTo").value   = to || "";
  renderReports();
}

function periodLabel(from, to){
  if(!from && !to) return "all time";
  if(from && to)   return dmy(from) + " to " + dmy(to);
  return from ? ("from " + dmy(from)) : ("up to " + dmy(to));
}

function statCard(label, grams, cls, delta){
  var v = el("div", { class:"v" + (grams < 0 ? " neg" : "") }, [
    document.createTextNode(kg(grams)), el("span", { class:"u", text:"KG" })
  ]);
  return el("div", { class:"stat " + (cls||"") }, [
    el("div", { class:"k", text:label }), v, delta || null
  ]);
}

/* Change against the comparable window before this one. */
function deltaNode(now, before, whatFor){
  if(before === null || before === undefined) return null;
  if(!before) return el("div", { class:"d flat", text: now ? "nothing in " + whatFor : "" });
  var pct = Math.round(((now - before) / before) * 100);
  var cls = pct > 0 ? "up" : (pct < 0 ? "down" : "flat");
  var arrow = pct > 0 ? "↑" : (pct < 0 ? "↓" : "→");
  return el("div", { class:"d " + cls,
    text: arrow + " " + Math.abs(pct) + "% vs " + whatFor + " (" + kg(before) + ")" });
}

function renderReports(){
  var from = $("#repFrom").value, to = $("#repTo").value;
  var s = Store.periodSummary(from, to);
  lastReport = s;

  $("#repCaption").textContent =
    periodLabel(from, to) + " — " + s.entryCount + " entr" + (s.entryCount === 1 ? "y" : "ies") + " in this period";

  // undated entries carried over from the old software sit in opening
  var warn = $("#repUndated"); warn.textContent = "";
  if(s.undated){
    warn.appendChild(el("div", { class:"notice notice-warn", style:"margin-top:10px", text:
      s.undated + " entr" + (s.undated === 1 ? "y has" : "ies have") +
      " no date, so they are counted in the opening balance rather than in any month. " +
      "Give them a date in History to place them properly." }));
  }

  // comparison window
  var prev = Store.previousRange(from, to);
  var prevSum = prev ? Store.periodSummary(prev.from, prev.to) : null;
  var prevName = prev ? periodLabel(prev.from, prev.to) : null;
  if(prev && prev.from.slice(0,7) === prev.to.slice(0,7)){
    prevName = new Date(prev.from + "T00:00:00").toLocaleDateString(undefined, { month:"long", year:"numeric" });
  }

  var stats = $("#repStats"); stats.textContent = "";
  stats.appendChild(statCard("Opening balance", s.opening));
  stats.appendChild(statCard("Received", s.received, "in",
    prevSum ? deltaNode(s.received, prevSum.received, prevName) : null));
  stats.appendChild(statCard("Issued", s.issued, "out",
    prevSum ? deltaNode(s.issued, prevSum.issued, prevName) : null));
  stats.appendChild(statCard("Closing balance", s.closing, "close"));

  // ---- movement by quality ----
  var t = $("#repRows"); t.textContent = "";
  t.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Quality" }), el("th", { text:"Colour" }),
    el("th", { class:"r", text:"Opening" }), el("th", { class:"r", text:"Received" }),
    el("th", { class:"r", text:"Issued" }), el("th", { class:"r", text:"Closing" })
  ])]));

  if(!s.rows.length){
    t.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { colspan:"6" },
      [el("div", { class:"empty", text:"No movement in this period." })])])]));
  }else{
    var tb = el("tbody");
    s.rows.forEach(function(r){
      tb.appendChild(el("tr", {}, [
        el("td", { text:r.quality }),
        el("td", { text:r.colour }),
        el("td", { class:"r muted", text:kg(r.opening) }),
        el("td", { class:"r", text: r.received ? kg(r.received) : "—" }),
        el("td", { class:"r", text: r.issued ? kg(r.issued) : "—" }),
        el("td", { class:"r " + (r.closing < 0 ? "neg" : ""), text:kg(r.closing) })
      ]));
    });
    t.appendChild(tb);
    t.appendChild(el("tfoot", {}, [el("tr", {}, [
      el("td", { colspan:"2", text:"Total — " + s.rows.length + " item" + (s.rows.length === 1 ? "" : "s") }),
      el("td", { class:"r", text:kg(s.opening) }),
      el("td", { class:"r", text:kg(s.received) }),
      el("td", { class:"r", text:kg(s.issued) }),
      el("td", { class:"r " + (s.closing < 0 ? "neg" : ""), text:kg(s.closing) })
    ])]));
  }

  // ---- parties ----
  var p = $("#repParties"); p.textContent = "";
  p.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Supplier / Customer" }),
    el("th", { class:"r", text:"Received from" }), el("th", { class:"r", text:"Issued to" })
  ])]));
  if(!s.parties.length){
    p.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { colspan:"3" },
      [el("div", { class:"empty", text:"No supplier or customer names recorded in this period." })])])]));
  }else{
    var pb = el("tbody");
    s.parties.forEach(function(x){
      pb.appendChild(el("tr", {}, [
        el("td", { text:x.party }),
        el("td", { class:"r", text: x.received ? kg(x.received) : "—" }),
        el("td", { class:"r", text: x.issued ? kg(x.issued) : "—" })
      ]));
    });
    p.appendChild(pb);
  }
}

function reportCsv(){
  var s = lastReport;
  if(!s) return;
  var head = ["Quality","Colour","Opening KG","Received KG","Issued KG","Closing KG"];
  var body = s.rows.map(function(r){
    return [r.quality, r.colour, kg(r.opening), kg(r.received), kg(r.issued), kg(r.closing)].map(csvCell).join(",");
  });
  body.push(["TOTAL","", kg(s.opening), kg(s.received), kg(s.issued), kg(s.closing)].map(csvCell).join(","));
  var meta = [["Sunshine Fabrics — Stock Report"].map(csvCell).join(","),
              ["Period", periodLabel(s.from, s.to)].map(csvCell).join(","), ""];
  download("sunshine-fabrics-report-" + (s.from || "start") + "-to-" + (s.to || todayISO()) + ".csv",
           "﻿" + meta.concat([head.map(csvCell).join(",")]).concat(body).join("\r\n"),
           "text/csv;charset=utf-8");
  toast("Report exported");
}

function printReport(){
  var s = lastReport;
  if(!s) return;
  var tb = el("tbody");
  s.rows.forEach(function(r){
    tb.appendChild(el("tr", {}, [
      el("td", { text:r.quality }), el("td", { text:r.colour }),
      el("td", { class:"r", text:kg(r.opening) }), el("td", { class:"r", text:kg(r.received) }),
      el("td", { class:"r", text:kg(r.issued) }), el("td", { class:"r", text:kg(r.closing) })
    ]));
  });
  tb.appendChild(el("tr", {}, [
    el("td", { text:"TOTAL" }), el("td", {}),
    el("td", { class:"r", text:kg(s.opening) }), el("td", { class:"r", text:kg(s.received) }),
    el("td", { class:"r", text:kg(s.issued) }), el("td", { class:"r", text:kg(s.closing) })
  ]));

  doPrint(el("div", { class:"slip" }, [
    el("h2", { text:(SUNSHINE_CONFIG.businessName || "SUNSHINE FABRICS") }),
    el("div", { class:"sub", text:"Stock Report — " + periodLabel(s.from, s.to) }),
    el("div", { class:"meta" }, [
      el("span", { text:"Opening: " + kg(s.opening) + " KG" }),
      el("span", { text:"Received: " + kg(s.received) + " KG" }),
      el("span", { text:"Issued: " + kg(s.issued) + " KG" })
    ]),
    el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", { text:"Quality" }), el("th", { text:"Colour" }),
        el("th", { class:"r", text:"Opening" }), el("th", { class:"r", text:"Received" }),
        el("th", { class:"r", text:"Issued" }), el("th", { class:"r", text:"Closing" })
      ])]),
      tb
    ]),
    el("div", { class:"total", text:"Closing Balance: " + kg(s.closing) + " KG" })
  ]));
}

/* ================= history ================= */
function historyRows(){
  var from = $("#hFrom").value, to = $("#hTo").value,
      type = $("#hType").value, term = norm($("#hSearch").value),
      showVoid = $("#hVoid").checked;

  return Store.db().entries.filter(function(e){
    if(!showVoid && e.voidedAt) return false;
    if(type && e.type !== type) return false;
    if(from && (!e.date || e.date < from)) return false;
    if(to && (!e.date || e.date > to)) return false;
    if(term){
      var hay = [e.quality, e.colour, e.party, e.remarks, e.slipNo ? "SLIP " + e.slipNo : ""].join(" ");
      if(norm(hay).indexOf(term) < 0) return false;
    }
    return true;
  }).slice().reverse();
}

function renderHistory(){
  var t = $("#histTable"); t.textContent = "";
  var rows = historyRows();

  t.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Date" }), el("th", { text:"Type" }), el("th", { text:"Slip" }),
    el("th", { text:"Quality" }), el("th", { text:"Colour" }), el("th", { class:"r", text:"KG" }),
    el("th", { text:"Party" }), el("th", { text:"Actions" })
  ])]));

  if(!rows.length){
    t.appendChild(el("tbody", {}, [el("tr", {}, [el("td", { colspan:"8" }, [
      el("div", { class:"empty", text:"No entries match these filters." })])])]));
    return;
  }

  var tb = el("tbody");
  rows.forEach(function(e){
    var chips = el("td");
    chips.appendChild(el("span", { class:"chip " + (e.type === "IN" ? "chip-in" : "chip-out"),
                                   text: e.type === "IN" ? "In" : "Out" }));
    if(e.forced)     chips.appendChild(el("span", { class:"chip chip-forced", text:"Forced", style:"margin-left:4px" }));
    if(e.correctsId) chips.appendChild(el("span", { class:"chip chip-corr",   text:"Correction", style:"margin-left:4px" }));
    if(e.voidedAt)   chips.appendChild(el("span", { class:"chip chip-void",   text:"Voided", style:"margin-left:4px" }));

    var actions = el("td", { class:"btn-row" });
    if(!e.voidedAt){
      actions.appendChild(el("button", { class:"btn btn-sm", type:"button", text:"Correct",
        onclick:function(){ openCorrect(e.id); } }));
      actions.appendChild(el("button", { class:"btn-danger btn-sm", type:"button", text:"Void",
        onclick:function(){ openVoid(e.id); } }));
    }else{
      actions.appendChild(el("span", { class:"muted", text:e.voidReason || "voided" }));
    }
    if(e.slipId){
      actions.appendChild(el("button", { class:"btn btn-sm", type:"button", text:"Print",
        onclick:function(){ printSlip(e.slipId); } }));
    }

    tb.appendChild(el("tr", { class: e.voidedAt ? "voided" : "" }, [
      el("td", { text: e.date ? dmy(e.date) : "—" }),
      chips,
      el("td", { class:"num", text: e.slipNo != null ? String(e.slipNo) : "—" }),
      el("td", {}, [el("span", { class: e.voidedAt ? "strike" : "", text:e.quality })]),
      el("td", { text:e.colour }),
      el("td", { class:"r", text:kg(e.grams) }),
      el("td", { class:"muted", text:e.party || "—" }),
      actions
    ]));
  });
  t.appendChild(tb);

  var net = rows.reduce(function(s, e){
    return s + (e.voidedAt ? 0 : (e.type === "IN" ? e.grams : -e.grams));
  }, 0);

  t.appendChild(el("tfoot", {}, [el("tr", {}, [
    el("td", { colspan:"5", text: rows.length + " entr" + (rows.length === 1 ? "y" : "ies") + " shown — net movement" }),
    el("td", { class:"r " + (net < 0 ? "neg" : ""), text:kg(net) }),
    el("td", { colspan:"2" })
  ])]));
}

/* ================= modals ================= */
function openModal(nodes){
  var card = $("#modalCard"); card.textContent = "";
  nodes.forEach(function(n){ card.appendChild(n); });
  $("#modal").hidden = false;
}
function closeModal(){ $("#modal").hidden = true; }

function openVoid(id){
  var e = Store.db().entries.find(function(x){ return x.id === id; });
  if(!e) return;
  var reason = el("input", { placeholder:"Reason (optional)", autocomplete:"off" });
  openModal([
    el("div", { class:"panel-head" }, [el("h2", { text:"Void entry" })]),
    el("div", { class:"panel-body" }, [
      el("p", { style:"margin-top:0", text:
        (e.type === "IN" ? "Inward " : "Outward ") + kg(e.grams) + " KG — " +
        e.quality + " " + e.colour + " dated " + dmy(e.date) + "." }),
      el("p", { class:"hint", text:"The entry stays in History marked as voided and stock is recalculated. Nothing is erased." }),
      el("label", { text:"Reason" }), reason,
      el("div", { class:"btn-row", style:"margin-top:14px" }, [
        el("button", { class:"btn-danger", type:"button", text:"Void entry", onclick:function(){
          Store.voidEntry(id, reason.value);
          closeModal(); toast("Entry voided");
        }}),
        el("button", { class:"btn", type:"button", text:"Cancel", onclick:closeModal })
      ])
    ])
  ]);
  reason.focus();
}

function openCorrect(id){
  var e = Store.db().entries.find(function(x){ return x.id === id; });
  if(!e) return;
  var qSel = el("select"); fillQualitySelect(qSel); qSel.value = e.quality;
  var dIn = el("input", { type:"date", value:e.date });
  var cIn = el("input", { list:"colourList", value:e.colour, autocomplete:"off" });
  var kIn = el("input", { type:"number", step:"0.01", min:"0.01", inputmode:"decimal", value:kg(e.grams) });
  var err = el("div", { class:"notice notice-bad", hidden:"hidden", style:"margin:12px 0 0" });

  openModal([
    el("div", { class:"panel-head" }, [el("h2", { text:"Correct entry" })]),
    el("div", { class:"panel-body" }, [
      el("p", { class:"hint", style:"margin-top:0",
        text:"The original is voided and a corrected entry is added in its place. Both stay in History." }),
      el("div", { class:"grid" }, [
        el("div", {}, [el("label", { text:"Date" }), dIn]),
        el("div", {}, [el("label", { text:"Quality" }), qSel]),
        el("div", {}, [el("label", { text:"Colour" }), cIn]),
        el("div", {}, [el("label", { text:"Quantity (KG)" }), kIn])
      ]),
      err,
      el("div", { class:"btn-row", style:"margin-top:14px" }, [
        el("button", { class:"btn-primary", type:"button", text:"Save correction", onclick:function(){
          var grams = toGrams(kIn.value), colour = norm(cIn.value), msgs = [];
          if(!dIn.value) msgs.push("Date is required.");
          if(!colour) msgs.push("Colour is required.");
          if(!Number.isFinite(grams) || grams <= 0) msgs.push("Quantity must be more than zero.");
          showError(err, msgs);
          if(msgs.length) return;
          Store.correctEntry(id, { date:dIn.value, quality:qSel.value, colour:colour, grams:grams });
          closeModal(); toast("Correction saved");
        }}),
        el("button", { class:"btn", type:"button", text:"Cancel", onclick:closeModal })
      ])
    ])
  ]);
}

/* ================= setup ================= */
function renderQualities(){
  var t = $("#qualityTable"); t.textContent = "";
  t.appendChild(el("thead", {}, [el("tr", {}, [
    el("th", { text:"Quality" }), el("th", { class:"r", text:"Entries" }),
    el("th", { class:"r", text:"Balance KG" }), el("th", { text:"Actions" })
  ])]));
  var tb = el("tbody");
  Store.db().qualities.forEach(function(q){
    var used = Store.countForQuality(q), bal = Store.balanceForQuality(q);
    tb.appendChild(el("tr", {}, [
      el("td", { text:q }),
      el("td", { class:"r muted", text:String(used) }),
      el("td", { class:"r " + (bal < 0 ? "neg" : ""), text:kg(bal) }),
      el("td", { class:"btn-row" }, [
        el("button", { class:"btn btn-sm", type:"button", text:"Rename", onclick:function(){ openRename(q); } }),
        el("button", { class:"btn-danger btn-sm", type:"button", text:"Remove", onclick:function(){
          var res = Store.removeQuality(q);
          if(!res.ok) alert(res.msg); else toast("Quality removed");
        }})
      ])
    ]));
  });
  t.appendChild(tb);
}

function openRename(q){
  var input = el("input", { value:q, autocomplete:"off" });
  var used = Store.countForQuality(q);
  openModal([
    el("div", { class:"panel-head" }, [el("h2", { text:"Rename quality" })]),
    el("div", { class:"panel-body" }, [
      el("p", { class:"hint", style:"margin-top:0", text: used
        ? "This name is used by " + used + " entr" + (used === 1 ? "y" : "ies") + ". They will all be updated."
        : "This quality has no entries yet." }),
      el("label", { text:"Name" }), input,
      el("div", { class:"btn-row", style:"margin-top:14px" }, [
        el("button", { class:"btn-primary", type:"button", text:"Rename", onclick:function(){
          var res = Store.renameQuality(q, input.value);
          if(!res.ok){ alert(res.msg); return; }
          closeModal(); toast("Renamed to " + res.name);
        }}),
        el("button", { class:"btn", type:"button", text:"Cancel", onclick:closeModal })
      ])
    ])
  ]);
  input.focus(); input.select();
}

function renderSlipPanel(){
  var d = Store.db();
  $("#slipNext").textContent = d.nextSlip;

  var start = parseInt($("#slipStart").value, 10);
  if(!Number.isFinite(start) || start < 1) start = 1;
  var highest = Store.highestSlipNoEver();
  var w = $("#slipWarn");

  if(highest >= start){
    w.className = "hint hint-warn";
    w.textContent = "Slips up to no. " + highest + " already exist. Restarting at " + start +
      " means those numbers get used a second time — the date on the slip tells them apart.";
  }else{
    w.className = "hint";
    w.textContent = d.slipResetAt
      ? "Last restarted " + new Date(d.slipResetAt).toLocaleString() + "."
      : "The count has never been restarted.";
  }
}

function doSlipReset(){
  var start = parseInt($("#slipStart").value, 10);
  if(!Number.isFinite(start) || start < 1){ alert("Enter a number of 1 or more."); return; }

  var highest = Store.highestSlipNoEver();
  var msg = "Restart slip numbering at " + start + "?\n\nThe next slip saved will be no. " + start + ".";
  if(highest >= start){
    msg += "\n\nSlips up to no. " + highest + " already exist, so those numbers will be used again. " +
           "Old slips keep their numbers and nothing in the register is changed.";
  }
  if(!confirm(msg)) return;

  Store.resetSlipNumber(start);
  renderSlipPanel();
  toast("Slip numbering restarts at " + start);
}

function renderBackupInfo(){
  var d = Store.db();
  $("#backupInfo").textContent = d.lastBackup
    ? "Last backup: " + new Date(d.lastBackup).toLocaleString() + " — " + d.entries.length + " entries stored."
    : "No backup taken yet — " + d.entries.length + " entries stored.";
}

/* ================= export / backup ================= */
function download(name, text, mime){
  var url = URL.createObjectURL(new Blob([text], { type:mime }));
  var a = el("a", { href:url, download:name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

/* A leading = + - or @ makes a spreadsheet treat the cell as a
   formula, so those are escaped before the value is written. */
function csvCell(v){
  var s = (v === null || v === undefined) ? "" : String(v);
  if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function exportCsv(){
  var rows = historyRows();
  var head = ["Date","Type","Status","Slip No.","Quality","Colour","Quantity KG","Party","Remarks"];
  var body = rows.map(function(e){
    return [e.date, e.type === "IN" ? "Inward" : "Outward",
            e.voidedAt ? "VOIDED" : (e.forced ? "FORCED" : "Active"),
            e.slipNo == null ? "" : e.slipNo,
            e.quality, e.colour, kg(e.grams), e.party, e.remarks].map(csvCell).join(",");
  });
  download("sunshine-fabrics-register-" + todayISO() + ".csv",
           "﻿" + [head.map(csvCell).join(",")].concat(body).join("\r\n"),
           "text/csv;charset=utf-8");
  toast("Exported " + rows.length + " rows");
}

function backup(){
  download("sunshine-fabrics-backup-" + todayISO() + ".json",
           JSON.stringify(Store.snapshot(), null, 2), "application/json");
  Store.markBackedUp();
  renderBackupInfo();
  toast("Backup downloaded");
}

function restore(file){
  var fr = new FileReader();
  fr.onload = function(){
    var incoming;
    try{ incoming = JSON.parse(fr.result); }
    catch(e){ alert("That file is not a valid backup."); return; }
    if(!incoming || !Array.isArray(incoming.entries)){ alert("That file is not a Sunshine Fabrics backup."); return; }
    if(!confirm("Replace the current register with this backup?\n\n" +
                "Now: " + Store.db().entries.length + " entries\n" +
                "Backup: " + incoming.entries.length + " entries\n\nThis cannot be undone.")) return;
    Store.replaceAll(incoming);
    toast("Backup restored — " + Store.db().entries.length + " entries");
  };
  fr.readAsText(file);
}

/* ================= print ================= */
function printSlip(slipId){
  var rows = Store.db().entries.filter(function(e){ return e.slipId === slipId; });
  if(!rows.length){ alert("Slip not found."); return; }
  var first = rows[0];
  var totalG = rows.reduce(function(s, e){ return s + (e.voidedAt ? 0 : e.grams); }, 0);

  var tb = el("tbody");
  rows.forEach(function(e, i){
    tb.appendChild(el("tr", {}, [
      el("td", { text:String(i+1) }),
      el("td", { text:e.quality + (e.voidedAt ? " (VOIDED)" : "") }),
      el("td", { text:e.colour }),
      el("td", { class:"r", text:kg(e.grams) }),
      el("td", { text:e.remarks || "—" })
    ]));
  });

  doPrint(el("div", { class:"slip" }, [
    el("h2", { text: (SUNSHINE_CONFIG.businessName || "SUNSHINE FABRICS") }),
    el("div", { class:"sub", text:"Outward Stock Slip" }),
    el("div", { class:"meta" }, [
      el("span", { text:"Slip No.: " + (first.slipNo == null ? "—" : first.slipNo) }),
      el("span", { text:"Date: " + dmy(first.date) })
    ]),
    el("div", { class:"meta" }, [el("span", { text:"Customer: " + (first.party || "—") })]),
    el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", { text:"No." }), el("th", { text:"Quality" }), el("th", { text:"Colour" }),
        el("th", { class:"r", text:"Qty (KG)" }), el("th", { text:"Remarks" })
      ])]),
      tb
    ]),
    el("div", { class:"total", text:"Final Total: " + kg(totalG) + " KG" }),
    first.forced ? el("div", { class:"hint", text:"Issued against short stock (forced)." }) : null,
    el("div", { class:"sign" }, [
      el("span", { text:"Prepared by" }), el("span", { text:"Received by" })
    ])
  ]));
}

function printStock(){
  var rows = Store.stockRows();
  var tb = el("tbody");
  rows.forEach(function(r){
    tb.appendChild(el("tr", {}, [
      el("td", { text:r.quality }), el("td", { text:r.colour }),
      el("td", { class:"r", text:kg(r.in) }), el("td", { class:"r", text:kg(r.out) }),
      el("td", { class:"r", text:kg(r.bal) })
    ]));
  });
  var tot = rows.reduce(function(s, r){ return s + r.bal; }, 0);

  doPrint(el("div", { class:"slip" }, [
    el("h2", { text:(SUNSHINE_CONFIG.businessName || "SUNSHINE FABRICS") }),
    el("div", { class:"sub", text:"Current Stock as on " + dmy(todayISO()) }),
    el("table", {}, [
      el("thead", {}, [el("tr", {}, [
        el("th", { text:"Quality" }), el("th", { text:"Colour" }),
        el("th", { class:"r", text:"Received" }), el("th", { class:"r", text:"Issued" }), el("th", { class:"r", text:"Balance" })
      ])]),
      tb
    ]),
    el("div", { class:"total", text:"Total Balance: " + kg(tot) + " KG" })
  ]));
}

/* Printing happens inside this page, so a blocked pop-up cannot stop it. */
function doPrint(node){
  var area = $("#printArea");
  area.textContent = "";
  area.appendChild(node);
  window.print();
}

/* ================= lock =================
   A deterrent for a shared counter, not security. The password is
   kept as a hash so it is not sitting in the page as plain text, but
   anyone who can open the files can still reach the data.          */
function hashPw(pw){
  var salt = "sunshine-fabrics";
  if(global.crypto && crypto.subtle && global.isSecureContext){
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw)).then(function(buf){
      return "sha256:" + Array.prototype.map.call(new Uint8Array(buf), function(b){
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }
  var h = 0x811c9dc5, s = salt + pw, i;   // file:// has no crypto.subtle
  for(i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return Promise.resolve("fnv:" + h.toString(16));
}

function tryUnlock(ev){
  ev.preventDefault();
  hashPw($("#lockPw").value).then(function(got){
    if(got === Store.db().lock){
      try{ sessionStorage.setItem("sunshineFabrics.open", "1"); }catch(e){}
      openApp();
    }else{
      $("#lockMsg").textContent = "Wrong password."; $("#lockMsg").hidden = false;
      $("#lockPw").value = ""; $("#lockPw").focus();
    }
  });
}

function setPassword(){
  var a = el("input", { type:"password", autocomplete:"new-password" });
  var b = el("input", { type:"password", autocomplete:"new-password" });
  var err = el("div", { class:"hint hint-bad", hidden:"hidden" });
  openModal([
    el("div", { class:"panel-head" }, [el("h2", { text:"Set password" })]),
    el("div", { class:"panel-body" }, [
      el("label", { text:"New password" }), a,
      el("div", { style:"height:10px" }),
      el("label", { text:"Confirm" }), b,
      err,
      el("div", { class:"btn-row", style:"margin-top:14px" }, [
        el("button", { class:"btn-primary", type:"button", text:"Save", onclick:function(){
          if(a.value.length < 4){ err.textContent = "Use at least 4 characters."; err.hidden = false; return; }
          if(a.value !== b.value){ err.textContent = "The two entries do not match."; err.hidden = false; return; }
          hashPw(a.value).then(function(h){
            Store.setLock(h); closeModal(); renderPwState(); toast("Password set");
          });
        }}),
        el("button", { class:"btn", type:"button", text:"Cancel", onclick:closeModal })
      ])
    ])
  ]);
  a.focus();
}

function renderPwState(){
  $("#pwState").textContent = Store.db().lock
    ? "A password is set. It is asked for once per browser session."
    : "No password set — the register opens straight away.";
}

/* ================= views ================= */
function showView(name){
  $$(".view").forEach(function(v){ v.hidden = (v.id !== "view-" + name); });
  $$(".tabs button").forEach(function(b){ b.setAttribute("aria-selected", String(b.dataset.view === name)); });
  if(name === "stock")   renderStock();
  if(name === "reports") renderReports();
  if(name === "history") renderHistory();
  if(name === "setup"){ renderQualities(); renderSlipPanel(); renderBackupInfo(); renderPwState(); renderDrivePanel(); }
  if(name === "outward" && !$("#outLines .line")) addLine();
}

function refreshAll(){
  renderHeader();
  renderSync();
  refreshDatalists();
  fillQualitySelect($("#inQuality"), true);
  $$("#outLines .lineQ").forEach(function(s){ fillQualitySelect(s, true); });
  $("#outSlipNo").textContent = Store.db().nextSlip;
  renderRecentIn();
  if(!$("#view-stock").hidden)   renderStock();
  if(!$("#view-reports").hidden) renderReports();
  if(!$("#view-history").hidden) renderHistory();
  if(!$("#view-setup").hidden){ renderQualities(); renderSlipPanel(); renderBackupInfo(); renderPwState(); renderDrivePanel(); }
}

function openApp(){
  $("#lock").hidden = true;
  $("#app").hidden = false;
  if(!Store.storageOK()){
    var w = $("#storageWarn");
    w.textContent = Store.storageMessage();
    w.hidden = false;
  }
  refreshAll();
}

/* ================= start ================= */
function init(){
  Store.load();

  var name = (global.SUNSHINE_CONFIG && SUNSHINE_CONFIG.businessName) || "SUNSHINE FABRICS";
  $$(".brand-name").forEach(function(n){ n.textContent = name; });
  document.title = name + " — Stock Register";

  $("#inDate").value = todayISO();
  $("#outDate").value = todayISO();
  fillQualitySelect($("#inQuality"));
  addLine();

  $$(".tabs button").forEach(function(b){
    b.addEventListener("click", function(){ showView(b.dataset.view); });
  });

  $("#inForm").addEventListener("submit", submitInward);
  $("#inForm").addEventListener("reset", function(){
    setTimeout(function(){
      $("#inDate").value = todayISO();
      $("#inErr").hidden = true;
      $("#inColourHint").textContent = "";
    }, 0);
  });
  $("#inColour").addEventListener("input", colourFeedback);
  $("#inQuality").addEventListener("change", colourFeedback);

  $("#outForm").addEventListener("submit", submitOutward);
  $("#addLine").addEventListener("click", function(){ addLine(); });

  $("#stockSearch").addEventListener("input", renderStock);
  $("#printStock").addEventListener("click", printStock);

  // reports: start on the current month
  var m = Store.monthRange(0);
  $("#repFrom").value = m.from;
  $("#repTo").value   = m.to;
  $$("#view-reports [data-period]").forEach(function(b){
    b.addEventListener("click", function(){
      var r = b.dataset.period === "last" ? Store.monthRange(-1)
            : b.dataset.period === "year" ? Store.yearRange()
            : Store.monthRange(0);
      setPeriod(r.from, r.to);
    });
  });
  $("#repFrom").addEventListener("input", renderReports);
  $("#repTo").addEventListener("input", renderReports);
  $("#printReport").addEventListener("click", printReport);
  $("#reportCsv").addEventListener("click", reportCsv);

  ["hFrom","hTo","hType","hSearch","hVoid"].forEach(function(id){
    $("#" + id).addEventListener("input", renderHistory);
  });
  $("#exportCsv").addEventListener("click", exportCsv);

  $("#addQuality").addEventListener("click", function(){
    var res = Store.addQuality($("#newQuality").value);
    if(!res.ok){ if(res.msg) alert(res.msg); return; }
    $("#newQuality").value = "";
    toast("Quality added");
  });
  $("#newQuality").addEventListener("keydown", function(e){
    if(e.key === "Enter"){ e.preventDefault(); $("#addQuality").click(); }
  });

  $("#slipReset").addEventListener("click", doSlipReset);
  $("#slipStart").addEventListener("input", renderSlipPanel);

  $("#backupBtn").addEventListener("click", backup);
  $("#restoreBtn").addEventListener("click", function(){ $("#restoreFile").click(); });
  $("#restoreFile").addEventListener("change", function(e){
    if(e.target.files[0]) restore(e.target.files[0]);
    e.target.value = "";
  });
  $("#setPw").addEventListener("click", setPassword);
  $("#clearPw").addEventListener("click", function(){
    if(!Store.db().lock){ alert("No password is set."); return; }
    if(confirm("Remove the password? The register will open without asking.")){
      Store.setLock(null); renderPwState(); toast("Password removed");
    }
  });
  $("#driveConnect").addEventListener("click", function(){ Drive.connect(); });
  $("#driveSync").addEventListener("click", function(){ Drive.sync(true, false); });
  $("#driveRefresh").addEventListener("click", function(){ Drive.sync(true, true); });
  $("#disconnectDrive").addEventListener("click", function(){
    if(confirm("Disconnect Google Drive?\n\nThe register stays on this device.")) Drive.disconnect();
  });

  $("#lockForm").addEventListener("submit", tryUnlock);
  $("#modal").addEventListener("click", function(e){ if(e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && !$("#modal").hidden) closeModal();
  });

  // every register change redraws the screen and nudges Drive
  Store.onChange(function(){ refreshAll(); Drive.scheduleSync(); });
  Drive.onState(renderSync);
  Drive.init();

  // Nothing is drawn until the lock is cleared, so the register is not
  // sitting in the page behind an overlay.
  var opened = false;
  try{ opened = sessionStorage.getItem("sunshineFabrics.open") === "1"; }catch(e){}
  if(Store.db().lock && !opened){
    $("#lock").hidden = false;
    $("#lockPw").focus();
  }else{
    openApp();
  }
}

if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

/* exposed for the browser console and for tests */
global.UI = { showView:showView, refreshAll:refreshAll, printSlip:printSlip,
              historyRows:historyRows, csvCell:csvCell, renderDrivePanel:renderDrivePanel,
              renderReports:renderReports, setPeriod:setPeriod, printReport:printReport };

})(window);
