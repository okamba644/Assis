/* Graphique "Évolution globale de l'activité" : lit data-* sur #evo-activite et appelle Xano. */
(function () {
  var root = document.getElementById("evo-activite");
  if (!root) return;
  var CONFIG = {
    url: "https://xuub-b4yt-tdhb.p7.xano.io/api:Wg9wVimD/activity_evolution",
    account_id: (root.getAttribute("data-account-id") || "").trim(),
    start_date: (root.getAttribute("data-start-date") || "").trim(),
    end_date: (root.getAttribute("data-end-date") || "").trim(),
    points: Number(root.getAttribute("data-points")) || 4
  };
  function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function localDay(d) {
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  var now = new Date();
  var monthStart = localDay(new Date(now.getFullYear(), now.getMonth(), 1));
  var monthEnd = localDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (!isValidDate(CONFIG.start_date) || !isValidDate(CONFIG.end_date)) {
    CONFIG.start_date = monthStart;
    CONFIG.end_date = monthEnd;
  }
  if (window.console) console.log("[evo-activite] démarrage", JSON.stringify(CONFIG));
  var SERIES = [
    { key: "comptes",      label: "Comptes",      color: "#2563eb" },
    { key: "contacts",     label: "Contacts",     color: "#8b5cf6" },
    { key: "opportunites", label: "Opportunités", color: "#10b981" },
    { key: "interactions", label: "Interactions", color: "#38bdf8" },
    { key: "taches",       label: "Tâches",       color: "#f59e0b" }
  ];
  var canvas = root.querySelector("canvas");
  var msg = root.querySelector(".evo-msg");
  var legend = root.querySelector(".evo-legend");
  function dayRange(start, end) {
    var days = [];
    var d = new Date(start + "T00:00:00Z");
    var last = new Date(end + "T00:00:00Z");
    while (d <= last) {
      days.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
  }
  function toDay(value) {
    if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }
  function formatLabel(day) {
    return new Date(day + "T00:00:00Z").toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", timeZone: "UTC"
    });
  }
  function pointIndexes(nbDays, n) {
    n = Math.max(1, Math.min(n, nbDays));
    var idx = [];
    for (var k = 0; k < n; k++) {
      idx.push(n === 1 ? 0 : Math.round(k * (nbDays - 1) / (n - 1)));
    }
    return idx;
  }
  function nearestPoint(idx, d) {
    var best = 0;
    for (var k = 1; k < idx.length; k++) {
      if (Math.abs(idx[k] - d) < Math.abs(idx[best] - d)) best = k;
    }
    return best;
  }
  function demoData(days) {
    var out = {};
    SERIES.forEach(function (s, i) {
      out[s.key] = days.map(function (day, j) {
        return { date: day, count: Math.max(0, Math.round(4 + 3 * Math.sin(j / 4 + i) + j / 6 - i)) };
      });
    });
    return out;
  }
  function loadChartJs() {
    if (window.Chart) return Promise.resolve();
    if (!window.__evoChartJs) {
      window.__evoChartJs = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
        s.onload = resolve;
        s.onerror = function () {
          window.__evoChartJs = null;
          reject(new Error("Chart.js introuvable"));
        };
        document.head.appendChild(s);
      });
    }
    return window.__evoChartJs;
  }
  function checkConfig() {
    var isDate = /^\d{4}-\d{2}-\d{2}$/;
    if (!String(CONFIG.account_id).trim()) throw new Error("account_id vide");
    if (!isDate.test(CONFIG.start_date)) throw new Error("date de début invalide : \"" + CONFIG.start_date + "\"");
    if (!isDate.test(CONFIG.end_date)) throw new Error("date de fin invalide : \"" + CONFIG.end_date + "\"");
    if (CONFIG.start_date > CONFIG.end_date) throw new Error("la date de début est après la date de fin");
  }
  function fetchData() {
    if (CONFIG.url.indexOf("VOTRE-INSTANCE") !== -1) {
      return Promise.resolve(demoData(dayRange(CONFIG.start_date, CONFIG.end_date)));
    }
    var inputs = {
      account_id: Number(CONFIG.account_id),
      start_date: CONFIG.start_date,
      end_date: CONFIG.end_date
    };
    var asJson = JSON.stringify(inputs);
    var asForm = Object.keys(inputs).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(inputs[k]);
    }).join("&");
    return post("application/json", asJson).catch(function (err) {
      if (!err.network) throw err;
      return post("application/x-www-form-urlencoded", asForm);
    });
  }
  function post(contentType, body) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    return fetch(CONFIG.url.trim(), {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: body,
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }, function (err) {
      clearTimeout(timer);
      var e = new Error(err.name === "AbortError"
        ? "Xano ne répond pas"
        : "Xano injoignable : " + err.message + " — voir l'onglet Réseau (F12)");
      e.network = err.name !== "AbortError";
      throw e;
    });
  }
  function render(data) {
    if (window.console) console.log("[evo-activite] réponse Xano", JSON.stringify(data));
    if (!data || typeof data !== "object") data = {};
    var days = dayRange(CONFIG.start_date, CONFIG.end_date);
    var idx = pointIndexes(days.length, CONFIG.points);
    var dayToPoint = {};
    days.forEach(function (day, d) { dayToPoint[day] = nearestPoint(idx, d); });
    var datasets = SERIES.map(function (s) {
      var sums = idx.map(function () { return 0; });
      var rows = Array.isArray(data[s.key]) ? data[s.key] : [];
      rows.forEach(function (row) {
        if (!row) return;
        var k = dayToPoint[toDay(row.date)];
        if (k !== undefined) sums[k] += Number(row.count || 0);
      });
      return {
        label: s.label,
        data: sums,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 4
      };
    });
    var previous = Chart.getChart(canvas);
    if (previous) previous.destroy();
    var chart = new Chart(canvas, {
      type: "line",
      data: { labels: idx.map(function (i) { return formatLabel(days[i]); }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#64748b", font: { size: 11 }, maxTicksLimit: 6, maxRotation: 0 }
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: "#eef2f7" },
            ticks: { color: "#94a3b8", font: { size: 11 }, precision: 0 }
          }
        }
      }
    });
    if (legend) legend.innerHTML = "";
    if (legend) SERIES.forEach(function (s, i) {
      var li = document.createElement("li");
      li.innerHTML = '<i style="background:' + s.color + '"></i>' + s.label;
      li.onclick = function () {
        var visible = chart.isDatasetVisible(i);
        chart.setDatasetVisibility(i, !visible);
        li.classList.toggle("off", visible);
        chart.update();
      };
      legend.appendChild(li);
    });
    var total = datasets.reduce(function (sum, ds) {
      return sum + ds.data.reduce(function (a, b) { return a + b; }, 0);
    }, 0);
    if (total === 0) {
      msg.textContent = "Aucune activité sur cette période";
      msg.style.display = "flex";
      msg.style.pointerEvents = "none";
    } else {
      msg.style.display = "none";
    }
  }
  Promise.resolve()
    .then(checkConfig)
    .then(function () { return Promise.all([loadChartJs(), fetchData()]); })
    .then(function (results) { render(results[1]); })
    .catch(function (err) {
      msg.textContent = "Impossible de charger les données (" + err.message + ")";
      if (window.console) console.error("[evo-activite] " + err.message, JSON.stringify(CONFIG));
    });
})();
