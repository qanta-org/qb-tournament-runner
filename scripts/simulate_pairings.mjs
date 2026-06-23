#!/usr/bin/env node
/**
 * Pairing simulation -> HTML report.
 *
 * Replays the precomputed AI responses in a dataset directory to simulate:
 *
 *   TOSSUPS (competitive, 1v1 round-robin):
 *     For every unordered pair of agents, each tossup is a buzz race.
 *     - Natural buzz = first row with buzz==1 at token position >= k; any buzz
 *       decision before k is discarded (not held to the gate). Its `correct`
 *       decides the ruling. Matches the live engine.
 *     - The earlier buzzer answers first. Ties on token position are broken by higher
 *       confidence at the buzz, then by roster order.
 *     - Correct  -> +aiTossupPoints (deflated by weight class) and the tossup ends.
 *     - Wrong    -> neg (-tossup_penalty_value); the other agent then answers.
 *     - No vulturing: after a neg, the second team does not buzz in early. It hears
 *       the rest of the question and answers at the end using its last-token `correct`,
 *       which decides points vs the second-team penalty (default 0).
 *     - If neither agent naturally buzzes, the tossup is dead (0/0).
 *
 *   BONUSES (cooperative, pairwise + solo baselines):
 *     A part is converted if EITHER teammate answered it correctly (OR / union).
 *     Points use bonusConsultPoints, summing weight-class deflation over all teammates.
 *
 * Both paths apply weight-class deflation exactly as shared/scoring.ts does, using the
 * params from the chosen rule preset merged onto DEFAULT_GAME_CONFIG base point values.
 *
 * Usage:
 *   node scripts/simulate_pairings.mjs \
 *     [--data data/qanta26-playtest] \
 *     [--preset config/rule-presets/qanta26.json] \
 *     [--out runs/pairing-sim/report.html]
 */

import { parse } from 'csv-parse/sync';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// Base config (mirrors the relevant subset of DEFAULT_GAME_CONFIG in shared/types.ts)
// ----------------------------------------------------------------------------
const BASE_CONFIG = {
  enable_power_points: false,
  power_points_value: 15,
  default_points_value: 10,
  tossup_penalty_value: 5,
  tossup_penalty_value_second_team: 0,
  bonus_part_points: 10,
  ai_tossup_score_factors: { lightweight: 1.0, midweight: 0.8, heavyweight: 0.4 },
  tossup_deflation_mode: 'weighted',
  tossup_static_deflation: 5,
  bonus_ai_consult_factor: 0.5,
  bonus_deflation_mode: 'static',
  bonus_static_deflation: 5,
  bonus_weight_deflation: { lightweight: 1, midweight: 2, heavyweight: 3 },
  bonus_abstain_points: 1,
};

const DEFAULT_BONUS_WEIGHT_DEFLATION = { lightweight: 1, midweight: 2, heavyweight: 3 };

// ----------------------------------------------------------------------------
// Scoring helpers (port of shared/scoring.ts)
// ----------------------------------------------------------------------------

/** Points for a correct AI tossup buzz after weight-class deflation. */
function aiTossupPoints(config, base, weightClass) {
  const mode = config.tossup_deflation_mode;
  if (!mode || mode === 'weighted') {
    const factors = config.ai_tossup_score_factors;
    const factor =
      weightClass && factors && weightClass in factors
        ? factors[weightClass]
        : factors?.lightweight ?? 1;
    return Math.round(base * factor);
  }
  if (mode === 'none') return base;
  return Math.max(0, base - (config.tossup_static_deflation ?? 5));
}

