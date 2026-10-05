(function(){
  'use strict';
  var root=document.documentElement;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Thème clair / sombre ---------- */
  var btn=document.getElementById('themeToggle');
  var icon=btn.querySelector('#themeIcon use');
  var meta=document.getElementById('metaTheme');
  function apply(t){
    root.setAttribute('data-theme',t);
    icon.setAttribute('href',(t==='dark')?'#ic-sun':'#ic-moon');
    if(meta) meta.setAttribute('content',t==='dark'?'#000000':'#ffffff');
  }
  /* Une page peut imposer son thème : elle porte alors data-theme-lock.
     La préférence enregistrée n'est ni lue ni modifiée, et le bouton de
     bascule est retiré puisqu'il n'aurait aucun effet. */
  var verrou=root.getAttribute('data-theme-lock');
  if(verrou){
    apply(verrou);
    if(btn&&btn.parentNode)btn.parentNode.removeChild(btn);
  }else{
    var saved='light';
    try{saved=localStorage.getItem('reatm-theme')||'light';}catch(e){}
    apply(saved);
    btn.addEventListener('click',function(){
      var next=root.getAttribute('data-theme')==='dark'?'light':'dark';
      apply(next);
      try{localStorage.setItem('reatm-theme',next);}catch(e){}
      btn.classList.remove('spin');void btn.offsetWidth;btn.classList.add('spin');
    });
  }

  /* ---------- Menu hamburger plein écran ---------- */
  var burger=document.getElementById('burger');
  var panel=document.getElementById('mobileNav');
  var lastFocus=null;

  function focusables(){
    return [burger].concat(Array.prototype.slice.call(
      panel.querySelectorAll('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')
    ));
  }
  function openNav(){
    lastFocus=document.activeElement;
    burger.classList.add('open');
    burger.setAttribute('aria-expanded','true');
    burger.setAttribute('aria-label','Fermer le menu');
    panel.classList.add('open');
    panel.setAttribute('aria-hidden','false');
    document.body.classList.add('no-scroll');
  }
  function closeNav(){
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded','false');
    burger.setAttribute('aria-label','Ouvrir le menu');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    document.body.classList.remove('no-scroll');
    if(lastFocus&&lastFocus.focus)lastFocus.focus();
  }
  function isOpen(){return panel.classList.contains('open');}
  burger.addEventListener('click',function(){isOpen()?closeNav():openNav();});
  panel.querySelectorAll('a[href]').forEach(function(a){
    a.addEventListener('click',function(){if(a.getAttribute('href').charAt(0)==='#')closeNav();});
  });
  document.addEventListener('keydown',function(e){
    if(!isOpen())return;
    if(e.key==='Escape'){closeNav();return;}
    if(e.key==='Tab'){
      var f=focusables();
      if(!f.length)return;
      var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  var mq=window.matchMedia('(min-width:1081px)');
  function onBreak(){if(mq.matches&&isOpen())closeNav();}
  if(mq.addEventListener)mq.addEventListener('change',onBreak);
  else if(mq.addListener)mq.addListener(onBreak);

  /* ---------- Header au défilement + barre de progression + bouton flottant ---------- */
  var header=document.getElementById('header');
  var bar=document.getElementById('progressBar');
  var fab=document.getElementById('fab');
  var heroImg=document.querySelector('.hero-media .ph');
  var ticking=false;
  function onScroll(){
    var y=window.pageYOffset||document.documentElement.scrollTop;
    if(header)header.classList.toggle('scrolled',y>12);
    if(fab)fab.classList.toggle('show',y>600);
    var h=document.documentElement.scrollHeight-window.innerHeight;
    if(bar)bar.style.width=(h>0?Math.min(100,(y/h)*100):0)+'%';
    if(heroImg&&!reduce)heroImg.style.setProperty('--par',(Math.min(y,520)*0.07).toFixed(1)+'px');
    ticking=false;
  }
  window.addEventListener('scroll',function(){
    if(!ticking){ticking=true;window.requestAnimationFrame(onScroll);}
  },{passive:true});
  onScroll();

  function toTop(){window.scrollTo({top:0,behavior:reduce?'auto':'smooth'});}
  if(fab)fab.addEventListener('click',toTop);
  var topBtn=document.getElementById('toTopFooter');
  if(topBtn)topBtn.addEventListener('click',toTop);

  /* ---------- « Accueil » ne doit rien laisser dans l'adresse ----------
     Un lien qui pointe vers la page déjà ouverte ne recharge rien : on
     remonte en douceur et l'adresse reste propre, sans fragment #top.
     Ouvert depuis le disque, un lien vers un dossier n'ouvre pas
     index.html tout seul : on complète alors le chemin. */
  (function(){
    var surDisque=(location.protocol==='file:');
    document.querySelectorAll('a[href]').forEach(function(a){
      var href=a.getAttribute('href');
      if(!href||href.charAt(0)==='#')return;
      if(surDisque){
        /* « ../ » comme « ../#contact » visent un dossier : sur disque il
           faut nommer le fichier, sinon le navigateur liste le répertoire. */
        var coupe=href.indexOf('#');
        var chemin=(coupe<0)?href:href.slice(0,coupe);
        var ancre=(coupe<0)?'':href.slice(coupe);
        if(chemin&&chemin.charAt(chemin.length-1)==='/')
          a.setAttribute('href',chemin+'index.html'+ancre);
      }
      var cible;
      try{cible=new URL(a.href,location.href);}catch(e){return;}
      if(cible.pathname!==location.pathname||cible.search!==location.search)return;
      a.addEventListener('click',function(e){
        if(e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0)return;
        e.preventDefault();
        if(isOpen())closeNav();
        toTop();
        if(location.hash&&history.replaceState)
          history.replaceState(null,'',location.pathname+location.search);
      });
    });
  })();

  /* ---------- Révélations au défilement ---------- */
  var items=document.querySelectorAll('.reveal,.reveal-x,.reveal-zoom');
  if('IntersectionObserver' in window && !reduce){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){
          var el=en.target;
          el.classList.add('in');
          io.unobserve(el);
          if(el.classList.contains('reveal-card')){
            var d=parseInt(getComputedStyle(el).transitionDelay,10)||0;
            setTimeout(function(){el.classList.remove('reveal-card','reveal');},1100+Math.abs(d));
          }
        }
      });
    },{threshold:.12,rootMargin:'0px 0px -8% 0px'});
    items.forEach(function(el){io.observe(el);});
  }else{
    items.forEach(function(el){el.classList.add('in');});
  }

  /* ---------- Effet 3D sur les cartes (pointeur fin uniquement) ---------- */
  var fine=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(fine&&!reduce){
    document.querySelectorAll('[data-tilt]').forEach(function(card){
      card.addEventListener('pointermove',function(e){
        var r=card.getBoundingClientRect();
        var px=(e.clientX-r.left)/r.width-.5;
        var py=(e.clientY-r.top)/r.height-.5;
        card.style.transform='translateY(-12px) perspective(1000px) rotateX('+(-py*6).toFixed(2)+'deg) rotateY('+(px*7).toFixed(2)+'deg)';
      });
      card.addEventListener('pointerleave',function(){card.style.transform='';});
    });
  }

  /* ---------- Newsletter (démo front) ---------- */
  var form=document.getElementById('newsForm');
  var note=document.getElementById('newsNote');
  if(form&&note)form.addEventListener('submit',function(e){
    e.preventDefault();
    var input=document.getElementById('newsEmail');
    var ok=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim());
    note.innerHTML=ok
      ? '<i class="fas fa-check-circle" style="color:#4ade80"></i> Merci ! Votre inscription est bien prise en compte.'
      : '<i class="fas fa-exclamation-circle" style="color:#e11b22"></i> Merci de saisir une adresse e-mail valide.';
    if(ok)form.reset();
  });

  /* ---------- Année courante ---------- */
  /* ---------- Hero : un seul cadre, les univers et les logos défilent ---------- */
  (function(){
    var gal=document.getElementById('hsMain');
    if(!gal)return;
    var slides=gal.querySelectorAll('.hs-slide');
    if(slides.length<2)return;
    var i=0,t=1;
    function sync(){
      gal.classList.toggle('on-mark',slides[i].hasAttribute('data-mark'));
    }
    sync();
    if(reduce)return;
    setInterval(function(){
      t=(t%4)+1;
      gal.classList.remove('tx-1','tx-2','tx-3','tx-4');
      gal.classList.add('tx-'+t);
      slides[i].classList.remove('is-on');
      i=(i+1)%slides.length;
      slides[i].classList.add('is-on');
      sync();
    },3000);
  })();

  /* ---------- Curseur personnalisé, avec effet magnétique ---------- */
  var finePointer=window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  if(finePointer&&!reduce){
    var ring=document.createElement('div');ring.className='cur';
    var dot=document.createElement('div');dot.className='cur-dot';
    document.body.appendChild(ring);document.body.appendChild(dot);
    root.classList.add('has-cursor');
    var mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
    document.addEventListener('pointermove',function(e){
      mx=e.clientX;my=e.clientY;
      dot.style.transform='translate3d('+mx+'px,'+my+'px,0)';
      var m=e.target.closest&&e.target.closest('.btn,.icon-btn,.ucard-cta,.mnav-soc a,.f-soc a');
      if(m){
        var r=m.getBoundingClientRect();
        var dx=(mx-(r.left+r.width/2))*.28, dy=(my-(r.top+r.height/2))*.28;
        m.style.transform='translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px)';
        m.__magnet=true;
      }
      document.querySelectorAll('.btn,.icon-btn,.ucard-cta').forEach(function(el){
        if(el!==m&&el.__magnet){el.style.transform='';el.__magnet=false;}
      });
      ring.classList.toggle('is-active',!!(e.target.closest&&e.target.closest('a,button,.ucard')));
    },{passive:true});
    (function loop(){
      rx+=(mx-rx)*.16; ry+=(my-ry)*.16;
      ring.style.transform='translate3d('+rx.toFixed(2)+'px,'+ry.toFixed(2)+'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- Arrivée sur une page : le voile de l'entité se retire ---------- */
  if(document.querySelector('.veil-in')){
    requestAnimationFrame(function(){
      setTimeout(function(){root.classList.add('tx-ready');},40);
    });
  }

  /* ---------- Retour arrière : rien de la transition ne doit subsister ----------
     Un navigateur qui restaure la page depuis son cache la rend telle qu'elle a
     été quittée, donc avec le calque plein écran de la transition encore posé.
     On nettoie à chaque affichage, y compris lors d'une restauration. */
  function clearTransition(){
    document.querySelectorAll('.tx-clone').forEach(function(el){
      if(el.parentNode)el.parentNode.removeChild(el);
    });
    document.body.classList.remove('no-scroll');
    root.classList.remove('tx-leaving');
    if(document.querySelector('.veil-in'))root.classList.add('tx-ready');
  }
  window.addEventListener('pageshow',clearTransition);
  window.addEventListener('popstate',clearTransition);

  /* ---------- Transition card → plein écran → page ---------- */
  function goTo(url){ window.location.href=url; }
  document.querySelectorAll('a[data-transition]').forEach(function(link){
    link.addEventListener('click',function(e){
      if(e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0)return;
      if(reduce)return;
      var card=link.closest('.ucard');
      if(!card)return;
      e.preventDefault();
      var media=card.querySelector('.ucard-media');
      var img=card.querySelector('.ucard-img');
      var r=media.getBoundingClientRect();
      var cs=getComputedStyle(card);
      var acc=(cs.getPropertyValue('--acc-img')||'#050505').trim();
      var label=link.getAttribute('data-label')||'';

      var clone=document.createElement('div');
      clone.className='tx-clone';
      clone.style.left=r.left+'px';clone.style.top=r.top+'px';
      clone.style.width=r.width+'px';clone.style.height=r.height+'px';
      clone.style.borderRadius='20px';
      clone.style.backgroundImage=getComputedStyle(img).backgroundImage;
      clone.style.setProperty('--tx-acc',acc);
      clone.innerHTML='<div class="tx-flood"></div><div class="tx-label">'+label+'</div>';
      document.body.appendChild(clone);
      document.body.classList.add('no-scroll');

      requestAnimationFrame(function(){
        clone.classList.add('go');
        clone.style.left='0px';clone.style.top='0px';
        clone.style.width='100vw';clone.style.height='100vh';
        clone.style.borderRadius='0px';
      });
      setTimeout(function(){goTo(link.href);},820);
    });
  });

  var yearEl=document.getElementById('year');
  if(yearEl)yearEl.textContent=new Date().getFullYear();
})();
