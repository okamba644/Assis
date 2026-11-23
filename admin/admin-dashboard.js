(function () {
  'use strict';

  /* ===== Dépôt visé par chaque publication =====
     C'est le dépôt que GitHub Pages sert réellement (okamba644.github.io/REATM-RECORDS/). */
  var OWNER = 'okamba644';
  var REPO = 'REATM-RECORDS';
  var BRANCH = 'main';
  var API = 'https://api.github.com';

  var TOKEN_KEY = 'reatm-admin-token';
  var SESSION_KEY = 'reatm-admin-session';

  // ===================== déconnexion =====================
  document.getElementById('logoutBtn').addEventListener('click', function () {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    location.href = 'index.html';
  });

  // ===================== petits outils =====================

  function toast(kind, msg) {
    var wrap = document.getElementById('toastWrap');
    var el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0'; el.style.transform = 'translateX(16px)';
      setTimeout(function () { el.remove(); }, 300);
    }, 4200);
  }

  function logRow(kind, titre, detail) {
    var log = document.getElementById('log');
    var empty = log.querySelector('.log-empty');
    if (empty) empty.remove();
    var row = document.createElement('div');
    row.className = 'log-row ' + kind;
    var tag = kind === 'ok' ? 'OK' : kind === 'err' ? 'ÉCHEC' : '…';
    row.innerHTML = '<span class="lt">' + tag + '</span><span class="lx"></span>';
    row.querySelector('.lx').textContent = titre + (detail ? ' — ' + detail : '');
    log.appendChild(row);
    return row;
  }

  // chaînes UTF-8 <-> base64, par blocs pour ne jamais dépasser la pile
  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function base64ToUtf8(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function slugify(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'instrument';
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // GitHub répond par un message technique quand le jeton n'a pas la bonne
  // permission ; on le remplace par la cause probable et la façon de la lever.
  function friendlyGhError(raw) {
    if (/Resource not accessible by (personal access token|integration)/i.test(raw)) {
      return 'Le jeton ne peut pas écrire ici. Sur GitHub : Settings → Developer settings → ' +
        'Fine-grained tokens, modifiez-le — Repository access doit inclure ' + OWNER + '/' + REPO +
        ', et Permissions → Contents doit être « Read and write » (pas Read-only).';
    }
    if (/Bad credentials/i.test(raw)) return 'Ce jeton n’est plus valide. Changez de jeton et collez-en un nouveau.';
    if (/does not match/i.test(raw)) return 'Le fichier a changé entre-temps (une autre action vient de l’éditer). Réessayez — elle reprendra sur la version à jour.';
    return raw;
  }

  // sérialise les lectures-écritures d'un même fichier : deux actions lancées
  // presque en même temps (deux suppressions, par exemple) se chevauchaient
  // sinon, chacune relisant le fichier avant que l'autre n'ait écrit —
  // la seconde se faisait alors refuser par GitHub (sha obsolète).
  var fileQueues = Object.create(null);
  function withFileLock(path, task) {
    var run = (fileQueues[path] || Promise.resolve()).catch(function () {}).then(task);
    fileQueues[path] = run;
    return run;
  }

  function waLink(message) {
    // encodeURIComponent laisse ! ' ( ) * en clair ; le reste du site les
    // encode (%28, %29…) — on s'aligne pour produire des liens identiques.
    var q = encodeURIComponent(message).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
    return 'https://wa.me/212651475341?text=' + q;
  }

  // ===================== l'API GitHub =====================

  function ghHeaders() {
    return {
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

  function ghCheckToken(token) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 ? 'Dépôt introuvable avec ce jeton (vérifiez son accès).' : 'Jeton refusé (' + r.status + ').');
      return r.json();
    }).then(function (repo) {
      // le jeton voit le dépôt, mais lire n'est pas écrire : un jeton à lecture
      // seule passerait ce test et échouerait plus tard, en silence, sur le
      // premier envoi. GitHub renvoie l'autorisation réelle dans .permissions.
      if (repo.permissions && repo.permissions.push === false) {
        throw new Error('Ce jeton peut lire ' + OWNER + '/' + REPO + ' mais pas y écrire. Sur GitHub, modifiez-le : Permissions → Contents doit être « Read and write », pas « Read-only ».');
      }
      return repo;
    });
  }

  // lit un fichier texte du dépôt : { text, sha }
  function ghGetFile(path) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error('Lecture de ' + path + ' refusée (' + r.status + ').');
        return r.json();
      })
      .then(function (j) { return { text: base64ToUtf8(j.content), sha: j.sha }; });
  }

  // écrit un fichier texte (sha requis : on modifie un fichier existant)
  function ghPutFile(path, text, sha, message) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path, {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify({ message: message, content: utf8ToBase64(text), sha: sha, branch: BRANCH })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error('Écriture de ' + path + ' refusée : ' + friendlyGhError(j.message || String(r.status))); });
      return r.json();
    });
  }

  // dépose une image neuve (jamais de sha : le nom est rendu unique côté client)
  function ghPutImage(path, base64, message) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path, {
      method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
      body: JSON.stringify({ message: message, content: base64, branch: BRANCH })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error('Envoi de ' + path + ' refusé : ' + friendlyGhError(j.message || String(r.status))); });
      return r.json();
    });
  }

  // retire un fichier devenu inutile (photo remplacée ou fiche supprimée) ;
  // du seul nettoyage, jamais bloquant pour l'action principale.
  function ghDeleteFileQuiet(path, message) {
    return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path + '?ref=' + BRANCH, { headers: ghHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        return fetch(API + '/repos/' + OWNER + '/' + REPO + '/contents/' + path, {
          method: 'DELETE', headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders()),
          body: JSON.stringify({ message: message, sha: j.sha, branch: BRANCH })
        });
      })
      .catch(function () { /* le fichier reste orphelin dans assets/ : sans conséquence visible */ });
  }
  function ghDeleteFilesQuiet(paths, message) {
    return paths.reduce(function (chain, p) { return chain.then(function () { return ghDeleteFileQuiet(p, message); }); }, Promise.resolve());
  }

  // ===================== images : redimension + conversion côté client =====================

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(img.src); resolve(img); };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ramène la photo à 1200 px sur le grand côté, comme le reste du catalogue
  function resizeToBlob(file, maxSide) {
    return fileToImage(file).then(function (img) {
      var w = img.naturalWidth, h = img.naturalHeight;
      var k = Math.min(1, maxSide / Math.max(w, h));
      var cw = Math.round(w * k), ch = Math.round(h * k);
      var canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (blob) return resolve({ blob: blob, ext: 'webp' });
          // webp indisponible sur ce navigateur : on reste en jpeg plutôt que d'échouer
          canvas.toBlob(function (b2) { resolve({ blob: b2, ext: 'jpg' }); }, 'image/jpeg', 0.86);
        }, 'image/webp', 0.82);
      });
    });
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  // téléverse une photo redimensionnée, renvoie son chemin définitif dans assets/
  function publishImage(file, slug, index) {
    return resizeToBlob(file, 1200).then(function (res) {
      var tag = Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 36).toString(36);
      var path = 'assets/' + slug + '-' + tag + (index ? '-' + index : '') + '.' + res.ext;
      return blobToBase64(res.blob).then(function (b64) {
        return ghPutImage(path, b64, 'Admin : ajoute la photo ' + path)
          .then(function () { return path; });
      });
    });
  }

  function uploadSeries(files, slug) {
    var uploads = files.map(function (f, i) { return function () { return publishImage(f, slug, files.length > 1 ? i + 1 : ''); }; });
    return uploads.reduce(function (chain, step) {
      return chain.then(function (acc) { return step().then(function (path) { acc.push(path); return acc; }); });
    }, Promise.resolve([]));
  }

  // ===================== porte d'accès (jeton) =====================

  var gate = document.getElementById('gate'), dash = document.getElementById('dash');
  var tokenInput = document.getElementById('tokenInput'), tokenSave = document.getElementById('tokenSave');
  var gateMsg = document.getElementById('gateMsg');

  function openDash() { gate.hidden = true; dash.hidden = false; loadCatalogue(); loadEvents(); }

  function tryToken(token, silent) {
    tokenSave.classList.add('is-loading'); tokenSave.disabled = true;
    return ghCheckToken(token).then(function () {
      localStorage.setItem(TOKEN_KEY, token);
      tokenSave.classList.remove('is-loading'); tokenSave.disabled = false;
      openDash();
    }).catch(function (e) {
      tokenSave.classList.remove('is-loading'); tokenSave.disabled = false;
      if (!silent) { gateMsg.style.color = '#ff9699'; gateMsg.textContent = e.message; }
      localStorage.removeItem(TOKEN_KEY);
    });
  }

  tokenSave.addEventListener('click', function () {
    var t = tokenInput.value.trim();
    if (!t) { gateMsg.style.color = '#ff9699'; gateMsg.textContent = 'Collez d’abord un jeton.'; return; }
    gateMsg.textContent = '';
    tryToken(t, false);
  });
  tokenInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') tokenSave.click(); });

  document.getElementById('tokenForget').addEventListener('click', function () {
    localStorage.removeItem(TOKEN_KEY);
    dash.hidden = true; gate.hidden = false;
    tokenInput.value = ''; tokenInput.focus();
  });

  var savedToken = getToken();
  if (savedToken) tryToken(savedToken, true);

  // ===================== navigation (barre latérale) =====================
  var TAB_INFO = {
    instruments: { titre: 'Instruments', lead: 'Chaque publication part directement sur <b>REATM RECORDS</b> — visible sur le site en quelques minutes.' },
    events: { titre: 'Événements', lead: 'Les annonces rejoignent « Prestations internes » sur la page Events.' }
  };
  document.querySelectorAll('.side-link').forEach(function (link) {
    link.addEventListener('click', function () {
      document.querySelectorAll('.side-link').forEach(function (l) { l.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      link.classList.add('active');
      document.getElementById('panel-' + link.dataset.tab).classList.add('active');
      var info = TAB_INFO[link.dataset.tab];
      document.getElementById('mainTitle').textContent = info.titre;
      document.getElementById('mainLead').innerHTML = info.lead;
    });
  });

  // ===================== dépose de fichiers : glisser-déposer + aperçus =====================

  function wireDrop(dropId, inputId, previewsId, multiple) {
    var drop = document.getElementById(dropId), input = document.getElementById(inputId);
    var previews = document.getElementById(previewsId);
    var files = [];

    function render() { previews.innerHTML = ''; files.forEach(addPreview); }
    function addPreview(f, i) {
      var box = document.createElement('div'); box.className = 'preview';
      var img = document.createElement('img'); img.src = URL.createObjectURL(f);
      box.appendChild(img);
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.innerHTML = '&times;';
      rm.addEventListener('click', function () { files.splice(i, 1); render(); });
      box.appendChild(rm);
      previews.appendChild(box);
    }

    function addFiles(list) {
      var incoming = Array.prototype.filter.call(list, function (f) { return f.type.indexOf('image/') === 0; });
      files = multiple ? files.concat(incoming) : incoming.slice(0, 1);
      render();
    }

    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

    return { get: function () { return files; }, reset: function () { files = []; render(); } };
  }

  var instFiles = wireDrop('instDrop', 'instFiles', 'instPreviews', true);
  var evtFiles = wireDrop('evtDrop', 'evtFiles', 'evtPreviews', false);

  // chips des photos déjà en ligne (modification) : on peut en retirer, pas en ajouter ici
  function renderExistingChips(containerId, paths, onRemove) {
    var el = document.getElementById(containerId);
    el.innerHTML = '';
    paths.forEach(function (p, i) {
      var box = document.createElement('div'); box.className = 'preview';
      var img = document.createElement('img'); img.src = '../' + p;
      box.appendChild(img);
      if (i === 0) { var n1 = document.createElement('span'); n1.className = 'n1'; n1.textContent = 'Vignette'; box.appendChild(n1); }
      var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.innerHTML = '&times;';
      rm.addEventListener('click', function () { onRemove(i); });
      box.appendChild(rm);
      el.appendChild(box);
    });
  }

  // ===================== segmenté Achat / Location / Vente =====================
  var instSectionId = 'achat';
  var rachatIcon = 'guitar';

  var SEG_HINTS = {
    achat: 'Le Store vend cet instrument — neuf ou d’occasion.',
    location: 'Il part en location, à l’heure ou à la journée.',
    vente: 'Un client vous le propose : ça rejoint « Ce que nous reprenons ».'
  };

  function syncInstFields() {
    var estRachat = instSectionId === 'vente';
    document.getElementById('instFieldsFiche').hidden = estRachat;
    document.getElementById('instFieldsRachat').hidden = !estRachat;
    document.getElementById('segHint').textContent = SEG_HINTS[instSectionId];
    if (!editingInst && !editingRachat) {
      document.getElementById('instTitle').textContent = estRachat ? 'Ajouter une reprise' : 'Ajouter un instrument';
      document.getElementById('instHint').textContent = estRachat
        ? 'Elle rejoint « Ce que nous reprenons », en tête de liste, sur la page Store.'
        : 'Il apparaîtra en tête de sa rubrique sur la page Store, avec ses photos et les boutons WhatsApp déjà préremplis.';
      document.getElementById('instSubmitLabel').textContent = estRachat ? 'Ajouter à la reprise' : 'Publier sur le site';
    }
  }

  document.querySelectorAll('#instSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (editingInst || editingRachat) return; // la rubrique d'une fiche existante ne se change pas ici
      document.querySelectorAll('#instSeg button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      instSectionId = b.dataset.val;
      syncInstFields();
    });
  });

  document.querySelectorAll('#rachatIcon button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#rachatIcon button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      rachatIcon = b.dataset.icon;
    });
  });

  function setInstSection(val) {
    instSectionId = val;
    document.querySelectorAll('#instSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.val === val); });
    syncInstFields();
  }
  function setRachatIcon(val) {
    rachatIcon = val;
    document.querySelectorAll('#rachatIcon button').forEach(function (b) { b.classList.toggle('on', b.dataset.icon === val); });
  }
  function lockInstSeg(lock) {
    document.getElementById('instSeg').classList.toggle('is-busy', lock);
    document.getElementById('instSegRow').style.opacity = lock ? '.55' : '';
  }

  // ===================== état de modification =====================
  var editingInst = null;   // { section, nom, vues:[...] } — fiche achat/location en cours d'édition
  var editingRachat = null; // { texte } — ligne de reprise en cours d'édition
  var editingEvt = null;    // { titre, img } — événement en cours d'édition
  var instExistingVues = [];
  var evtExistingImg = null;

  function resetInstForm() {
    document.getElementById('instForm').reset();
    instFiles.reset();
    setInstSection('achat');
    setRachatIcon('guitar');
    lockInstSeg(false);
    editingInst = null; editingRachat = null; instExistingVues = [];
    renderExistingChips('instExisting', [], function () {});
    document.getElementById('instEditBanner').hidden = true;
    document.getElementById('instTitle').textContent = 'Ajouter un instrument';
    document.getElementById('instHint').textContent = 'Il apparaîtra en tête de sa rubrique sur la page Store, avec ses photos et les boutons WhatsApp déjà préremplis.';
    document.getElementById('instSubmitLabel').textContent = 'Publier sur le site';
  }

  function resetEvtForm() {
    document.getElementById('evtForm').reset();
    document.getElementById('evtTag').value = 'À venir';
    document.getElementById('evtEtat').value = 'Coming soon — date, lieu et programmation à venir.';
    document.getElementById('evtBouton').value = 'Être prévenu';
    evtFiles.reset();
    editingEvt = null; evtExistingImg = null;
    renderExistingChips('evtExisting', [], function () {});
    document.getElementById('evtEditBanner').hidden = true;
    document.getElementById('evtTitleLabel').textContent = 'Annoncer un événement';
    document.getElementById('evtHint').textContent = 'Il rejoint « Prestations internes » sur la page Events, en tête — au-dessus des précédents.';
    document.getElementById('evtSubmitLabel').textContent = 'Publier sur le site';
  }

  document.getElementById('instCancelEdit').addEventListener('click', resetInstForm);
  document.getElementById('evtCancelEdit').addEventListener('click', resetEvtForm);

  // ===================== repérer un bloc existant dans le HTML frais =====================

  // un <article> ne contient jamais un autre <article> : un non-glouton suffit
  function locateArticle(html, sectionId, nom) {
    var secIdx = html.indexOf('id="' + sectionId + '"');
    if (secIdx < 0) return null;
    var secEnd = html.indexOf('</section>', secIdx);
    var zone = html.slice(secIdx, secEnd);
    var re = /<article class="reveal"[^>]*>[\s\S]*?<\/article>/g;
    var m, nomEsc = escHtml(nom);
    while ((m = re.exec(zone))) {
      if (m[0].indexOf('<h3>' + nomEsc + '</h3>') !== -1) {
        return { start: secIdx + m.index, end: secIdx + m.index + m[0].length, html: m[0] };
      }
    }
    return null;
  }

  function locateRachatLi(html, texte) {
    var secIdx = html.indexOf('id="vente"');
    if (secIdx < 0) return null;
    var ulIdx = html.indexOf('<ul>', secIdx);
    var ulEnd = html.indexOf('</ul>', ulIdx);
    var zone = html.slice(ulIdx, ulEnd);
    var re = /<li>[\s\S]*?<\/li>/g;
    var m, texteEsc = escHtml(texte);
    while ((m = re.exec(zone))) {
      if (m[0].indexOf('>' + texteEsc + '</li>') !== -1) {
        return { start: ulIdx + m.index, end: ulIdx + m.index + m[0].length, html: m[0] };
      }
    }
    return null;
  }

  // l'unique niveau imbriqué (.aff-texte) ferme juste avant .ev-affiche :
  // deux </div> consécutifs marquent donc la vraie fin du bloc.
  function locateEvAffiche(html, titre) {
    var secIdx = html.indexOf('id="internes"');
    if (secIdx < 0) return null;
    var secEnd = html.indexOf('</section>', secIdx);
    var zone = html.slice(secIdx, secEnd);
    var re = /<div class="ev-affiche">[\s\S]*?<\/div>\s*<\/div>/g;
    var m, titreEsc = escHtml(titre);
    while ((m = re.exec(zone))) {
      if (m[0].indexOf('<h3>' + titreEsc + '</h3>') !== -1) {
        return { start: secIdx + m.index, end: secIdx + m.index + m[0].length, html: m[0] };
      }
    }
    return null;
  }

  function keepDelay(blocHtml) {
    var m = /--d:(\d+)ms/.exec(blocHtml);
    return m ? m[1] : '0';
  }

  // ===================== construction du balisage =====================

  function buildFicheArticle(nom, cat, ref, section, vues, delayMs) {
    var nomEsc = escHtml(nom), catEsc = escHtml(cat), refEsc = escHtml(ref);
    var acts;
    if (section === 'achat') {
      acts = '<a href="' + waLink('Bonjour REATM Store, je suis intéressé(e) par : ' + nom + ' (en vente). Est-il encore disponible ?') + '" target="_blank" rel="noopener">Acheter</a>' +
             '<a href="' + waLink('Bonjour REATM Store, pouvez-vous me donner le prix de : ' + nom + ' ?') + '" target="_blank" rel="noopener">Demander le prix</a>';
    } else {
      acts = '<a href="' + waLink('Bonjour REATM Store, je souhaite louer : ' + nom + '. Quelles sont vos disponibilités ?') + '" target="_blank" rel="noopener">Louer</a>' +
             '<a href="' + waLink('Bonjour REATM Store, je souhaite un devis pour la location de : ' + nom + '.') + '" target="_blank" rel="noopener">Demander un devis</a>';
    }
    var shot;
    if (vues.length > 1) {
      var joined = vues.map(function (p) { return '../' + p; }).join('|');
      shot = '<button class="shot" type="button" data-nom="' + nomEsc + '" data-vues="' + joined + '" aria-label="Voir les ' + vues.length + ' vues de ' + nomEsc + '">' +
             '<div class="im" style="background-image:url(\'../' + vues[0] + '\')"></div>' +
             '<span class="avail">Disponible</span><span class="vues-n">' + vues.length + ' vues</span></button>';
    } else {
      shot = '<div class="shot"><div class="im" style="background-image:url(\'../' + vues[0] + '\')"></div><span class="avail">Disponible</span></div>';
    }
    return '<article class="reveal" style="--d:' + (delayMs || '0') + 'ms">' + shot +
      '<div class="body"><span class="cat">' + catEsc + '</span><h3>' + nomEsc + '</h3>' +
      '<div class="ref">' + refEsc + '</div><div class="acts">' + acts + '</div></div></article>';
  }

  function buildRachatLi(texte, icone) {
    return '<li><i class="fas fa-' + icone + '" aria-hidden="true"></i>' + escHtml(texte) + '</li>';
  }

  function buildEvAffiche(titre, tag, etat, desc, boutonTxt, imgPath, delayMs) {
    var titreEsc = escHtml(titre), tagEsc = escHtml(tag), etatEsc = escHtml(etat), descEsc = escHtml(desc), boutonEsc = escHtml(boutonTxt);
    var message = 'Bonjour REATM Events, prévenez-moi dès que la date de ' + titre + ' est fixée.';
    return '<div class="ev-affiche">' +
      '<figure class="aff-vue reveal"><img src="../' + imgPath + '" alt="' + titreEsc + '" loading="lazy" decoding="async"/></figure>' +
      '<div class="aff-texte reveal" style="--d:' + (delayMs || '90') + 'ms"><span class="tagline">' + tagEsc + '</span><h3>' + titreEsc + '</h3>' +
      '<p>' + descEsc + '</p>' +
      (etatEsc ? '<p class="aff-etat"><span class="pt" aria-hidden="true"></span>' + etatEsc + '</p>' : '') +
      '<a class="btn btn-acc" href="' + waLink(message) + '" target="_blank" rel="noopener">' + boutonEsc + ' <i class="fas fa-arrow-right"></i></a>' +
      '</div></div>';
  }

  // ===================== formulaire : fiche (ajout OU modification) =====================

  function publierFiche() {
    var nom = document.getElementById('instNom').value.trim();
    var cat = document.getElementById('instCat').value.trim();
    var ref = document.getElementById('instRef').value.trim();
    var nouvelles = instFiles.get();
    var totalPhotos = instExistingVues.length + nouvelles.length;
    if (!nom || !cat || !ref) { toast('err', 'Remplissez le nom, la catégorie et le détail.'); return null; }
    if (!totalPhotos) { toast('err', 'Gardez ou ajoutez au moins une photo.'); return null; }

    var section = instSectionId;
    var modif = editingInst;
    var slug = slugify(nom);

    return uploadSeries(nouvelles, slug).then(function (nouvellesVues) {
      var vues = instExistingVues.concat(nouvellesVues);
      return withFileLock('store/index.html', function () {
        return ghGetFile('store/index.html').then(function (file) {
          var html = file.text, bloc, delay = '0', retirees = [];
          if (modif) {
            var loc = locateArticle(html, modif.section, modif.nom);
            if (!loc) throw new Error('Cette fiche n’a pas été retrouvée : elle a peut-être déjà été modifiée ailleurs.');
            delay = keepDelay(loc.html);
            retirees = modif.vues.filter(function (v) { return instExistingVues.indexOf(v) === -1; });
            bloc = buildFicheArticle(nom, cat, ref, section, vues, delay);
            html = html.slice(0, loc.start) + bloc + html.slice(loc.end);
          } else {
            bloc = buildFicheArticle(nom, cat, ref, section, vues, '0');
            var secIdx = html.indexOf('id="' + section + '"');
            if (secIdx < 0) throw new Error('Rubrique #' + section + ' introuvable dans store/index.html.');
            var prodIdx = html.indexOf('<div class="prod">', secIdx);
            if (prodIdx < 0) throw new Error('Grille de fiches introuvable dans #' + section + '.');
            var at = prodIdx + '<div class="prod">'.length;
            html = html.slice(0, at) + bloc + html.slice(at);
          }
          var msg = modif ? 'Admin : modifie ' + nom : 'Admin : ajoute ' + nom + ' (' + section + ')';
          return ghPutFile('store/index.html', html, file.sha, msg).then(function () { return retirees; });
        });
      });
    }).then(function (retirees) {
      if (retirees && retirees.length) ghDeleteFilesQuiet(retirees, 'Admin : retire une photo remplacée de ' + nom);
      logRow('ok', nom, modif ? 'modifié' : (section === 'achat' ? 'en vente' : 'en location'));
      toast('ok', '« ' + nom + ' » ' + (modif ? 'a été mis à jour.' : 'est en ligne.'));
      resetInstForm();
      loadCatalogue();
    }).catch(function (err) { logRow('err', nom, err.message); toast('err', err.message); });
  }

  function publierRachat() {
    var texte = document.getElementById('rachatTexte').value.trim();
    if (!texte) { toast('err', 'Décrivez ce que vous reprenez.'); return null; }
    var modif = editingRachat;

    return withFileLock('store/index.html', function () {
      return ghGetFile('store/index.html').then(function (file) {
        var html = file.text;
        var li = buildRachatLi(texte, rachatIcon);
        if (modif) {
          var loc = locateRachatLi(html, modif.texte);
          if (!loc) throw new Error('Cette reprise n’a pas été retrouvée : elle a peut-être déjà été modifiée ailleurs.');
          html = html.slice(0, loc.start) + li + html.slice(loc.end);
        } else {
          var secIdx = html.indexOf('id="vente"');
          if (secIdx < 0) throw new Error('Rubrique Vente introuvable dans store/index.html.');
          var ulIdx = html.indexOf('<ul>', secIdx);
          if (ulIdx < 0) throw new Error('Liste « Ce que nous reprenons » introuvable.');
          var at = ulIdx + '<ul>'.length;
          html = html.slice(0, at) + '\n' + li + html.slice(at);
        }
        var msg = modif ? 'Admin : modifie la reprise « ' + texte + ' »' : 'Admin : ajoute « ' + texte + ' » à la reprise';
        return ghPutFile('store/index.html', html, file.sha, msg);
      });
    })
      .then(function () {
        logRow('ok', texte, modif ? 'reprise modifiée' : 'ajoutée à la reprise');
        toast('ok', '« ' + texte + ' » ' + (modif ? 'mise à jour.' : 'rejoint la reprise.'));
        resetInstForm();
        loadCatalogue();
      })
      .catch(function (err) { logRow('err', texte, err.message); toast('err', err.message); });
  }

  document.getElementById('instForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('instSubmit');
    var tache = instSectionId === 'vente' ? publierRachat() : publierFiche();
    if (!tache) return;
    btn.classList.add('is-loading'); btn.disabled = true;
    tache.finally(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  });

  // ===================== modifier / supprimer une fiche ou une reprise =====================

  function entrerEditionFiche(row) {
    resetInstForm();
    editingInst = { section: row.section, nom: row.nom, vues: row.vues.slice() };
    instExistingVues = row.vues.slice();
    setInstSection(row.section);
    lockInstSeg(true);
    document.getElementById('instNom').value = row.nom;
    document.getElementById('instCat').value = row.cat;
    document.getElementById('instRef').value = row.ref;
    function retirer(i) {
      instExistingVues.splice(i, 1);
      renderExistingChips('instExisting', instExistingVues, retirer);
    }
    renderExistingChips('instExisting', instExistingVues, retirer);
    document.getElementById('instEditBanner').hidden = false;
    document.getElementById('instEditNom').textContent = row.nom;
    document.getElementById('instTitle').textContent = 'Modifier cet instrument';
    document.getElementById('instHint').textContent = 'Les modifications remplacent la fiche en place, sans changer sa position.';
    document.getElementById('instSubmitLabel').textContent = 'Enregistrer les modifications';
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function entrerEditionRachat(row) {
    resetInstForm();
    editingRachat = { texte: row.nom };
    setInstSection('vente');
    lockInstSeg(true);
    document.getElementById('rachatTexte').value = row.nom;
    setRachatIcon(row.icone || 'guitar');
    document.getElementById('instEditBanner').hidden = false;
    document.getElementById('instEditNom').textContent = row.nom;
    document.getElementById('instTitle').textContent = 'Modifier cette reprise';
    document.getElementById('instHint').textContent = 'La ligne est remplacée en place dans « Ce que nous reprenons ».';
    document.getElementById('instSubmitLabel').textContent = 'Enregistrer les modifications';
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function supprimerFiche(row) {
    return withFileLock('store/index.html', function () {
      return ghGetFile('store/index.html').then(function (file) {
        var html = file.text;
        var loc = locateArticle(html, row.section, row.nom);
        if (!loc) throw new Error('Fiche introuvable — elle a peut-être déjà été retirée.');
        html = html.slice(0, loc.start) + html.slice(loc.end);
        return ghPutFile('store/index.html', html, file.sha, 'Admin : supprime ' + row.nom);
      });
    }).then(function () {
      if (row.vues && row.vues.length) ghDeleteFilesQuiet(row.vues, 'Admin : nettoie les photos de ' + row.nom);
      logRow('ok', row.nom, 'supprimé');
      toast('ok', '« ' + row.nom + ' » a été retiré.');
      loadCatalogue();
    }).catch(function (err) { logRow('err', row.nom, err.message); toast('err', err.message); });
  }

  function supprimerRachat(row) {
    return withFileLock('store/index.html', function () {
      return ghGetFile('store/index.html').then(function (file) {
        var html = file.text;
        var loc = locateRachatLi(html, row.nom);
        if (!loc) throw new Error('Reprise introuvable — elle a peut-être déjà été retirée.');
        html = html.slice(0, loc.start) + html.slice(loc.end);
        return ghPutFile('store/index.html', html, file.sha, 'Admin : supprime la reprise « ' + row.nom + ' »');
      });
    }).then(function () {
      logRow('ok', row.nom, 'reprise retirée');
      toast('ok', '« ' + row.nom + ' » a été retiré de la reprise.');
      loadCatalogue();
    }).catch(function (err) { logRow('err', row.nom, err.message); toast('err', err.message); });
  }

  // un clic arme la confirmation (4 s), le second déclenche l'action —
  // une suppression ne doit jamais partir d'un seul clic accidentel.
  var SVG_TRASH = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function armerConfirmation(btn, onConfirm) {
    if (btn.classList.contains('confirm')) {
      clearTimeout(btn._timer);
      btn.disabled = true;
      onConfirm().finally(function () { btn.disabled = false; });
      return;
    }
    btn.classList.add('confirm');
    btn.innerHTML = 'Confirmer ?';
    btn._timer = setTimeout(function () { btn.classList.remove('confirm'); btn.innerHTML = SVG_TRASH; }, 4000);
  }

  // ===================== formulaire : événement (ajout OU modification) =====================

  document.getElementById('evtForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('evtSubmit');
    var titre = document.getElementById('evtTitre').value.trim();
    var tag = document.getElementById('evtTag').value.trim() || 'À venir';
    var etat = document.getElementById('evtEtat').value.trim();
    var desc = document.getElementById('evtDesc').value.trim();
    var boutonTxt = document.getElementById('evtBouton').value.trim() || 'Être prévenu';
    var nouvelles = evtFiles.get();
    var modif = editingEvt;

    if (!titre || !desc) { toast('err', 'Donnez au moins un titre et une description.'); return; }
    if (!evtExistingImg && !nouvelles.length) { toast('err', 'Ajoutez une affiche.'); return; }

    btn.classList.add('is-loading'); btn.disabled = true;
    var slug = slugify(titre);
    var ancienneImg = modif ? modif.img : null;

    (nouvelles.length ? publishImage(nouvelles[0], slug, '') : Promise.resolve(evtExistingImg))
      .then(function (imgPath) {
        return withFileLock('events/index.html', function () {
          return ghGetFile('events/index.html').then(function (file) {
            var html = file.text, delay = '90';
            var bloc;
            if (modif) {
              var loc = locateEvAffiche(html, modif.titre);
              if (!loc) throw new Error('Cet événement n’a pas été retrouvé : il a peut-être déjà été modifié ailleurs.');
              delay = keepDelay(loc.html);
              bloc = buildEvAffiche(titre, tag, etat, desc, boutonTxt, imgPath, delay);
              html = html.slice(0, loc.start) + bloc + html.slice(loc.end);
            } else {
              bloc = buildEvAffiche(titre, tag, etat, desc, boutonTxt, imgPath, '90');
              var secIdx = html.indexOf('id="internes"');
              if (secIdx < 0) throw new Error('Rubrique « Prestations internes » introuvable.');
              var at = html.indexOf('<div class="ev-affiche">', secIdx);
              if (at < 0) throw new Error('Emplacement d’insertion introuvable dans events/index.html.');
              html = html.slice(0, at) + bloc + '\n' + html.slice(at);
            }
            var msg = modif ? 'Admin : modifie l’événement ' + titre : 'Admin : ajoute l’événement ' + titre;
            return ghPutFile('events/index.html', html, file.sha, msg).then(function () { return imgPath; });
          });
        });
      })
      .then(function (imgPath) {
        if (ancienneImg && ancienneImg !== imgPath) ghDeleteFileQuiet(ancienneImg, 'Admin : retire l’ancienne affiche de ' + titre);
        logRow('ok', titre, modif ? 'événement modifié' : 'événement publié');
        toast('ok', '« ' + titre + ' » ' + (modif ? 'a été mis à jour.' : 'est en ligne.'));
        resetEvtForm();
        loadEvents();
      })
      .catch(function (err) {
        logRow('err', titre, err.message);
        toast('err', err.message);
      })
      .finally(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  });

  function entrerEditionEvt(row) {
    resetEvtForm();
    editingEvt = { titre: row.nom, img: row.img };
    evtExistingImg = row.img;
    document.getElementById('evtTitre').value = row.nom;
    document.getElementById('evtTag').value = row.tag || '';
    document.getElementById('evtEtat').value = row.etat || '';
    document.getElementById('evtDesc').value = row.desc || '';
    document.getElementById('evtBouton').value = row.bouton || 'Être prévenu';
    function retirer() { evtExistingImg = null; renderExistingChips('evtExisting', [], retirer); }
    renderExistingChips('evtExisting', row.img ? [row.img] : [], retirer);
    document.getElementById('evtEditBanner').hidden = false;
    document.getElementById('evtEditNom').textContent = row.nom;
    document.getElementById('evtTitleLabel').textContent = 'Modifier cet événement';
    document.getElementById('evtHint').textContent = 'Les modifications remplacent l’annonce en place, sans changer sa position.';
    document.getElementById('evtSubmitLabel').textContent = 'Enregistrer les modifications';
    document.querySelectorAll('.card')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function supprimerEvt(row) {
    return withFileLock('events/index.html', function () {
      return ghGetFile('events/index.html').then(function (file) {
        var html = file.text;
        var loc = locateEvAffiche(html, row.nom);
        if (!loc) throw new Error('Événement introuvable — il a peut-être déjà été retiré.');
        html = html.slice(0, loc.start) + html.slice(loc.end);
        return ghPutFile('events/index.html', html, file.sha, 'Admin : supprime l’événement ' + row.nom);
      });
    }).then(function () {
      if (row.img) ghDeleteFileQuiet(row.img, 'Admin : nettoie l’affiche de ' + row.nom);
      logRow('ok', row.nom, 'événement retiré');
      toast('ok', '« ' + row.nom + ' » a été retiré.');
      loadEvents();
    }).catch(function (err) { logRow('err', row.nom, err.message); toast('err', err.message); });
  }

  // ===================== catalogue existant : instruments + reprises =====================

  function iconeBouton(titre) {
    return '<button type="button" class="edit" title="Modifier ' + titre + '" aria-label="Modifier ' + titre + '">' +
      '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button>' +
      '<button type="button" class="del" title="Supprimer ' + titre + '" aria-label="Supprimer ' + titre + '">' + SVG_TRASH + '</button>';
  }

  function loadCatalogue() {
    var list = document.getElementById('instList');
    ghGetFile('store/index.html').then(function (file) {
      var doc = new DOMParser().parseFromString(file.text, 'text/html');
      var rows = [];
      [['achat', 'Achat'], ['location', 'Location']].forEach(function (pair) {
        var section = doc.getElementById(pair[0]);
        if (!section) return;
        section.querySelectorAll('.prod article').forEach(function (art) {
          var h3 = art.querySelector('h3'), cat = art.querySelector('.cat'), ref = art.querySelector('.ref'), im = art.querySelector('.im');
          var bg = im ? im.getAttribute('style').match(/url\(['"]?([^'")]+)/) : null;
          var vuesAttr = art.querySelector('[data-vues]');
          var vues = vuesAttr ? vuesAttr.getAttribute('data-vues').split('|') : (bg ? [bg[1]] : []);
          // le fichier stocke des chemins relatifs à store/ ('../assets/...') ; en interne
          // (comparaisons, envoi à GitHub) on ne manipule que des chemins relatifs au dépôt.
          vues = vues.map(function (v) { return v.replace(/^\.\.\//, ''); });
          rows.push({
            type: 'fiche', section: pair[0], tag: pair[1],
            nom: h3 ? h3.textContent : '—', cat: cat ? cat.textContent : '', ref: ref ? ref.textContent : '',
            img: vues[0] || '', vues: vues
          });
        });
      });
      var rachat = doc.querySelector('#vente .rc-liste ul');
      if (rachat) {
        rachat.querySelectorAll('li').forEach(function (li) {
          var i = li.querySelector('i');
          rows.push({ type: 'rachat', tag: 'Vente', nom: li.textContent.trim(), cat: 'Reprise', icone: i ? i.className.replace('fas fa-', '').trim() : 'music' });
        });
      }
      list.innerHTML = '';
      if (!rows.length) { list.innerHTML = '<div class="cat-loading">Catalogue vide.</div>'; return; }
      rows.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'cat-item';
        var vignette = r.type === 'rachat'
          ? '<span class="th th-icon"><i class="fas fa-' + r.icone + '"></i></span>'
          : '<span class="th" style="background-image:url(\'../' + r.img + '\')"></span>';
        row.innerHTML = vignette + '<span class="tx"><b></b><span></span></span><span class="tag"></span><span class="acts2"></span>';
        row.querySelector('.tx b').textContent = r.nom;
        row.querySelector('.tx span').textContent = r.cat;
        row.querySelector('.tag').textContent = r.tag;
        row.querySelector('.acts2').innerHTML = iconeBouton(r.nom);
        row.querySelector('.acts2 .edit').addEventListener('click', function () {
          if (r.type === 'rachat') entrerEditionRachat(r); else entrerEditionFiche(r);
        });
        row.querySelector('.acts2 .del').addEventListener('click', function (e) {
          armerConfirmation(e.currentTarget, function () {
            row.classList.add('is-busy');
            return r.type === 'rachat' ? supprimerRachat(r) : supprimerFiche(r);
          });
        });
        list.appendChild(row);
      });
    }).catch(function (err) {
      list.innerHTML = '<div class="cat-loading">Lecture impossible : ' + escHtml(err.message) + '</div>';
    });
  }

  // ===================== catalogue existant : événements =====================

  function loadEvents() {
    var list = document.getElementById('evtList');
    ghGetFile('events/index.html').then(function (file) {
      var doc = new DOMParser().parseFromString(file.text, 'text/html');
      var rows = [];
      var section = doc.getElementById('internes');
      if (section) {
        section.querySelectorAll('.ev-affiche').forEach(function (bloc) {
          var h3 = bloc.querySelector('h3'), tagEl = bloc.querySelector('.tagline'), p = bloc.querySelector('p:not(.aff-etat)');
          var etat = bloc.querySelector('.aff-etat'), btn = bloc.querySelector('.btn-acc'), img = bloc.querySelector('img');
          rows.push({
            nom: h3 ? h3.textContent : '—', tag: tagEl ? tagEl.textContent : '', desc: p ? p.textContent : '',
            etat: etat ? etat.textContent.trim() : '', bouton: btn ? btn.textContent.trim() : '',
            img: img ? img.getAttribute('src').replace(/^\.\.\//, '') : ''
          });
        });
      }
      list.innerHTML = '';
      if (!rows.length) { list.innerHTML = '<div class="cat-loading">Aucun événement.</div>'; return; }
      rows.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'cat-item';
        row.innerHTML = '<span class="th" style="background-image:url(\'../' + r.img + '\')"></span>' +
          '<span class="tx"><b></b><span></span></span><span class="acts2"></span>';
        row.querySelector('.tx b').textContent = r.nom;
        row.querySelector('.tx span').textContent = r.tag;
        row.querySelector('.acts2').innerHTML = iconeBouton(r.nom);
        row.querySelector('.acts2 .edit').addEventListener('click', function () { entrerEditionEvt(r); });
        row.querySelector('.acts2 .del').addEventListener('click', function (e) {
          armerConfirmation(e.currentTarget, function () { row.classList.add('is-busy'); return supprimerEvt(r); });
        });
        list.appendChild(row);
      });
    }).catch(function (err) {
      list.innerHTML = '<div class="cat-loading">Lecture impossible : ' + escHtml(err.message) + '</div>';
    });
  }

  syncInstFields();
})();