/** Points for a correct bonus part resolved cooperatively, after deflation. */
function bonusConsultPoints(config, weightClasses) {
  const full = config.bonus_part_points;
  const mode = config.bonus_deflation_mode;
  if (!mode) return Math.round(full * (config.bonus_ai_consult_factor ?? 0.5));
  if (mode === 'none') return full;
  if (mode === 'static') return Math.max(0, full - (config.bonus_static_deflation ?? 5));
  const weights = config.bonus_weight_deflation ?? DEFAULT_BONUS_WEIGHT_DEFLATION;
  let deflation = 0;
  for (const wc of weightClasses) {
    if (wc) deflation += weights[wc] ?? 0;
  }
  return Math.max(0, full - deflation);
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    data: 'data/qanta26-playtest',
    preset: 'config/rule-presets/qanta26.json',
    out: 'runs/pairing-sim/report.html',
    // Autonomous-after-k threshold: an agent cannot buzz before token position k,
    // and buzz decisions made before k are discarded (engine-matched). Defaults to
    // 5 here and overrides the preset's autonomous_default_k; pass --k to change it.
    k: 5,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data') args.data = argv[++i];
    else if (a === '--preset') args.preset = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--k') args.k = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/simulate_pairings.mjs [--data DIR] [--preset FILE] [--out FILE] [--k N]'
      );
      process.exit(0);
    } else {
      console.warn(`Unknown argument: ${a}`);
    }
  }
  return args;
}

function resolvePath(p) {
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true });
}

// ----------------------------------------------------------------------------
// Loaders
// ----------------------------------------------------------------------------
function loadRoster(dataDir) {
  const rosterPath = path.join(dataDir, 'ai_roster.csv');
  const rows = loadCsv(rosterPath);
  const agents = rows
    .filter((r) => (r.type ?? 'ai').toLowerCase() === 'ai')
    .map((r, idx) => ({
      index: idx,
      id: r.player_id,
      name: r.name,
      tossupModel: r.tossup_model,
      bonusModel: r.bonus_model,
      weightClass: (r.weight_class || 'lightweight').toLowerCase(),
    }));
  if (agents.length < 2) {
    throw new Error(`Need at least 2 AI agents in roster, found ${agents.length}`);
  }
  return agents;
}

function loadPackets(dataDir) {
  const entries = fs
    .readdirSync(dataDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^packet_\d+$/.test(e.name))
    .map((e) => ({ name: e.name, num: parseInt(e.name.split('_')[1], 10) }))
    .sort((a, b) => a.num - b.num);

  const packets = [];
  for (const e of entries) {
    const dir = path.join(dataDir, e.name);
    const tossupPath = path.join(dir, 'tossups.csv');
    const bonusPath = path.join(dir, 'bonuses.csv');
    const tossupIds = fs.existsSync(tossupPath)
      ? loadCsv(tossupPath).map((r) => r.qid).filter(Boolean)
      : [];
    let bonusIds = [];
    const bonusPartCounts = new Map();
    if (fs.existsSync(bonusPath)) {
      const rows = loadCsv(bonusPath);
      for (const r of rows) {
        const qid = r.question_id;
        if (!qid) continue;
        bonusIds.push(qid);
        let parts = 0;
        for (let n = 1; n <= 3; n++) {
          if ((r[`part${n}`] ?? '').toString().trim() !== '') parts++;
        }
        bonusPartCounts.set(qid, parts || 3);
      }
    }
    packets.push({ name: e.name, num: e.num, tossupIds, bonusIds, bonusPartCounts });
  }
  if (packets.length === 0) {
    throw new Error(`No packet_* directories found in ${dataDir}`);
  }
  return packets;
}

function loadTossupResponses(dataDir, models) {
  const responsesDir = path.join(dataDir, 'responses');
  const byModel = new Map();
  for (const model of models) {
    const filePath = path.join(responsesDir, `${model}.buzz.csv`);
    if (!fs.existsSync(filePath)) {
      console.warn(`WARN: missing tossup responses for "${model}" (${filePath})`);
      byModel.set(model, new Map());
      continue;
    }
    const rows = loadCsv(filePath);
    const byQid = new Map();
    for (const r of rows) {
      const qid = r.question_id;
      if (!qid) continue;
      if (!byQid.has(qid)) byQid.set(qid, []);
      byQid.get(qid).push({
        position: parseInt(r.token_position, 10),
        guess: r.guess,
        confidence: parseFloat(r.confidence),
        buzz: parseInt(r.buzz, 10),
        correct: parseInt(r.correct, 10) === 1,
      });
    }
    for (const arr of byQid.values()) arr.sort((a, b) => a.position - b.position);
    byModel.set(model, byQid);
  }
  return byModel;
}

