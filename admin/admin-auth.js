(function(){
  'use strict';

  /* ===== Identifiants provisoires =====
     Codés en dur le temps que la vraie authentification (PHP, côté
     serveur) prenne le relais. Ce verrou est cosmétique : n'importe qui
     peut lire ce fichier. Ne rien mettre ici qui ait de la valeur. */
  var CREDENTIALS = { email: 'okamba42@gmail.com', password: '123456789' };

  var SESSION_KEY = 'reatm-admin-session';

  // déjà connecté (session ou « rester connecté ») : on saute l'écran
  if (sessionStorage.getItem(SESSION_KEY) === '1' || localStorage.getItem(SESSION_KEY) === '1') {
    location.replace('dashboard.html');
    return;
  }

  var eq = document.getElementById('eq');
  if (eq) {
    for (var i = 0; i < 46; i++) {
      var bar = document.createElement('i');
      bar.style.animationDelay = (-(Math.random() * 1.6)).toFixed(2) + 's';
      eq.appendChild(bar);
    }
  }

  // la carte suit discrètement le pointeur, comme la lumière des héros du site
  var card = document.querySelector('.login-card');
  var finePointer = matchMedia('(pointer:fine)').matches;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (card && finePointer && !reduce) {
    document.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = (e.clientX - cx) / r.width, dy = (e.clientY - cy) / r.height;
      card.style.transform = 'rotateY(' + (dx * 5).toFixed(2) + 'deg) rotateX(' + (-dy * 5).toFixed(2) + 'deg)';
    }, { passive: true });
    document.addEventListener('pointerleave', function () { card.style.transform = ''; });
  }

  var eyeBtn = document.getElementById('eyeBtn');
  var eyeIcon = document.getElementById('eyeIcon');
  var passInput = document.getElementById('loginPass');
  var EYE_OPEN = eyeIcon ? eyeIcon.innerHTML : '';
  var EYE_CLOSED = '<path d="M3 3l18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10.6 10.6a3 3 0 0 0 4.24 4.24M6.3 6.5C3.9 8 2 10.5 1 12c0 0 4-7 11-7 1.5 0 2.8.3 4 .8M21.6 15.2C20 17.6 16.6 19 12 19c-1 0-1.9-.1-2.7-.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  if (eyeBtn) {
    eyeBtn.addEventListener('click', function () {
      var show = passInput.type === 'password';
      passInput.type = show ? 'text' : 'password';
      eyeIcon.innerHTML = show ? EYE_CLOSED : EYE_OPEN;
      eyeBtn.setAttribute('aria-pressed', String(show));
      eyeBtn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  }

  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var errBox = document.getElementById('loginError');
  var errMsg = document.getElementById('loginErrorMsg');

  function setError(msg) {
    errMsg.textContent = msg;
    errBox.classList.add('show');
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    passInput.focus(); passInput.select();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (btn.classList.contains('is-loading') || btn.classList.contains('is-ok')) return;
    errBox.classList.remove('show');

    var email = document.getElementById('loginEmail').value.trim().toLowerCase();
    var pass = passInput.value;
    var remember = document.getElementById('rememberMe').checked;

    btn.classList.add('is-loading');
    btn.disabled = true;

    // un court délai donne de la consistance au geste, sans être une vraie
    // vérification réseau — il n'y en a pas, l'authentification est locale.
    setTimeout(function () {
      var ok = email === CREDENTIALS.email.toLowerCase() && pass === CREDENTIALS.password;
      if (!ok) {
        btn.classList.remove('is-loading');
        btn.disabled = false;
        setError('Identifiants incorrects. Vérifiez l’e-mail et le mot de passe.');
        return;
      }
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, '1');
      btn.classList.remove('is-loading');
      btn.classList.add('is-ok');
      setTimeout(function () { location.href = 'dashboard.html'; }, 500);
    }, 550);
  });
})();
