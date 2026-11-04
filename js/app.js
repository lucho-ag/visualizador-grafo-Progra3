// Interfaz del visualizador Misión UADA
(function () {
  const U = window.UADA;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (s) => document.querySelector(s);
  const svg = $("#graph"), panel = $("#panel"), statsEl = $("#stats"), hud = $("#hud");

  const S = {
    mapKey: "no_dirigido", g: null, diag: null, tab: "explorar", sel: null,
    modos: new Set(["C", "S", "P"]), pesos: true, coords: false,
    ruta: [], // pasos {origen,destino,modo,t,bat}
    bb: null, bbSel: 0, anim: null,
    custom: null,
  };

  const W = 960, H = 720, R = 12;
  const px = (l) => 70 + l.x * 7;
  const py = (l) => 60 + (80 - l.y) * 4.5;
  const fmt = (n, d = 1) => n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const colorNodo = (l, g) =>
    l.prohibido ? "var(--prohib)" : l.nombre === g.inicio ? "var(--inicio)" : l.obligatorio ? "var(--oblig)"
      : g.ventanas[l.nombre] ? "var(--ventana)" : l.aula ? "var(--aula)" : "#5b6b82";

  function cargar(key, texto, dirigido) {
    S.mapKey = key;
    const raw = texto ?? window.MAPAS_RAW[key];
    const dir = dirigido ?? (key === "dirigido" || /dirigid/i.test(raw.split("\n")[0]));
    S.g = U.parse(raw, dir);
    S.diag = U.diagnostico(S.g);
    S.sel = null; S.ruta = []; S.bb = null; stopAnim();
    render();
  }

  // ---------- Grafo ----------
  function drawGraph() {
    const g = S.g;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    for (const [id, c] of [["arr", "#4a5870"], ["arrHl", "#7c9cff"], ["arrC", "#7c9cff"], ["arrS", "#ff8a5c"], ["arrP", "#3ddc97"]]) {
      const m = el("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 11, markerHeight: 11, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,0 L10,5 L0,10 z", fill: c }, m);
    }
    const gE = el("g", {}, svg), gR = el("g", {}, svg), gN = el("g", {}, svg);
    S.layer = { gR };

    // Resaltar aristas de la ruta/selección
    const hlSet = new Set();
    if (S.sel) for (const e of g.aristas) if (e.a === S.sel || e.b === S.sel) hlSet.add(e);

    const pares = new Set(g.aristas.map((e) => e.a + "|" + e.b));
    for (const e of g.aristas) {
      const A = g.lugares[e.a], B = g.lugares[e.b];
      const visible = e.modos.some((m) => S.modos.has(m));
      const [x1, y1, x2, y2] = [px(A), py(A), px(B), py(B)];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      const curva = g.dirigido && pares.has(e.b + "|" + e.a) ? 18 : 0;
      const sx = x1 + ux * R, sy = y1 + uy * R, ex = x2 - ux * (R + 3), ey = y2 - uy * (R + 3);
      const mx = (sx + ex) / 2 - uy * curva, my = (sy + ey) / 2 + ux * curva;
      const forb = A.prohibido || B.prohibido;
      const cls = ["edge", visible ? "" : "dim", hlSet.has(e) ? "hl" : "", forb ? "forb" : ""].join(" ");
      const p = el("path", { d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, class: cls }, gE);
      if (g.dirigido) p.setAttribute("marker-end", hlSet.has(e) ? "url(#arrHl)" : "url(#arr)");
      el("title", {}, p).textContent = `${e.a} ${g.dirigido ? "→" : "↔"} ${e.b} · ${e.t}s · modos ${e.modos.join("")}`;
      if (S.pesos && visible) {
        const t = el("text", { x: mx - uy * 8, y: my + ux * 8 + 3, class: "edge-label", "text-anchor": "middle" }, gE);
        t.textContent = `${e.t}s·${e.modos.join("")}`;
      }
    }

    const cands = S.tab === "ruta" ? candidatos().map((c) => c.arco.to) : [];
    const enRuta = new Set(S.tab === "ruta" ? [g.inicio, ...S.ruta.map((p) => p.destino)] : []);
    for (const n in g.lugares) {
      const l = g.lugares[n];
      const cls = ["node", S.sel === n ? "sel" : "", cands.includes(n) ? "cand" : "",
        S.tab === "explorar" && S.sel && S.sel !== n && !vecinos(S.sel).has(n) ? "dim" : ""].join(" ");
      const gn = el("g", { class: cls, transform: `translate(${px(l)},${py(l)})`, tabindex: 0 }, gN);
      const c = colorNodo(l, g);
      if (l.obligatorio) el("circle", { r: R + 6, class: "halo", stroke: c }, gn);
      if (enRuta.has(n)) el("circle", { r: R + 4, class: "halo", stroke: "#fff" }, gn);
      el("circle", { r: R, class: "core", fill: "var(--bg2)", stroke: c }, gn);
      el("circle", { r: 5, fill: c }, gn);
      if (l.prohibido) el("path", { d: "M-6,-6 L6,6 M6,-6 L-6,6", stroke: "var(--prohib)", "stroke-width": 2 }, gn);
      const below = l.y <= -40;
      const t = el("text", { y: below ? R + 16 : -R - 8, "text-anchor": "middle" }, gn);
      t.textContent = n;
      if (S.coords) { const tc = el("text", { y: below ? R + 28 : -R - 20, class: "coord", "text-anchor": "middle" }, gn); tc.textContent = `(${l.x}, ${l.y})`; }
      gn.addEventListener("click", () => onNodeClick(n));
      gn.addEventListener("keydown", (ev) => { if (ev.key === "Enter") onNodeClick(n); });
    }

    // Ruta activa
    if (S.tab === "ruta" && S.ruta.length) drawRoute(S.ruta);
    if (S.tab === "bb" && S.bb) {
      const r = S.bb.rutas[S.bbSel];
      if (r) drawRoute(r.pasos); else if (S.bb.conting) drawRoute(S.bb.conting.pasos);
    }
  }

  function drawRoute(pasos) {
    const g = S.g, gR = S.layer.gR;
    pasos.forEach((p, i) => {
      const A = g.lugares[p.origen], B = g.lugares[p.destino];
      const x1 = px(A), y1 = py(A), x2 = px(B), y2 = py(B);
      const L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L;
      const col = `var(--${p.modo})`;
      const path = el("path", { d: `M${x1 + ux * R},${y1 + uy * R} L${x2 - ux * (R + 4)},${y2 - uy * (R + 4)}`, class: "route-path", stroke: col, color: col, "marker-end": `url(#arr${p.modo})` }, gR);
      el("title", {}, path).textContent = `${i + 1}. ${p.origen} → ${p.destino} · ${U.MODOS[p.modo].nombre}`;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      el("circle", { cx: mx, cy: my, r: 9, fill: col }, gR);
      const t = el("text", { x: mx, y: my + 3.5, "text-anchor": "middle", class: "step-num" }, gR);
      t.textContent = i + 1;
    });
  }

  const vecinos = (n) => {
    const s = new Set();
    for (const e of S.g.aristas) { if (e.a === n) s.add(e.b); if (e.b === n) s.add(e.a); }
    return s;
  };

  function onNodeClick(n) {
    if (S.tab === "ruta") {
      const c = candidatos().find((c) => c.arco.to === n);
      if (c) {
        const m = c.modos.find((x) => x.r.ok) || c.modos[0];
        if (m) agregarPaso(c.arco, m.m);
        return;
      }
    }
    S.sel = S.sel === n ? null : n;
    if (S.tab !== "explorar") S.tab = "explorar";
    render();
  }

  // ---------- Armar ruta manual ----------
  function estadoRuta() {
    const g = S.g;
    const last = S.ruta[S.ruta.length - 1];
    return {
      nodo: last ? last.destino : g.inicio,
      t: last ? last.t : 0, bat: last ? last.bat : 100,
      visit: new Set([g.inicio, ...S.ruta.map((p) => p.destino)]),
      fin: last && last.destino === g.inicio,
    };
  }
  function candidatos() {
    const st = estadoRuta();
    if (st.fin) return [];
    return S.g.ady[st.nodo].map((arco) => ({
      arco, modos: ["C", "S", "P"].filter((m) => arco.modos.includes(m)).map((m) => ({ m, r: U.tramo(S.g, st, arco.to, arco, m) })),
    }));
  }
  function agregarPaso(arco, m) {
    const st = estadoRuta();
    const r = U.tramo(S.g, st, arco.to, arco, m);
    S.ruta.push({ origen: st.nodo, destino: arco.to, modo: m, t: r.t ?? st.t, bat: r.bat ?? st.bat, ok: r.ok, motivo: r.motivo });
    render();
  }

  // ---------- Paneles ----------
  function panelExplorar() {
    const g = S.g, d = S.diag;
    const nL = Object.keys(g.lugares).length;
    let h = `<h2>${g.dirigido ? "Grafo dirigido" : "Grafo no dirigido"}</h2>
      <p>${nL} lugares, ${g.aristas.length} conexiones ${g.dirigido ? "dirigidas (a → b)" : "en ambos sentidos"}. Inicio y fin en <b>${g.inicio}</b>. Tocá un nodo para ver su detalle.</p>`;
    h += d.avisos.length
      ? d.avisos.map((a) => `<div class="warn">⚠ ${a}</div>`).join("")
      : `<div class="ok">✓ El inicio tiene entradas y todos los obligatorios son alcanzables y tienen salida.</div>`;

    if (S.sel) {
      const l = g.lugares[S.sel];
      const v = g.ventanas[S.sel];
      h += `<h3>Lugar seleccionado</h3><h2>${l.nombre}</h2><div class="chips">
        ${l.obligatorio ? '<span class="chip o">Obligatorio</span>' : ""}
        ${l.prohibido ? '<span class="chip x">Prohibido</span>' : ""}
        ${l.aula ? `<span class="chip a">Aula ${l.aula} · recarga ${fmt(U.recarga(l))}</span>` : ""}
        ${v ? `<span class="chip v">Cerrado ${v.desde}–${v.hasta} s</span>` : ""}
        <span class="chip">(${l.x}, ${l.y})</span>
        <span class="chip">d(348) = ${fmt(U.dist(l, g.lugares[g.inicio]), 2)}</span></div>`;
      const sal = g.ady[S.sel], ent = [];
      for (const n in g.ady) for (const a of g.ady[n]) if (a.to === S.sel) ent.push({ from: n, ...a });
      const fila = (n, a) => `<tr><td>${n}</td><td>${a.t}s</td><td>${a.modos.map((m) => `<span class="m ${m}">${m}</span>`).join(" ")}</td><td>${["C", "S", "P"].filter((m) => a.modos.includes(m)).map((m) => fmt(U.MODOS[m].t(a.t), 0)).join(" / ")}</td></tr>`;
      h += `<h3>${g.dirigido ? "Salidas" : "Conexiones"} (${sal.length})</h3><table><tr><th>Destino</th><th>Base</th><th>Modos</th><th>Tiempos</th></tr>${sal.map((a) => fila(a.to, a)).join("") || '<tr><td colspan="4" class="bad">Sin salidas</td></tr>'}</table>`;
      if (g.dirigido) h += `<h3>Entradas (${ent.length})</h3><table><tr><th>Origen</th><th>Base</th><th>Modos</th><th>Tiempos</th></tr>${ent.map((a) => fila(a.from, a)).join("") || '<tr><td colspan="4" class="bad">Sin entradas</td></tr>'}</table>`;
    } else {
      h += `<h3>Obligatorios</h3><div class="chips">${U.obligatorios(g).map((o) => `<span class="chip o">${o}</span>`).join("")}</div>`;
      h += `<h3>Ventanas (cerrado)</h3><table><tr><th>Lugar</th><th>Desde</th><th>Hasta</th></tr>${Object.entries(g.ventanas).map(([k, v]) => `<tr><td>${k}</td><td>${v.desde}s</td><td>${v.hasta}s</td></tr>`).join("")}</table>`;
      h += `<h3>Recargas por aula</h3><table><tr><th>Aula</th><th>Dígitos</th><th>Recarga</th></tr>${Object.values(g.lugares).filter((l) => l.aula).map((l) => `<tr><td>${l.nombre}</td><td>${String(l.aula).split("").join("+")}</td><td>${l.nombre === g.inicio ? "— (inicio)" : fmt(U.recarga(l))}</td></tr>`).join("")}</table>`;
      h += `<h3>Grado por lugar</h3><table><tr><th>Lugar</th><th>${g.dirigido ? "Entra" : "Grado"}</th>${g.dirigido ? "<th>Sale</th>" : ""}</tr>${Object.keys(g.lugares).map((n) => `<tr><td>${n}</td><td class="${d.inn[n] === 0 ? "bad" : ""}">${d.inn[n]}</td>${g.dirigido ? `<td class="${d.out[n] === 0 ? "bad" : ""}">${d.out[n]}</td>` : ""}</tr>`).join("")}</table>`;
    }
    return h;
  }

  function tablaPasos(pasos, conMotivo) {
    return `<table><tr><th>#</th><th>Origen → Destino</th><th>Modo</th><th>Bat.</th><th>T acum.</th></tr>${pasos.map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.origen} → ${p.destino}</td><td><span class="m ${p.modo}">${U.MODOS[p.modo].nombre}</span></td><td class="${conMotivo && !p.ok && p.motivo === "batería" ? "bad" : ""}">${fmt(p.bat, 2)}</td><td class="${conMotivo && !p.ok ? "bad" : ""}">${fmt(p.t)}s</td></tr>${conMotivo && !p.ok ? `<tr><td></td><td colspan="4" class="bad">✗ ${p.motivo}</td></tr>` : ""}`).join("")}</table>`;
  }

  function panelRuta() {
    const g = S.g, st = estadoRuta();
    const invalido = S.ruta.find((p) => !p.ok);
    let h = `<h2>Armar ruta a mano</h2><p>Elegí el próximo tramo y su modo. Se aplican todas las reglas: batería, ventanas, lugares repetidos y zona prohibida. También podés tocar un nodo resaltado en el grafo.</p>`;
    h += `<div class="row"><button class="btn ghost" id="undo" ${S.ruta.length ? "" : "disabled"}>↶ Deshacer</button><button class="btn ghost" id="reset" ${S.ruta.length ? "" : "disabled"}>Reiniciar</button></div>`;
    if (invalido) h += `<div class="warn">La ruta es inválida desde el paso ${S.ruta.indexOf(invalido) + 1}: ${invalido.motivo}.</div>`;
    else if (st.fin) h += `<div class="ok">✓ Ruta completa y válida: ${fmt(st.t)} s, batería final ${fmt(st.bat, 2)}.</div>`;
    if (!st.fin && !invalido) {
      const cs = candidatos();
      h += `<h3>Desde ${st.nodo}</h3>`;
      h += cs.length ? cs.map((c, i) => `<div class="opt"><div>${c.arco.to}<br><small>${c.arco.t}s base</small></div><div class="modes">${c.modos.map((x) =>
        `<button data-i="${i}" data-m="${x.m}" title="${x.r.ok ? `llega t=${fmt(x.r.t)}s, bat ${fmt(x.r.bat, 2)}` : "✗ " + x.r.motivo}" ${x.r.ok ? "" : "style='text-decoration:line-through;opacity:.45'"}>${x.m}</button>`).join("")}</div></div>`).join("")
        : `<div class="warn">No hay salidas desde ${st.nodo}. Uada quedó atrapado.</div>`;
      h += `<p style="font-size:12px">Los modos tachados violan alguna regla; igual se pueden elegir para ver el error.</p>`;
    }
    if (S.ruta.length) h += `<h3>Recorrido</h3>${tablaPasos(S.ruta, true)}`;
    const faltan = U.obligatorios(g).filter((o) => !st.visit.has(o));
    h += `<h3>Obligatorios</h3><div class="chips">${U.obligatorios(g).map((o) => `<span class="chip ${faltan.includes(o) ? "" : "o"}">${faltan.includes(o) ? "○" : "●"} ${o}</span>`).join("")}</div>`;
    return h;
  }

  function panelBB() {
    let h = `<h2>Branch &amp; Bound</h2><p>Explora todos los caminos simples desde ${S.g.inicio} probando cada modo por tramo, y poda cuando el tiempo más una cota optimista de vuelta no mejora la 3.ª mejor ruta. Devuelve las 3 mejores secuencias distintas o, si no hay ninguna, la ruta de contingencia.</p>
      <div class="row"><button class="btn" id="run">▶ Ejecutar</button>${S.bb ? `<button class="btn ghost" id="play">Animar recorrido</button>` : ""}</div>`;
    if (!S.bb) return h;
    const b = S.bb;
    if (b.rutas.length) {
      h += `<h3>Mejores rutas</h3>` + b.rutas.map((r, i) => `<div class="route-card ${i === S.bbSel ? "on" : ""}" data-r="${i}"><div class="t">#${i + 1} · ${fmt(r.t)} s <small style="color:var(--muted);font-size:12px">bat. final ${fmt(r.bat, 2)}</small></div><div class="seq">${r.key.split(">").join(" → ")}</div></div>`).join("");
      h += `<h3>Detalle ruta #${S.bbSel + 1}</h3>${tablaPasos(b.rutas[S.bbSel].pasos)}`;
    } else {
      h += `<div class="warn">No existe ninguna ruta válida. Se muestra la contingencia: el punto de máximo avance más cercano a ${S.g.inicio}.</div>`;
      if (b.conting) h += `<p>Distancia recta: <b>${fmt(b.conting.d, 2)}</b> · obligatorios visitados: <b>${b.conting.vis}</b> · tiempo: <b>${fmt(b.conting.t)} s</b></p>${tablaPasos(b.conting.pasos)}`;
    }
    const podas = Object.entries(b.stats.podas).sort((a, c) => c[1] - a[1]);
    const max = Math.max(1, ...podas.map((p) => p[1]));
    h += `<h3>Motivos de descarte</h3><div class="bars">${podas.map(([k, v]) => `<div class="b"><span>${k}</span><div style="width:${(v / max) * 100}%"></div><span>${v.toLocaleString("es-AR")}</span></div>`).join("")}</div>`;
    h += `<h3>Log de exploración (primeros ${b.log.length})</h3><div class="log">${b.log.map((x) => `<div class="${x.tipo}">${x.tipo === "poda" ? "✗ " + x.motivo + " · " : x.tipo === "sol" ? "★ " : "✓ "}${x.desc}</div>`).join("")}</div>`;
    return h;
  }

  function renderStats() {
    const g = S.g;
    let items;
    if (S.tab === "bb" && S.bb) {
      const b = S.bb;
      items = [[b.stats.nodos.toLocaleString("es-AR"), "nodos analizados"], [b.stats.soluciones, "rutas completas halladas"],
        [Object.values(b.stats.podas).reduce((a, c) => a + c, 0).toLocaleString("es-AR"), "ramas descartadas"], [fmt(b.ms, 0) + " ms", "tiempo de cómputo"],
        [b.rutas[0] ? fmt(b.rutas[0].t) + " s" : "—", "mejor tiempo"]];
    } else {
      items = [[Object.keys(g.lugares).length, "lugares"], [g.aristas.length, "conexiones"], [U.obligatorios(g).length, "obligatorios"],
        [Object.keys(g.ventanas).length, "ventanas"], [Object.values(g.lugares).filter((l) => l.aula && l.nombre !== g.inicio).length, "aulas que recargan"]];
    }
    statsEl.innerHTML = items.map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join("");
  }

  function renderHud() {
    if (S.tab !== "ruta" || !S.ruta.length) { if (!S.anim) hud.hidden = true; return; }
    const st = estadoRuta();
    hudShow(st.nodo, st.t, st.bat);
  }
  function hudShow(nodo, t, bat) {
    hud.hidden = false;
    hud.innerHTML = `📍 ${nodo}<br>⏱ ${fmt(t)} s<br>🔋 ${fmt(Math.max(0, bat), 2)}<div class="bar"><i style="width:${Math.max(0, Math.min(100, bat))}%;background:${bat < 20 ? "var(--prohib)" : "var(--aula)"}"></i></div>`;
  }

  function bindPanel() {
    panel.querySelectorAll(".opt .modes button").forEach((b) => b.addEventListener("click", () => {
      const c = candidatos()[+b.dataset.i];
      agregarPaso(c.arco, b.dataset.m);
    }));
    $("#undo")?.addEventListener("click", () => { S.ruta.pop(); render(); });
    $("#reset")?.addEventListener("click", () => { S.ruta = []; render(); });
    $("#run")?.addEventListener("click", () => {
      const btn = $("#run"); btn.disabled = true; btn.textContent = "Calculando…";
      setTimeout(() => { S.bb = U.resolver(S.g); S.bbSel = 0; render(); }, 30);
    });
    $("#play")?.addEventListener("click", animar);
    panel.querySelectorAll(".route-card").forEach((c) => c.addEventListener("click", () => { S.bbSel = +c.dataset.r; stopAnim(); render(); }));
  }

  // ---------- Animación ----------
  function stopAnim() { if (S.anim) cancelAnimationFrame(S.anim); S.anim = null; hud.hidden = true; }
  function animar() {
    stopAnim();
    const b = S.bb; const r = b.rutas[S.bbSel] || b.conting; if (!r) return;
    const g = S.g, pasos = r.pasos;
    const robot = el("circle", { r: 7, class: "robot" }, S.layer.gR);
    const durPaso = 700; let t0 = null;
    const frame = (ts) => {
      if (!t0) t0 = ts;
      const k = (ts - t0) / durPaso, i = Math.floor(k);
      if (i >= pasos.length) { const p = pasos[pasos.length - 1]; hudShow(p.destino, p.t, p.bat); S.anim = null; return; }
      const p = pasos[i], f = k - i, A = g.lugares[p.origen], B = g.lugares[p.destino];
      robot.setAttribute("cx", px(A) + (px(B) - px(A)) * f);
      robot.setAttribute("cy", py(A) + (py(B) - py(A)) * f);
      const prev = pasos[i - 1] || { t: 0, bat: 100 };
      hudShow(`${p.origen} → ${p.destino}`, prev.t + (p.t - prev.t) * f, prev.bat + (p.bat - prev.bat) * f);
      S.anim = requestAnimationFrame(frame);
    };
    S.anim = requestAnimationFrame(frame);
  }

  function render() {
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    document.querySelectorAll(".map-switch button").forEach((b) => b.classList.toggle("on", b.dataset.map === S.mapKey));
    drawGraph();
    panel.innerHTML = S.tab === "explorar" ? panelExplorar() : S.tab === "ruta" ? panelRuta() : panelBB();
    bindPanel(); renderStats(); renderHud();
  }

  // ---------- Controles globales ----------
  document.querySelectorAll(".map-switch button").forEach((b) => b.addEventListener("click", () => cargar(b.dataset.map)));
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; stopAnim(); render(); }));
  $("#optPesos").addEventListener("change", (e) => { S.pesos = e.target.checked; render(); });
  $("#optCoords").addEventListener("change", (e) => { S.coords = e.target.checked; render(); });
  document.querySelectorAll("#modeFilter button").forEach((b) => b.addEventListener("click", () => {
    const m = b.dataset.m; S.modos.has(m) ? S.modos.delete(m) : S.modos.add(m);
    b.classList.toggle("on", S.modos.has(m)); render();
  }));
  $("#file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const txt = await f.text();
    const dir = confirm(`¿Interpretar "${f.name}" como grafo dirigido?\nAceptar = dirigido · Cancelar = no dirigido`);
    cargar("custom", txt, dir);
  });

  cargar("no_dirigido");
})();