function loadBonusResponses(dataDir, models) {
  const responsesDir = path.join(dataDir, 'responses');
  const byModel = new Map();
  for (const model of models) {
    const filePath = path.join(responsesDir, `${model}.bonus.csv`);
    if (!fs.existsSync(filePath)) {
      console.warn(`WARN: missing bonus responses for "${model}" (${filePath})`);
      byModel.set(model, new Map());
      continue;
    }
    const rows = loadCsv(filePath);
    const byQid = new Map();
    for (const r of rows) {
      const qid = r.question_id;
      if (!qid) continue;
      const part = parseInt(r.part_number, 10);
      if (!byQid.has(qid)) byQid.set(qid, new Map());
      byQid.get(qid).set(part, {
        guess: r.guess,
        confidence: parseFloat(r.confidence),
        correct: parseInt(r.correct, 10) === 1,
      });
    }
    byModel.set(model, byQid);
  }
  return byModel;
}

// ----------------------------------------------------------------------------
// Tossup buzz extraction + simulation
// ----------------------------------------------------------------------------
/**
 * Resolve an agent's buzz on a tossup under the autonomous-after-k rule.
 *
 * Matches the engine: the gate is at token position k (no buzz before k), and a
 * buzz decision made before k is discarded (an early guess is NOT held to the
 * gate). So the buzz is the first row with buzz==1 at position >= k. With k=0
 * this reduces to "earliest buzz==1 row".
 */
function getBuzzInfo(qidMap, qid, k) {
  const rows = qidMap?.get(qid);
  if (!rows || rows.length === 0) {
    return { hasNatural: false, naturalPos: null, naturalCorrect: false, naturalConf: 0, lastCorrect: false, lastPos: null };
  }
  const last = rows[rows.length - 1];

  // First buzz==1 at or after token position k (earlier buzzes discarded).
  const buzzRow = rows.find((r) => r.position >= k && r.buzz === 1) ?? null;

  return {
    hasNatural: buzzRow !== null,
    naturalPos: buzzRow ? buzzRow.position : null,
    naturalCorrect: buzzRow ? buzzRow.correct : false,
    naturalConf: buzzRow ? buzzRow.confidence : 0,
    lastCorrect: last.correct,
    lastPos: last.position,
  };
}

/**
 * Resolve a single competitive tossup between agent A and B.
 * Returns per-agent points plus event flags for stat accumulation.
 */
