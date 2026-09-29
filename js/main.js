// Emilio Rodea — Portfolio scripts (no dependencies)

// 1) Mobile nav toggle
(function () {
  var btn = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!btn || !links) return;
  btn.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

// 2) Missing-image placeholders.
//    Every <img> on the site points at a fixed filename under assets/img/.
//    If the file is not there yet, swap in a dashed box that names the file
//    to add. Once the photo is dropped in with that name, it shows automatically.
(function () {
  function placeholder(img) {
    var box = document.createElement('div');
    box.className = 'ph-box';
    var file = img.getAttribute('src').split('/').slice(-2).join('/');
    var hint = img.getAttribute('data-hint') || img.getAttribute('alt') || '';
    box.innerHTML = '<div><b>' + hint + '</b>add file: assets/img/' + file + '</div>';
    if (img.parentNode) img.parentNode.replaceChild(box, img);
  }
  var imgs = document.querySelectorAll('img[src*="assets/img/"]');
  Array.prototype.forEach.call(imgs, function (img) {
    if (img.complete && img.naturalWidth === 0) { placeholder(img); return; }
    img.addEventListener('error', function () { placeholder(img); });
  });
})();

// 3) Footer year
(function () {
  var y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
