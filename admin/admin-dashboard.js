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
    return raw;
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
      var tag = Date.now().toString(36).slice(-5);
      var path = 'assets/' + slug + '-' + tag + (index ? '-' + index : '') + '.' + res.ext;
      return blobToBase64(res.blob).then(function (b64) {
        return ghPutImage(path, b64, 'Admin : ajoute la photo ' + path)
          .then(function () { return path; });
      });
    });
  }

  // ===================== porte d'accès (jeton) =====================

  var gate = document.getElementById('gate'), dash = document.getElementById('dash');
  var tokenInput = document.getElementById('tokenInput'), tokenSave = document.getElementById('tokenSave');
  var gateMsg = document.getElementById('gateMsg');

  function openDash() { gate.hidden = true; dash.hidden = false; loadCatalogue(); }

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
  if (savedToken) tryToken(savedToken, true).then(function () {
    if (gate.hidden !== true) { /* jeton invalide : la porte reste affichée */ }
  });

  // ===================== onglets =====================
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===================== dépose de fichiers : glisser-déposer + aperçus =====================

  function wireDrop(dropId, inputId, previewsId, multiple) {
    var drop = document.getElementById(dropId), input = document.getElementById(inputId);
    var previews = document.getElementById(previewsId);
    var files = [];

    function render() {
      previews.innerHTML = '';
      files.forEach(function (f, i) {
        var box = document.createElement('div'); box.className = 'preview';
        var img = document.createElement('img'); img.src = URL.createObjectURL(f);
        box.appendChild(img);
        if (i === 0) { var n1 = document.createElement('span'); n1.className = 'n1'; n1.textContent = 'Vignette'; box.appendChild(n1); }
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'rm'; rm.innerHTML = '&times;';
        rm.addEventListener('click', function () { files.splice(i, 1); render(); });
        box.appendChild(rm);
        previews.appendChild(box);
      });
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

  // ===================== rubrique : Achat / Location / Vente =====================

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
    document.getElementById('instTitle').textContent = estRachat ? 'Ajouter une reprise' : 'Ajouter un instrument';
    document.getElementById('instHint').textContent = estRachat
      ? 'Elle rejoint « Ce que nous reprenons », en tête de liste, sur la page Store.'
      : 'Il apparaîtra en tête de sa rubrique sur la page Store, avec ses photos et les boutons WhatsApp déjà préremplis.';
    document.getElementById('instSubmitLabel').textContent = estRachat ? 'Ajouter à la reprise' : 'Publier sur le site';
  }

  document.querySelectorAll('#instSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
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

  function resetInstForm() {
    document.getElementById('instForm').reset();
    instFiles.reset();
    setInstSection('achat');
    setRachatIcon('guitar');
  }

  // ===================== formulaire : fiche (achat / location) =====================

  function publierFiche(btn, rowWait) {
    var nom = document.getElementById('instNom').value.trim();
    var cat = document.getElementById('instCat').value.trim();
    var ref = document.getElementById('instRef').value.trim();
    var files = instFiles.get();
    if (!nom || !cat || !ref) { toast('err', 'Remplissez le nom, la catégorie et le détail.'); return null; }
    if (!files.length) { toast('err', 'Ajoutez au moins une photo.'); return null; }

    var slug = slugify(nom);
    var uploads = files.map(function (f, i) { return function () { return publishImage(f, slug, files.length > 1 ? i + 1 : ''); }; });
    return uploads.reduce(function (chain, step) {
      return chain.then(function (acc) { return step().then(function (path) { acc.push(path); return acc; }); });
    }, Promise.resolve([]))
      .then(function (vues) {
        return ghGetFile('store/index.html').then(function (file) {
          var html = file.text;
          var nomEsc = escHtml(nom), catEsc = escHtml(cat), refEsc = escHtml(ref);
          var acts;
          if (instSectionId === 'achat') {
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
          var article = '<article class="reveal" style="--d:0ms">' + shot +
            '<div class="body"><span class="cat">' + catEsc + '</span><h3>' + nomEsc + '</h3>' +
            '<div class="ref">' + refEsc + '</div><div class="acts">' + acts + '</div></div></article>';

          var secIdx = html.indexOf('id="' + instSectionId + '"');
          if (secIdx < 0) throw new Error('Rubrique #' + instSectionId + ' introuvable dans store/index.html.');
          var prodIdx = html.indexOf('<div class="prod">', secIdx);
          if (prodIdx < 0) throw new Error('Grille de fiches introuvable dans #' + instSectionId + '.');
          var at = prodIdx + '<div class="prod">'.length;
          html = html.slice(0, at) + article + html.slice(at);

          return ghPutFile('store/index.html', html, file.sha, 'Admin : ajoute ' + nom + ' (' + instSectionId + ')');
        });
      })
      .then(function () {
        logRow('ok', nom, instSectionId === 'achat' ? 'en vente' : 'en location');
        toast('ok', '« ' + nom + ' » est en ligne.');
        resetInstForm();
        loadCatalogue();
      })
      .catch(function (err) { logRow('err', nom, err.message); toast('err', err.message); });
  }

  // ===================== formulaire : reprise (vente) =====================

  function publierRachat(btn, rowWait) {
    var texte = document.getElementById('rachatTexte').value.trim();
    if (!texte) { toast('err', 'Décrivez ce que vous reprenez.'); return null; }

    return ghGetFile('store/index.html').then(function (file) {
      var html = file.text;
      var texteEsc = escHtml(texte);
      var li = '<li><i class="fas fa-' + rachatIcon + '" aria-hidden="true"></i>' + texteEsc + '</li>';

      var secIdx = html.indexOf('id="vente"');
      if (secIdx < 0) throw new Error('Rubrique Vente introuvable dans store/index.html.');
      var ulIdx = html.indexOf('<ul>', secIdx);
      if (ulIdx < 0) throw new Error('Liste « Ce que nous reprenons » introuvable.');
      var at = ulIdx + '<ul>'.length;
      html = html.slice(0, at) + '\n' + li + html.slice(at);

      return ghPutFile('store/index.html', html, file.sha, 'Admin : ajoute « ' + texte + ' » à la reprise');
    })
      .then(function () {
        logRow('ok', texte, 'ajouté à la reprise');
        toast('ok', '« ' + texte + ' » rejoint la reprise.');
        resetInstForm();
      })
      .catch(function (err) { logRow('err', texte, err.message); toast('err', err.message); });
  }

  document.getElementById('instForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('instSubmit');
    var libelle = instSectionId === 'vente' ? document.getElementById('rachatTexte').value.trim() : document.getElementById('instNom').value.trim();
    var rowWait = logRow('wait', libelle || '…', 'publication en cours…');
    var tache = instSectionId === 'vente' ? publierRachat(btn, rowWait) : publierFiche(btn, rowWait);
    if (!tache) { rowWait.remove(); return; }
    btn.classList.add('is-loading'); btn.disabled = true;
    tache.finally(function () { rowWait.remove(); btn.classList.remove('is-loading'); btn.disabled = false; });
  });

  // ===================== formulaire : nouvel événement =====================

  document.getElementById('evtForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = document.getElementById('evtSubmit');
    var titre = document.getElementById('evtTitre').value.trim();
    var tag = document.getElementById('evtTag').value.trim() || 'À venir';
    var etat = document.getElementById('evtEtat').value.trim();
    var desc = document.getElementById('evtDesc').value.trim();
    var boutonTxt = document.getElementById('evtBouton').value.trim() || 'Être prévenu';
    var files = evtFiles.get();
    if (!titre || !desc) { toast('err', 'Donnez au moins un titre et une description.'); return; }
    if (!files.length) { toast('err', 'Ajoutez une affiche.'); return; }

    btn.classList.add('is-loading'); btn.disabled = true;
    var slug = slugify(titre);
    var rowWait = logRow('wait', titre, 'publication en cours…');

    publishImage(files[0], slug, '')
      .then(function (chemin) {
        return ghGetFile('events/index.html').then(function (file) {
          var html = file.text;
          var titreEsc = escHtml(titre), tagEsc = escHtml(tag), etatEsc = escHtml(etat), descEsc = escHtml(desc), boutonEsc = escHtml(boutonTxt);
          var message = 'Bonjour REATM Events, prévenez-moi dès que la date de ' + titre + ' est fixée.';
          var bloc = '<div class="ev-affiche">' +
            '<figure class="aff-vue reveal"><img src="../' + chemin + '" alt="' + titreEsc + '" loading="lazy" decoding="async"/></figure>' +
            '<div class="aff-texte reveal" style="--d:90ms"><span class="tagline">' + tagEsc + '</span><h3>' + titreEsc + '</h3>' +
            '<p>' + descEsc + '</p>' +
            (etatEsc ? '<p class="aff-etat"><span class="pt" aria-hidden="true"></span>' + etatEsc + '</p>' : '') +
            '<a class="btn btn-acc" href="' + waLink(message) + '" target="_blank" rel="noopener">' + boutonEsc + ' <i class="fas fa-arrow-right"></i></a>' +
            '</div></div>';

          var secIdx = html.indexOf('id="internes"');
          if (secIdx < 0) throw new Error('Rubrique « Prestations internes » introuvable.');
          var at = html.indexOf('<div class="ev-affiche">', secIdx);
          if (at < 0) throw new Error('Emplacement d’insertion introuvable dans events/index.html.');
          html = html.slice(0, at) + bloc + '\n' + html.slice(at);

          return ghPutFile('events/index.html', html, file.sha, 'Admin : ajoute l’événement ' + titre);
        });
      })
      .then(function () {
        rowWait.remove();
        logRow('ok', titre, 'événement publié');
        toast('ok', '« ' + titre + ' » est en ligne.');
        document.getElementById('evtForm').reset();
        document.getElementById('evtTag').value = 'À venir';
        document.getElementById('evtEtat').value = 'Coming soon — date, lieu et programmation à venir.';
        document.getElementById('evtBouton').value = 'Être prévenu';
        evtFiles.reset();
      })
      .catch(function (err) {
        rowWait.remove();
        logRow('err', titre, err.message);
        toast('err', err.message);
      })
      .finally(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  });

  // ===================== catalogue existant (lecture seule) =====================

  function loadCatalogue() {
    var list = document.getElementById('instList');
    ghGetFile('store/index.html').then(function (file) {
      var doc = new DOMParser().parseFromString(file.text, 'text/html');
      var rows = [];
      // les deux rubriques à fiches : chacune garde son vrai nom
      [['achat', 'Achat'], ['location', 'Location']].forEach(function (pair) {
        var section = doc.getElementById(pair[0]);
        if (!section) return;
        section.querySelectorAll('.prod article').forEach(function (art) {
          var h3 = art.querySelector('h3'), cat = art.querySelector('.cat'), im = art.querySelector('.im');
          var bg = im ? im.getAttribute('style').match(/url\(['"]?([^'")]+)/) : null;
          rows.push({
            nom: h3 ? h3.textContent : '—',
            cat: cat ? cat.textContent : '',
            tag: pair[1],
            // admin/ et store/ sont au même niveau sous la racine : le chemin
            // relatif à store/index.html ('../assets/...') vaut aussi tel quel ici
            img: bg ? bg[1] : '',
            icone: null
          });
        });
      });
      // la rubrique Vente n'a pas de fiches, mais une liste de ce qui est repris
      var rachat = doc.querySelector('#vente .rc-liste ul');
      if (rachat) {
        rachat.querySelectorAll('li').forEach(function (li) {
          var i = li.querySelector('i');
          rows.push({
            nom: li.textContent.trim(), cat: 'Reprise', tag: 'Vente',
            img: '', icone: i ? i.className.replace('fas fa-', '').trim() : 'music'
          });
        });
      }
      list.innerHTML = '';
      if (!rows.length) { list.innerHTML = '<div class="cat-loading">Catalogue vide.</div>'; return; }
      rows.forEach(function (r) {
        var row = document.createElement('div'); row.className = 'cat-item';
        var vignette = r.icone
          ? '<span class="th th-icon"><i class="fas fa-' + r.icone + '"></i></span>'
          : '<span class="th" style="background-image:url(\'' + r.img + '\')"></span>';
        row.innerHTML = vignette + '<span class="tx"><b></b><span></span></span><span class="tag"></span>';
        row.querySelector('.tx b').textContent = r.nom;
        row.querySelector('.tx span').textContent = r.cat;
        row.querySelector('.tag').textContent = r.tag;
        list.appendChild(row);
      });
    }).catch(function (err) {
      list.innerHTML = '<div class="cat-loading">Lecture impossible : ' + escHtml(err.message) + '</div>';
    });
  }

  syncInstFields();
})();