function resolveTossup(config, A, ba, B, bb) {
  const ev = {
    a: { points: 0, buzzed: false, correct: false, neg: false },
    b: { points: 0, buzzed: false, correct: false, neg: false },
    dead: false,
  };

  if (!ba.hasNatural && !bb.hasNatural) {
    ev.dead = true;
    return ev;
  }

  // Decide who buzzes first.
  let first, firstBuzz, firstEv, second, secondBuzz, secondEv;
  const aFirst = (() => {
    if (ba.hasNatural && !bb.hasNatural) return true;
    if (!ba.hasNatural && bb.hasNatural) return false;
    if (ba.naturalPos !== bb.naturalPos) return ba.naturalPos < bb.naturalPos;
    if (ba.naturalConf !== bb.naturalConf) return ba.naturalConf > bb.naturalConf;
    return A.index < B.index;
  })();

  if (aFirst) {
    first = A; firstBuzz = ba; firstEv = ev.a;
    second = B; secondBuzz = bb; secondEv = ev.b;
  } else {
    first = B; firstBuzz = bb; firstEv = ev.b;
    second = A; secondBuzz = ba; secondEv = ev.a;
  }

  const base = config.enable_power_points ? config.power_points_value : config.default_points_value;

  // First buzzer answers (it always has a natural buzz at this point).
  firstEv.buzzed = true;
  if (firstBuzz.naturalCorrect) {
    firstEv.correct = true;
    firstEv.points += aiTossupPoints(config, base, first.weightClass);
    return ev;
  }

  // First negged. No vulturing: the second team does not buzz in early off the
  // neg. It hears the rest of the question and answers at the end, using its
  // last-token guess. (Wrong at the end costs the second-team penalty, 0 by default.)
  firstEv.neg = true;
  firstEv.points -= config.tossup_penalty_value;

  secondEv.buzzed = true;
  if (secondBuzz.lastCorrect) {
    secondEv.correct = true;
    secondEv.points += aiTossupPoints(config, base, second.weightClass);
  } else {
    secondEv.neg = true;
    secondEv.points -= config.tossup_penalty_value_second_team;
  }

  return ev;
}

function emptyAgentTossupStats() {
  return {
    points: 0,
    buzzes: 0,
    correct: 0,
    negs: 0,
    matchupW: 0,
    matchupL: 0,
    matchupT: 0,
    perPacket: new Map(),
  };
}

function simulateTossups(config, agents, packets, tossupResponses, k) {
  const stats = new Map();
  for (const ag of agents) stats.set(ag.name, emptyAgentTossupStats());

  // head-to-head points: h2h[X][Y] = points X scored vs Y
  const h2h = new Map();
  for (const x of agents) {
    const row = new Map();
    for (const y of agents) row.set(y.name, null);
    h2h.set(x.name, row);
  }

  const matchups = [];
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const A = agents[i];
      const B = agents[j];
      const mapA = tossupResponses.get(A.tossupModel);
      const mapB = tossupResponses.get(B.tossupModel);
      let aTotal = 0;
      let bTotal = 0;
      const sa = stats.get(A.name);
      const sb = stats.get(B.name);

      for (const packet of packets) {
        for (const qid of packet.tossupIds) {
          const ba = getBuzzInfo(mapA, qid, k);
          const bb = getBuzzInfo(mapB, qid, k);
          const ev = resolveTossup(config, A, ba, B, bb);

          aTotal += ev.a.points;
          bTotal += ev.b.points;

          // agent aggregate stats
          sa.points += ev.a.points;
          sb.points += ev.b.points;
          if (ev.a.buzzed) sa.buzzes++;
          if (ev.b.buzzed) sb.buzzes++;
          if (ev.a.correct) sa.correct++;
          if (ev.b.correct) sb.correct++;
          if (ev.a.neg) sa.negs++;
          if (ev.b.neg) sb.negs++;

          // per packet
          sa.perPacket.set(packet.num, (sa.perPacket.get(packet.num) ?? 0) + ev.a.points);
          sb.perPacket.set(packet.num, (sb.perPacket.get(packet.num) ?? 0) + ev.b.points);
        }
      }

      // matchup record
      if (aTotal > bTotal) { sa.matchupW++; sb.matchupL++; }
      else if (aTotal < bTotal) { sb.matchupW++; sa.matchupL++; }
      else { sa.matchupT++; sb.matchupT++; }

      h2h.get(A.name).set(B.name, aTotal);
      h2h.get(B.name).set(A.name, bTotal);

      matchups.push({ a: A.name, b: B.name, aPoints: aTotal, bPoints: bTotal });
    }
  }

  return { stats, h2h, matchups };
}

// ----------------------------------------------------------------------------
// Bonus simulation
// ----------------------------------------------------------------------------
function buildBonusPairings(agents) {
  const pairings = [];
  for (const ag of agents) {
    pairings.push({ label: ag.name, type: 'solo', members: [ag] });
  }
  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      pairings.push({
        label: `${agents[i].name} + ${agents[j].name}`,
        type: 'pair',
        members: [agents[i], agents[j]],
      });
    }
  }
  return pairings;
}

