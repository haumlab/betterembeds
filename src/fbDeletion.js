const crypto = require('crypto');

function parseSignedRequest(signedRequest, appSecret) {
  const [encodedSig, payload] = signedRequest.split('.');

  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

  const expected = crypto.createHmac('sha256', appSecret).update(payload).digest();

  if (!crypto.timingSafeEqual(sig, expected)) {
    throw new Error('Invalid signature');
  }

  return data;
}

function registerDeletionRoutes(app, appSecret, baseUrl) {
  app.use(require('express').urlencoded({ extended: true }));

  app.post('/facebook/deletion', (req, res) => {
    const signedRequest = req.body?.signed_request;

    if (!signedRequest) {
      return res.status(400).json({ error: 'Missing signed_request' });
    }

    let data;
    try {
      data = parseSignedRequest(signedRequest, appSecret);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid signed_request' });
    }

    const userId = data.user_id || 'unknown';
    const confirmationCode = crypto.randomBytes(8).toString('hex');

    console.log(`[facebook] Data deletion request for user ${userId} — confirmation ${confirmationCode}`);

    return res.json({
      url: `${baseUrl}/facebook/deletion/status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  });

  app.get('/facebook/deletion/status', (req, res) => {
    const code = req.query.code || '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Data Deletion — BetterEmbeds</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 540px; margin: 80px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 1.5rem; }
    .box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px 20px; margin-top: 24px; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: .9em; }
  </style>
</head>
<body>
  <h1>Data Deletion Request</h1>
  <div class="box">
    <p><strong>Your data has been deleted.</strong></p>
    <p>BetterEmbeds does not store any personal user data. We only cache public post metadata (text, images, stats) for up to 5 minutes to serve Discord embeds. No account information, user IDs, or personal data is retained.</p>
    ${code ? `<p>Confirmation code: <code>${escHtml(code)}</code></p>` : ''}
  </div>
</body>
</html>`);
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { registerDeletionRoutes };
