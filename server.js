// Minimal Express server for link locker with admin UI
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 3000;
const LINKS_FILE = path.join(__dirname, 'links.json');

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Helper: load links (sync - simple)
function loadLinks() {
  try {
    const raw = fs.readFileSync(LINKS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

// Helper: save links (sync - simple)
function saveLinks(links) {
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

// API: create a new short code
// POST /api/create  { "target": "https://...", "code": "optionalCode" }
app.post('/api/create', (req, res) => {
  const { target, code } = req.body || {};
  if (!target || typeof target !== 'string') return res.status(400).json({ error: 'target required' });

  const links = loadLinks();
  let short = code && typeof code === 'string' ? code : nanoid(7);

  // ensure uniqueness
  while (links[short]) {
    short = nanoid(7);
  }

  links[short] = target;
  saveLinks(links);

  const fullUrl = `${req.protocol}://${req.get('host')}/${short}`;
  // if request came from a form (urlencoded), redirect to admin page with result
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
    return res.redirect(`/admin?created=${encodeURIComponent(fullUrl)}&short=${encodeURIComponent(short)}&target=${encodeURIComponent(target)}`);
  }

  res.json({ short, target, url: fullUrl });
});

// Admin page to create links (simple form)
app.get('/admin', (req, res) => {
  const created = req.query.created || '';
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Link Locker — Admin</title>
  <link rel="stylesheet" href="/public/style.css">
  <style>
    .form { text-align: left; margin-top: 12px }
    label { display:block; margin-top:8px; font-weight:600 }
    input[type=text] { width:100%; padding:8px; border-radius:6px; border:1px solid #ddd; margin-top:6px }
  </style>
</head>
<body>
  <div class="container">
    <h1>Admin — Create Short Link</h1>
    <p>Paste the destination URL below and optionally a custom code.</p>
    <form class="form" method="POST" action="/api/create">
      <label>Destination URL</label>
      <input type="text" name="target" placeholder="https://example.com" required />
      <label>Custom code (optional)</label>
      <input type="text" name="code" placeholder="customCode" />
      <button class="btn" type="submit">Create</button>
    </form>
    ${ created ? `<div style="margin-top:14px;padding:12px;border-radius:8px;background:#f0f9ff;border:1px solid #d3e9ff;">
      <strong>Created:</strong> <a href="${created}" target="_blank">${created}</a>
    </div>` : '' }
    <div class="small" style="margin-top:10px">Use this admin UI locally or protect it before deploying publicly.</div>
  </div>
</body>
</html>`);
});

// Route: interstitial page for a short code
app.get('/:code', (req, res) => {
  const code = req.params.code;
  const links = loadLinks();
  const target = links[code];
  if (!target) {
    return res.status(404).send('<h2>Link not found</h2>');
  }

  // 15 second wait (client-side)
  const WAIT_SECONDS = 15;

  // Serve a minimal HTML interstitial (inject target and wait)
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Preparing your link...</title>
  <link rel="stylesheet" href="/public/style.css">
</head>
<body>
  <div class="container">
    <h1>Preparing your link</h1>
    <p>Please watch the content below — you'll be redirected when the timer finishes.</p>

    <div id="timer">${WAIT_SECONDS}</div>
    <div class="progress" aria-hidden="true"><i id="bar"></i></div>

    <button id="continueBtn" class="btn" disabled>Continue</button>
    <div class="small">If the button doesn't work, the page will redirect automatically.</div>

    <!-- YOU CAN PLACE AD / IFRAME HERE (make sure it follows ad network policies) -->
    <div style="margin-top:18px">
      <small>Advertisement area (replace with legal ad code)</small>
      <div style="border:1px dashed #ddd; padding:12px; margin-top:8px; border-radius:8px; background:#fafafa">Ad placeholder</div>
    </div>
  </div>

  <script>
    (function(){
      const wait = ${WAIT_SECONDS};
      let s = wait;
      const timerEl = document.getElementById('timer');
      const bar = document.getElementById('bar');
      const btn = document.getElementById('continueBtn');
      const target = ${JSON.stringify(target)};

      function update() {
        if (s <= 0) {
          btn.disabled = false;
          timerEl.innerText = 0;
          // auto redirect after 500ms so user can click if they want
          setTimeout(() => window.location.href = target, 500);
          return;
        }
        timerEl.innerText = s;
        const pct = Math.round(((wait - s) / wait) * 100);
        bar.style.width = pct + '%';
        s--;
        setTimeout(update, 1000);
      }

      btn.addEventListener('click', function(){
        window.location.href = target;
      });

      // start
      update();
    })();
  </script>
</body>
</html>`);
});

// Simple admin health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Link locker listening on http://localhost:${PORT}`);
});
