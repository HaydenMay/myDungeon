// =====================================================================
// Wiring: screens, settings, buttons.
// =====================================================================
(() => {
  const $ = (id) => document.getElementById(id);
  const G = MD.Game, UI = MD.UI, DM = MD.DM, S = MD.Settings;

  UI.applyTheme();
  DM.setHandlers(() => UI.renderAll(), (msg) => UI.toast(msg));

  // ---------- screens ----------
  function showSetup() {
    $("setup").classList.remove("hidden");
    $("game").classList.add("hidden");
    $("mobileTabs").classList.add("hidden-tabs");
    $("keyWarning").classList.toggle("hidden", S.hasKey());
    updatePreview();
  }
  function showGame() {
    $("setup").classList.add("hidden");
    $("game").classList.remove("hidden");
    $("mobileTabs").classList.remove("hidden-tabs");
    UI.renderAll();
  }

  // ---------- setup screen ----------
  const opt = (v, label = v) => `<option value="${v}">${label}</option>`;
  $("cRace").innerHTML = Object.keys(MD.DATA.races).map((r) => opt(r)).join("");
  $("cClass").innerHTML = Object.keys(MD.DATA.classes).map((c) => opt(c)).join("");
  $("premiseChips").innerHTML = MD.DATA.premises.map((p) => `<button type="button" data-premise="${UI.esc(p)}">${UI.esc(p.length > 48 ? p.slice(0, 46) + "…" : p)}</button>`).join("");
  $("premiseChips").addEventListener("click", (e) => { const p = e.target.dataset.premise; if (p) $("cPremise").value = p; });

  function updatePreview() {
    const R = MD.DATA.races[$("cRace").value], K = MD.DATA.classes[$("cClass").value];
    const scores = MD.DATA.abilities.map((a) => `${a} ${(K.array[a] || 10) + (R.bonus[a] || 0)}`).join(" · ");
    $("classPreview").innerHTML = `<b>${$("cRace").value} ${$("cClass").value}</b> — d${K.hitDie} hit die, ${K.gold} gold<br>
      <span class="muted">${scores}</span><br>${UI.esc(K.feature)}<br><span class="muted">${UI.esc(R.trait)}</span><br>
      <span class="muted">Gear: ${K.gear.map((g) => g.name).join(", ")}</span>`;
  }
  $("cRace").addEventListener("change", updatePreview);
  $("cClass").addEventListener("change", updatePreview);

  $("startBtn").addEventListener("click", () => {
    if (!S.hasKey()) { openSettings(); UI.toast("Add an API key first (or choose the offline test DM)."); return; }
    G.newGame({ name: $("cName").value.trim(), race: $("cRace").value, cls: $("cClass").value, premise: $("cPremise").value.trim() });
    showGame();
    DM.startCampaign(G.state.premise);
  });

  // ---------- action input ----------
  $("actionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("actionInput").value.trim();
    if (!text || DM.busy || G.state.pending) return;
    $("actionInput").value = "";
    DM.playerAction(text);
  });
  $("actionInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("actionForm").requestSubmit(); }
  });
  $("actionInput").addEventListener("input", (e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; });

  // ---------- delegated game buttons ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t || !G.state) return;
    const d = t.dataset;
    if (d.suggest) { $("actionInput").value = d.suggest; $("actionInput").focus(); }
    else if (d.roll) DM.resolvePending(d.roll);
    else if (d.attack) DM.quickAttack(d.attack);
    else if (d.use) { const msgs = G.useItem(d.use); UI.renderAll(); if (G.state.enemies.length) DM.notify(msgs); }
    else if (d.equip) { G.toggleEquip(d.equip); UI.renderAll(); }
    else if (d.ability) { const msgs = G.useClassAbility(d.ability); UI.renderAll(); if (G.state.enemies.length) DM.notify(msgs); }
    else if (t.id === "deathSaveBtn") { const msgs = G.deathSave(); UI.renderAll(); DM.afterDeathSave(msgs); }
    else if (t.id === "restartBtn") { G.clear(); showSetup(); }
  });

  // ---------- mobile tabs ----------
  $("mobileTabs").addEventListener("click", (e) => {
    const p = e.target.dataset.panel; if (!p) return;
    document.querySelectorAll("#mobileTabs button").forEach((b) => b.classList.toggle("active", b.dataset.panel === p));
    document.querySelectorAll(".panel").forEach((el) => el.classList.toggle("active", el.id === "panel-" + p));
  });

  // ---------- settings ----------
  const N = MD.CONFIG.narrator;
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  $("sTone").innerHTML = Object.keys(N.tones).map((k) => opt(k, cap(k))).join("");
  $("sLength").innerHTML = Object.keys(N.lengths).map((k) => opt(k, cap(k))).join("");
  $("sDifficulty").innerHTML = Object.keys(N.difficulties).map((k) => opt(k, cap(k))).join("");

  function syncProviderFields() {
    document.querySelectorAll("[data-for]").forEach((el) => el.classList.toggle("hidden", el.dataset.for !== $("sProvider").value));
  }
  function openSettings() {
    const s = S.get();
    $("sProvider").value = s.provider;
    $("sOpenaiKey").value = s.openaiKey; $("sOpenaiModel").value = s.openaiModel; $("sOpenaiBase").value = s.openaiBaseUrl;
    $("sAnthropicKey").value = s.anthropicKey; $("sAnthropicModel").value = s.anthropicModel;
    $("sTone").value = s.tone; $("sLength").value = s.length; $("sDifficulty").value = s.difficulty;
    $("sShowDm").checked = s.showDmJournal;
    $("newGameBtn").classList.toggle("hidden", !G.state);
    $("exportBtn").classList.toggle("hidden", !G.state);
    syncProviderFields();
    $("settingsDlg").showModal();
  }
  $("sProvider").addEventListener("change", syncProviderFields);
  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsDlg").addEventListener("close", () => {
    S.set({
      provider: $("sProvider").value,
      openaiKey: $("sOpenaiKey").value.trim(), openaiModel: $("sOpenaiModel").value.trim() || MD.CONFIG.ai.openai.model,
      openaiBaseUrl: $("sOpenaiBase").value.trim() || MD.CONFIG.ai.openai.baseUrl,
      anthropicKey: $("sAnthropicKey").value.trim(), anthropicModel: $("sAnthropicModel").value.trim() || MD.CONFIG.ai.anthropic.model,
      tone: $("sTone").value, length: $("sLength").value, difficulty: $("sDifficulty").value,
      showDmJournal: $("sShowDm").checked,
    });
    $("keyWarning").classList.toggle("hidden", S.hasKey());
    UI.renderAll();
  });

  $("newGameBtn").addEventListener("click", () => {
    if (!confirm("Abandon this adventure and start a new one? (Export first if you want to keep it.)")) return;
    G.clear(); $("settingsDlg").close(); showSetup();
  });

  // ---------- import / export ----------
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([G.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `myDungeon-${(G.state.character.name || "save").replace(/\W+/g, "_")}-turn${G.state.turn}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  const pickImport = () => $("importFile").click();
  $("importBtn").addEventListener("click", pickImport);
  $("importBtn2").addEventListener("click", pickImport);
  $("importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { G.importJson(await f.text()); if ($("settingsDlg").open) $("settingsDlg").close(); showGame(); }
    catch (err) { UI.toast(err.message); }
    e.target.value = "";
  });

  // ---------- boot ----------
  if (G.load()) {
    G.state.pending = G.state.pending || null;
    showGame();
    // a campaign that never got its opening (e.g. error) — retry it
    if (!G.state.log.some((l) => l.role === "dm")) DM.startCampaign(G.state.premise);
  } else showSetup();
})();
