// Modelo del problema Misión UADA: parser, reglas y solver Branch & Bound.
(function () {
  const MODOS = {
    C: { nombre: "Caminando", t: (t) => t, bat: (t) => t / 60 },
    S: { nombre: "Saltando", t: (t) => t / 2, bat: (t) => (2.2 * t) / 60 },
    P: { nombre: "Patas para arriba", t: (t) => 2 * t, bat: (t) => (0.45 * t) / 60 },
  };

  function parse(texto, dirigido) {
    const lugares = {}, aristas = [], ventanas = {};
    let inicio = null;
    for (const raw of texto.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith("#")) continue;
      const p = l.split(";");
      if (p[0] === "LUGAR") {
        lugares[p[1]] = {
          nombre: p[1], aula: +p[2], x: +p[3], y: +p[4],
          obligatorio: p[5] === "1", prohibido: p[6] === "1",
        };
      } else if (p[0] === "ARISTA") {
        aristas.push({ a: p[1], b: p[2], t: +p[3], modos: p[4].split("") });
      } else if (p[0] === "VENTANA") {
        ventanas[p[1]] = { desde: +p[2], hasta: +p[3] };
      } else if (p[0] === "INICIO") inicio = p[1];
    }
    const ady = {};
    for (const n in lugares) ady[n] = [];
    for (const e of aristas) {
      ady[e.a].push({ to: e.b, t: e.t, modos: e.modos, e });
      if (!dirigido) ady[e.b].push({ to: e.a, t: e.t, modos: e.modos, e });
    }
    return { lugares, aristas, ventanas, inicio, ady, dirigido };
  }

  function recarga(l) {
    if (!l.aula) return 0;
    return String(l.aula).split("").reduce((s, d) => s + +d, 0) / 5;
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Aplica un tramo. Devuelve {ok, motivo, t, bat}
  function tramo(g, estado, destino, arco, modo) {
    const L = g.lugares[destino];
    if (L.prohibido) return { ok: false, motivo: "zona prohibida" };
    const esFin = destino === g.inicio;
    if (!esFin && estado.visit.has(destino)) return { ok: false, motivo: "lugar repetido" };
    if (!arco.modos.includes(modo)) return { ok: false, motivo: "modo no permitido" };
    const t = estado.t + MODOS[modo].t(arco.t);
    let bat = estado.bat - MODOS[modo].bat(arco.t);
    if (esFin ? bat < -1e-9 : bat <= 1e-9) return { ok: false, motivo: "batería", t, bat };
    const v = g.ventanas[destino];
    if (v && t >= v.desde && t <= v.hasta) return { ok: false, motivo: "ventana de tiempo", t, bat };
    if (esFin) {
      const faltan = obligatorios(g).filter((o) => !estado.visit.has(o));
      if (faltan.length) return { ok: false, motivo: "vuelve al 348 sin obligatorios", t, bat };
    }
    if (!esFin) bat = Math.min(100, bat + recarga(L));
    return { ok: true, t, bat, fin: esFin };
  }

  const obligatorios = (g) => Object.values(g.lugares).filter((l) => l.obligatorio).map((l) => l.nombre);

  // Branch & Bound en profundidad con cota: top-3 secuencias distintas.
  function resolver(g, opts = {}) {
    const LIM = opts.limiteNodos || 3000000, LOGMAX = opts.logMax || 400;
    const oblig = obligatorios(g);
    const t0 = performance.now();
    // Cota optimista para volver: mínimo tiempo saltando de cualquier arco que entre al inicio
    let minVuelta = Infinity;
    for (const n in g.ady) for (const a of g.ady[n]) if (a.to === g.inicio) {
      const best = Math.min(...a.modos.map((m) => MODOS[m].t(a.t)));
      minVuelta = Math.min(minVuelta, best);
    }
    const stats = { nodos: 0, podas: {}, soluciones: 0, cortado: false };
    const log = [];
    const mejores = new Map(); // clave secuencia -> ruta
    let cota = Infinity;
    let conting = null;
    const pasos = [];

    const actualizarCota = () => {
      const ts = [...mejores.values()].map((r) => r.t).sort((a, b) => a - b);
      cota = ts.length >= 3 ? ts[2] : Infinity;
    };
    const poda = (m, desc) => {
      stats.podas[m] = (stats.podas[m] || 0) + 1;
      if (log.length < LOGMAX) log.push({ tipo: "poda", motivo: m, desc });
    };

    function dfs(nodo, estado, prof) {
      if (stats.nodos >= LIM) { stats.cortado = true; return; }
      stats.nodos++;
      // contingencia
      const d = dist(g.lugares[nodo], g.lugares[g.inicio]);
      const vis = oblig.filter((o) => estado.visit.has(o)).length;
      if (nodo !== g.inicio || prof === 0) {
        if (!conting || d < conting.d - 1e-9 || (Math.abs(d - conting.d) < 1e-9 &&
            (vis > conting.vis || (vis === conting.vis && estado.t < conting.t)))) {
          if (prof > 0) conting = { d, vis, t: estado.t, pasos: pasos.slice() };
        }
      }
      for (const arco of g.ady[nodo]) {
        for (const m of ["S", "C", "P"]) {
          if (!arco.modos.includes(m)) continue;
          const desc = `${nodo} → ${arco.to} (${m})`;
          const r = tramo(g, estado, arco.to, arco, m);
          if (!r.ok) { poda(r.motivo, desc); continue; }
          const lb = r.fin ? r.t : r.t + (isFinite(minVuelta) ? minVuelta : 0);
          if (lb >= cota) { poda("cota", desc + ` lb=${lb.toFixed(1)} ≥ ${cota.toFixed(1)}`); continue; }
          pasos.push({ origen: nodo, destino: arco.to, modo: m, bat: r.bat, t: r.t });
          if (r.fin) {
            stats.soluciones++;
            const key = [g.inicio, ...pasos.map((p) => p.destino)].join(">");
            const prev = mejores.get(key);
            if (!prev || r.t < prev.t) {
              mejores.set(key, { t: r.t, bat: r.bat, pasos: pasos.slice(), key });
              if (mejores.size > 3) {
                const peor = [...mejores.values()].sort((a, b) => b.t - a.t)[0];
                mejores.delete(peor.key);
              }
              actualizarCota();
            }
            if (log.length < LOGMAX) log.push({ tipo: "sol", desc: `Solución ${r.t.toFixed(1)} s: ${key.replaceAll(">", " → ")}` });
          } else {
            if (log.length < LOGMAX) log.push({ tipo: "acepta", desc: desc + ` t=${r.t.toFixed(1)} bat=${r.bat.toFixed(2)}` });
            estado.visit.add(arco.to);
            const prevT = estado.t, prevB = estado.bat;
            estado.t = r.t; estado.bat = r.bat;
            dfs(arco.to, estado, prof + 1);
            estado.t = prevT; estado.bat = prevB;
            estado.visit.delete(arco.to);
          }
          pasos.pop();
          if (stats.cortado) return;
        }
      }
    }

    dfs(g.inicio, { t: 0, bat: 100, visit: new Set([g.inicio]) }, 0);
    const rutas = [...mejores.values()].sort((a, b) => a.t - b.t);
    return { rutas, conting: rutas.length ? null : conting, stats, log, ms: performance.now() - t0 };
  }

  // Diagnóstico estructural del grafo
  function diagnostico(g) {
    const out = {}, inn = {};
    for (const n in g.lugares) { out[n] = 0; inn[n] = 0; }
    for (const n in g.ady) for (const a of g.ady[n]) { out[n]++; inn[a.to]++; }
    const alcanzables = new Set([g.inicio]); const q = [g.inicio];
    while (q.length) { const n = q.shift(); for (const a of g.ady[n]) if (!g.lugares[a.to].prohibido && !alcanzables.has(a.to)) { alcanzables.add(a.to); q.push(a.to); } }
    const avisos = [];
    if (inn[g.inicio] === 0) avisos.push(`Ninguna conexión llega a ${g.inicio}: Uada no puede volver.`);
    for (const o of obligatorios(g)) {
      if (out[o] === 0) avisos.push(`${o} es obligatorio y no tiene conexiones de salida.`);
      if (!alcanzables.has(o)) avisos.push(`${o} no es alcanzable desde el inicio.`);
    }
    return { out, inn, alcanzables, avisos };
  }

  window.UADA = { MODOS, parse, recarga, tramo, resolver, diagnostico, obligatorios, dist };
})();