function simulateBonuses(config, pairings, packets, bonusResponses) {
  const totalBonuses = packets.reduce((acc, p) => acc + p.bonusIds.length, 0);

  const results = [];
  for (const pairing of pairings) {
    let totalPoints = 0;
    let partsCorrect = 0;
    let totalParts = 0;
    const perPacket = new Map();
    const memberWcs = pairing.members.map((m) => m.weightClass);
    const memberMaps = pairing.members.map((m) => bonusResponses.get(m.bonusModel));

    for (const packet of packets) {
      let packetPoints = 0;
      for (const qid of packet.bonusIds) {
        const numParts = packet.bonusPartCounts.get(qid) ?? 3;
        for (let part = 1; part <= numParts; part++) {
          totalParts++;
          const anyCorrect = memberMaps.some((mm) => mm?.get(qid)?.get(part)?.correct === true);
          if (anyCorrect) {
            partsCorrect++;
            const pts = bonusConsultPoints(config, memberWcs);
            totalPoints += pts;
            packetPoints += pts;
          }
        }
      }
      perPacket.set(packet.num, packetPoints);
    }

    results.push({
      label: pairing.label,
      type: pairing.type,
      members: pairing.members,
      totalPoints,
      partsCorrect,
      totalParts,
      conversion: totalParts > 0 ? partsCorrect / totalParts : 0,
      pointsPerBonus: totalBonuses > 0 ? totalPoints / totalBonuses : 0,
      perPacket,
    });
  }

  results.sort((a, b) => b.totalPoints - a.totalPoints || b.conversion - a.conversion);
  return { results, totalBonuses };
}

