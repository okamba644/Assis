/* Graphique "Répartition par type de compte" : lit data-* sur #rep-type-compte et appelle Xano. */
(function () {
  var root = document.getElementById("rep-type-compte");
  if (!root) return;
  var CONFIG = {
    url: "https://xuub-b4yt-tdhb.p7.xano.io/api:3LHB5qKu/accounts_by_type",
    account_id: (root.getAttribute("data-account-id") || "").trim(),
    start_date: (root.getAttribute("data-start-date") || "").trim(),
    end_date: (root.getAttribute("data-end-date") || "").trim()
  };
  if (window.console) console.log("[rep-type-compte] démarrage", JSON.stringify(CONFIG));
  var COLORS = {
    "distributeur": "#2563eb",
    "grossiste": "#f59e0b"
  };
  var EXTRA_COLORS = ["#8b5cf6", "#10b981", "#38bdf8", "#ef4444"];
  var EMPTY_COLOR = "#eef2f7";
  var canvas = root.querySelector("canvas");
  var msg = root.querySelector(".rep-msg");
  var legend = root.querySelector(".rep-legend");
  var totalEl = root.querySelector(".rep-total");
  function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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
  function fetchData() {
    if (!CONFIG.account_id) return Promise.reject(new Error("account_id vide"));
    var inputs = { account_id: Number(CONFIG.account_id) };
    if (isValidDate(CONFIG.start_date) && isValidDate(CONFIG.end_date)) {
      inputs.start_date = CONFIG.start_date;
      inputs.end_date = CONFIG.end_date;
    }
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 15000);
    return fetch(CONFIG.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }, function (err) {
      clearTimeout(timer);
      throw new Error(err.name === "AbortError" ? "Xano ne répond pas" : "Xano injoignable : " + err.message);
    });
  }
  function colorFor(label, i) {
    var key = String(label).toLowerCase();
    return COLORS[key] || EXTRA_COLORS[i % EXTRA_COLORS.length];
  }
  function render(data) {
    if (window.console) console.log("[rep-type-compte] réponse Xano", JSON.stringify(data));
    var rows = data && Array.isArray(data.types) ? data.types : [];
    var items = rows.filter(function (r) { return r && Number(r.count) > 0; }).map(function (r) {
      return { label: r.type ? String(r.type) : "Non défini", count: Number(r.count) };
    });
    items.sort(function (a, b) { return b.count - a.count; });
    var total = items.reduce(function (sum, it) { return sum + it.count; }, 0);
    totalEl.textContent = total;
    var colors = items.map(function (it, i) { return it.label === "Non défini" ? "#94a3b8" : colorFor(it.label, i); });
    var previous = Chart.getChart(canvas);
    if (previous) previous.destroy();
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: total ? items.map(function (it) { return it.label; }) : ["Aucun compte"],
        datasets: [{
          data: total ? items.map(function (it) { return it.count; }) : [1],
          backgroundColor: total ? colors : [EMPTY_COLOR],
          borderWidth: 0,
          hoverOffset: total ? 4 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: total > 0,
            callbacks: {
              label: function (ctx) {
                var pct = Math.round(ctx.parsed * 100 / total);
                return " " + ctx.label + " : " + ctx.parsed + " (" + pct + "%)";
              }
            }
          }
        }
      }
    });
    legend.innerHTML = "";
    items.forEach(function (it, i) {
      var li = document.createElement("li");
      var dot = document.createElement("i");
      dot.style.background = colors[i];
      var name = document.createElement("span");
      name.className = "rep-name";
      name.textContent = it.label;
      var value = document.createElement("b");
      value.textContent = it.count + " (" + Math.round(it.count * 100 / total) + "%)";
      li.appendChild(dot);
      li.appendChild(name);
      li.appendChild(value);
      legend.appendChild(li);
    });
    if (total === 0) {
      msg.textContent = "Aucun compte sur cette période";
      msg.style.display = "block";
    } else {
      msg.style.display = "none";
    }
  }
  Promise.all([loadChartJs(), fetchData()])
    .then(function (results) { render(results[1]); })
    .catch(function (err) {
      msg.textContent = "Impossible de charger les données (" + err.message + ")";
      msg.style.display = "block";
      if (window.console) console.error("[rep-type-compte] " + err.message, JSON.stringify(CONFIG));
    });
})();