// ----------------------------------------------------------------------------
// HTML rendering
// ----------------------------------------------------------------------------
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function bar(value, max, cls) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="bar ${cls}"><span style="width:${w.toFixed(1)}%"></span></div>`;
}

function deflationSummary(config) {
  const tf = config.ai_tossup_score_factors;
  const bw = config.bonus_weight_deflation;
  const base = config.enable_power_points ? config.power_points_value : config.default_points_value;
  const tossupLine =
    config.tossup_deflation_mode === 'weighted'
      ? `tossup: <b>weighted</b> &mdash; correct AI buzz scores base&times;factor (LW ${tf.lightweight} = ${Math.round(base * tf.lightweight)}, MW ${tf.midweight} = ${Math.round(base * tf.midweight)}, HW ${tf.heavyweight} = ${Math.round(base * tf.heavyweight)} pts)`
      : config.tossup_deflation_mode === 'static'
        ? `tossup: <b>static</b> &mdash; base &minus; ${config.tossup_static_deflation}`
        : `tossup: <b>none</b> &mdash; full ${base} pts`;
  const bonusLine =
    config.bonus_deflation_mode === 'weighted'
      ? `bonus: <b>weighted</b> &mdash; ${config.bonus_part_points} &minus; &Sigma; weight deflation per teammate (LW &minus;${bw.lightweight}, MW &minus;${bw.midweight}, HW &minus;${bw.heavyweight})`
      : config.bonus_deflation_mode === 'static'
        ? `bonus: <b>static</b> &mdash; ${config.bonus_part_points} &minus; ${config.bonus_static_deflation}`
        : config.bonus_deflation_mode === 'none'
          ? `bonus: <b>none</b> &mdash; full ${config.bonus_part_points} pts`
          : `bonus: legacy factor &times;${config.bonus_ai_consult_factor}`;
  return `${tossupLine}<br>${bonusLine}`;
}

function renderRoster(agents) {
  const rows = agents
    .map(
      (a) => `<tr>
        <td>${esc(a.name)}</td>
        <td><span class="wc wc-${esc(a.weightClass)}">${esc(a.weightClass)}</span></td>
        <td class="mono">${esc(a.tossupModel)}</td>
        <td class="mono">${esc(a.bonusModel)}</td>
      </tr>`
    )
    .join('');
  return `<table>
    <thead><tr><th>Agent</th><th>Weight class</th><th>Tossup model</th><th>Bonus model</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTossupStandings(agents, tossup) {
  const ranked = [...agents].sort((x, y) => tossup.stats.get(y.name).points - tossup.stats.get(x.name).points);
  const maxPts = Math.max(1, ...ranked.map((a) => tossup.stats.get(a.name).points));
  const rows = ranked
    .map((a, i) => {
      const s = tossup.stats.get(a.name);
      const acc = s.buzzes > 0 ? s.correct / s.buzzes : 0;
      return `<tr>
        <td class="rank">${i + 1}</td>
        <td>${esc(a.name)} <span class="wc wc-${esc(a.weightClass)}">${esc(a.weightClass)}</span></td>
        <td>${s.matchupW}&ndash;${s.matchupL}${s.matchupT ? `&ndash;${s.matchupT}` : ''}</td>
        <td class="num"><b>${s.points}</b> ${bar(s.points, maxPts, 'pts')}</td>
        <td class="num">${s.buzzes}</td>
        <td class="num">${s.correct}</td>
        <td class="num">${s.negs}</td>
        <td class="num">${pct(acc)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>#</th><th>Agent</th><th>Matchups W&ndash;L</th><th>Total points</th><th>Buzzes</th><th>Correct</th><th>Negs</th><th>Buzz acc.</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderH2H(agents, tossup) {
  const header = agents.map((a) => `<th>${esc(a.name)}</th>`).join('');
  const rows = agents
    .map((x) => {
      const cells = agents
        .map((y) => {
          if (x.name === y.name) return `<td class="diag">&mdash;</td>`;
          const xp = tossup.h2h.get(x.name).get(y.name);
          const yp = tossup.h2h.get(y.name).get(x.name);
          const win = xp > yp;
          const tie = xp === yp;
          return `<td class="num ${win ? 'win' : tie ? '' : 'loss'}">${xp} : ${yp}</td>`;
        })
        .join('');
      return `<tr><th>${esc(x.name)}</th>${cells}</tr>`;
    })
    .join('');
  return `<table class="matrix">
    <thead><tr><th></th>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">Each cell shows <em>row agent : column agent</em> total points across all tossups in that head-to-head. Green = row agent wins.</p>`;
}

function renderTossupPerPacket(agents, packets, tossup) {
  const header = packets.map((p) => `<th>P${p.num}</th>`).join('');
  const rows = agents
    .map((a) => {
      const s = tossup.stats.get(a.name);
      const cells = packets.map((p) => `<td class="num">${s.perPacket.get(p.num) ?? 0}</td>`).join('');
      return `<tr><th>${esc(a.name)}</th>${cells}<td class="num"><b>${s.points}</b></td></tr>`;
    })
    .join('');
  return `<details><summary>Per-packet tossup points (summed across all matchups)</summary>
    <table><thead><tr><th>Agent</th>${header}<th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  </details>`;
}

function renderBonusTable(bonus) {
  const maxPts = Math.max(1, ...bonus.results.map((r) => r.totalPoints));
  const rows = bonus.results
    .map((r, i) => {
      const wcs = r.members.map((m) => `<span class="wc wc-${esc(m.weightClass)}">${esc(m.weightClass[0].toUpperCase())}</span>`).join(' ');
      return `<tr class="${r.type}">
        <td class="rank">${i + 1}</td>
        <td>${esc(r.label)} ${wcs}</td>
        <td><span class="tag tag-${r.type}">${r.type}</span></td>
        <td class="num"><b>${r.totalPoints}</b> ${bar(r.totalPoints, maxPts, 'bpts')}</td>
        <td class="num">${r.partsCorrect} / ${r.totalParts}</td>
        <td class="num">${pct(r.conversion)}</td>
        <td class="num">${r.pointsPerBonus.toFixed(2)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>#</th><th>Pairing</th><th>Type</th><th>Total points</th><th>Parts converted</th><th>Conversion</th><th>Pts / bonus</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="note">A part counts as converted if <em>either</em> teammate answered it correctly. Points apply weighted consult deflation summed over both teammates' weight classes, so heavier pairs convert more parts but each part is worth fewer points.</p>`;
}

function renderBonusPerPacket(packets, bonus) {
  const header = packets.map((p) => `<th>P${p.num}</th>`).join('');
  const rows = bonus.results
    .map((r) => {
      const cells = packets.map((p) => `<td class="num">${r.perPacket.get(p.num) ?? 0}</td>`).join('');
      return `<tr class="${r.type}"><th>${esc(r.label)}</th>${cells}<td class="num"><b>${r.totalPoints}</b></td></tr>`;
    })
    .join('');
  return `<details><summary>Per-packet bonus points</summary>
    <table><thead><tr><th>Pairing</th>${header}<th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  </details>`;
}

function renderHtml({ args, preset, config, agents, packets, tossup, bonus, totals }) {
  const css = `
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #0f1115; color: #e6e8eb; line-height: 1.45; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 { font-size: 20px; margin: 40px 0 12px; border-bottom: 1px solid #2a2f3a; padding-bottom: 6px; }
    h3 { font-size: 15px; margin: 24px 0 8px; color: #aab2c0; font-weight: 600; }
    .sub { color: #8b94a3; font-size: 13px; }
    .card { background: #161a22; border: 1px solid #242a36; border-radius: 10px; padding: 14px 18px; margin: 14px 0; font-size: 13px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
    th, td { padding: 7px 10px; text-align: left; border-bottom: 1px solid #222834; }
    thead th { color: #9aa3b2; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
    tbody tr:hover { background: #1b212b; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.rank { color: #8b94a3; width: 28px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #9aa3b2; }
    .note { color: #8b94a3; font-size: 12px; margin: 8px 0 0; }
    .bar { display: inline-block; vertical-align: middle; width: 90px; height: 7px; background: #222834; border-radius: 4px; margin-left: 8px; overflow: hidden; }
    .bar span { display: block; height: 100%; }
    .bar.pts span, .bar.bpts span { background: linear-gradient(90deg,#3b82f6,#22d3ee); }
    .wc { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px; vertical-align: middle; }
    .wc-lightweight { background: #14532d; color: #bbf7d0; }
    .wc-midweight { background: #713f12; color: #fde68a; }
    .wc-heavyweight { background: #4c1d24; color: #fecaca; }
    .matrix td.win { color: #4ade80; font-weight: 600; }
    .matrix td.loss { color: #f87171; }
    .matrix td.diag { color: #4b5563; text-align: center; }
    .matrix th { background: #161a22; }
    .tag { font-size: 10px; padding: 1px 7px; border-radius: 999px; }
    .tag-solo { background: #1f2937; color: #9ca3af; }
    .tag-pair { background: #1e3a8a; color: #bfdbfe; }
    tr.solo { background: rgba(255,255,255,0.015); }
    details { margin: 12px 0; }
    summary { cursor: pointer; color: #93c5fd; font-size: 13px; padding: 6px 0; }
    footer { margin-top: 48px; color: #6b7280; font-size: 12px; }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pairing Simulation Report</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <h1>Pairing Simulation Report</h1>
  <div class="sub">Generated ${new Date().toISOString()} &middot; dataset <span class="mono">${esc(args.data)}</span> &middot; preset <b>${esc(preset.name ?? args.preset)}</b></div>

  <div class="card">
    <b>Scope:</b> ${agents.length} agents &middot; ${totals.tossupCount} tossups &middot; ${totals.bonusCount} bonuses across ${packets.length} packets.<br>
    <b>Tossups:</b> competitive 1v1 round-robin (${totals.matchupCount} matchups). After a neg there is no vulturing &mdash; the other team answers at the end of the question. Autonomous buzzing is gated to token <b>k = ${totals.k}</b>; buzz decisions before token k are discarded (engine-matched).<br>
    <b>Bonuses:</b> cooperative &mdash; a part is converted if either teammate is correct.<br>
    <b>Deflation:</b> ${deflationSummary(config)}
  </div>

  <h2>Roster</h2>
  ${renderRoster(agents)}

  <h2>Tossups &mdash; competitive 1v1 round-robin</h2>
  <h3>Standings</h3>
  ${renderTossupStandings(agents, tossup)}
  <h3>Head-to-head (points for : against)</h3>
  ${renderH2H(agents, tossup)}
  ${renderTossupPerPacket(agents, packets, tossup)}

  <h2>Bonuses &mdash; cooperative pairings</h2>
  ${renderBonusTable(bonus)}
  ${renderBonusPerPacket(packets, bonus)}

  <footer>
    Buzz race uses the precomputed <span class="mono">buzz</span> flag (first buzz==1 at token position &ge; k; earlier buzzes discarded) and <span class="mono">correct</span> column; ties on token position break by confidence then roster order. After a neg the other team answers with its last-token guess (no vulturing).
    No power marks present in this dataset, so every tossup is worth ${config.default_points_value} base points.
  </footer>
</div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);
  const dataDir = resolvePath(args.data);
  const presetPath = resolvePath(args.preset);
  const outPath = resolvePath(args.out);

  const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
  const config = { ...BASE_CONFIG, ...(preset.config ?? {}) };

  const agents = loadRoster(dataDir);
  const packets = loadPackets(dataDir);

  const tossupModels = [...new Set(agents.map((a) => a.tossupModel))];
  const bonusModels = [...new Set(agents.map((a) => a.bonusModel))];
  const tossupResponses = loadTossupResponses(dataDir, tossupModels);
  const bonusResponses = loadBonusResponses(dataDir, bonusModels);

  const k = args.k;
  const tossup = simulateTossups(config, agents, packets, tossupResponses, k);
  const pairings = buildBonusPairings(agents);
  const bonus = simulateBonuses(config, pairings, packets, bonusResponses);

  const totals = {
    tossupCount: packets.reduce((acc, p) => acc + p.tossupIds.length, 0),
    bonusCount: bonus.totalBonuses,
    matchupCount: (agents.length * (agents.length - 1)) / 2,
    k,
  };

  const html = renderHtml({ args, preset, config, agents, packets, tossup, bonus, totals });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  // Console summary
  console.log(`\nPairing simulation complete.`);
  console.log(`  Dataset:  ${dataDir}`);
  console.log(`  Preset:   ${preset.name ?? args.preset}`);
  console.log(`  Tossups:  ${totals.tossupCount} | Bonuses: ${totals.bonusCount} | Packets: ${packets.length} | k = ${k}`);
  console.log(`\nTossup standings (by total points across round-robin):`);
  [...agents]
    .sort((x, y) => tossup.stats.get(y.name).points - tossup.stats.get(x.name).points)
    .forEach((a, i) => {
      const s = tossup.stats.get(a.name);
      console.log(`  ${i + 1}. ${a.name.padEnd(10)} ${String(s.points).padStart(6)} pts  (${s.matchupW}-${s.matchupL}-${s.matchupT}, ${s.correct} correct, ${s.negs} negs)`);
    });
  console.log(`\nTop bonus pairings (by total points):`);
  bonus.results.slice(0, 6).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.label.padEnd(22)} ${String(r.totalPoints).padStart(6)} pts  (${r.partsCorrect}/${r.totalParts} parts, ${pct(r.conversion)})`);
  });
  console.log(`\nReport written to: ${outPath}\n`);
}

main();
