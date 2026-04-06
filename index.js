require('dotenv').config({ path: '.env' });
const express = require('express');
const { buildEmbed, buildError } = require('./src/embedHtml');
const { fetchTwitterEmbed } = require('./src/platforms/twitter');
const { fetchInstagramEmbed } = require('./src/platforms/instagram');
const { fetchTikTokEmbed } = require('./src/platforms/tiktok');
const { fetchRedditEmbed } = require('./src/platforms/reddit');
const { fetchFacebookEmbed } = require('./src/platforms/facebook');
const { detectPlatform } = require('./src/detect');
const { registerDeletionRoutes } = require('./src/fbDeletion');

const app = express();
const PORT = process.env.PORT || 3000;
const FB_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN || null;
const FB_APP_SECRET   = process.env.FACEBOOK_APP_SECRET || null;
const BASE_URL        = process.env.BASE_URL || `http://localhost:${PORT}`;

const DISCORD_BOTS = [
  'discordbot',
  'twitterbot',
  'facebookexternalhit',
  'linkedinbot',
  'slackbot',
  'telegrambot',
];

const PLATFORM_ORIGINS = {
  twitter: 'https://twitter.com',
  instagram: 'https://www.instagram.com',
  tiktok: 'https://www.tiktok.com',
  reddit: 'https://www.reddit.com',
  facebook: 'https://www.facebook.com',
};

const PLATFORM_ERRORS = {
  twitter: 'Could not load tweet.',
  instagram: 'Could not load Instagram post.',
  tiktok: 'Could not load TikTok video.',
  reddit: 'Could not load Reddit post.',
  facebook: 'Could not load Facebook post.',
};

function isBot(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return DISCORD_BOTS.some((bot) => ua.includes(bot));
}

function html(res, content) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120');
  res.send(content);
}

function redirect(res, url) {
  res.redirect(302, url);
}

async function fetchEmbed(platform, path) {
  switch (platform) {
    case 'twitter':   return fetchTwitterEmbed(path);
    case 'instagram': return fetchInstagramEmbed(path);
    case 'tiktok':    return fetchTikTokEmbed(path);
    case 'reddit':    return fetchRedditEmbed(path);
    case 'facebook':  return fetchFacebookEmbed(path, FB_ACCESS_TOKEN);
    default:          return null;
  }
}

async function handleEmbed(req, res, platform, path) {
  const originalUrl = `${PLATFORM_ORIGINS[platform]}${path}`;
  if (!isBot(req)) return redirect(res, originalUrl);

  try {
    const data = await fetchEmbed(platform, path);
    if (!data) return html(res, buildError(PLATFORM_ERRORS[platform], originalUrl));
    return html(res, buildEmbed(data, originalUrl));
  } catch (err) {
    console.error(`[${platform}] Handler error:`, err.message);
    return html(res, buildError(PLATFORM_ERRORS[platform], originalUrl));
  }
}

if (FB_APP_SECRET) {
  registerDeletionRoutes(app, FB_APP_SECRET, BASE_URL);
}

app.get('/twitter/*', (req, res) => handleEmbed(req, res, 'twitter',   '/' + req.params[0]));
app.get('/x/*',       (req, res) => handleEmbed(req, res, 'twitter',   '/' + req.params[0]));
app.get(['/instagram/*', '/ig/*'], (req, res) => handleEmbed(req, res, 'instagram', '/' + req.params[0]));
app.get(['/tiktok/*', '/tt/*'],    (req, res) => handleEmbed(req, res, 'tiktok',    '/' + req.params[0]));
app.get('/reddit/*',  (req, res) => handleEmbed(req, res, 'reddit',    '/' + req.params[0]));
app.get('/facebook/*',(req, res) => handleEmbed(req, res, 'facebook',  '/' + req.params[0]));

app.get('/resolve', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl) return res.status(400).send('Missing ?url= parameter');

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).send('Invalid URL');
  }

  const path = parsed.pathname + (parsed.search || '');
  const detected = detectPlatform(path, parsed.hostname);

  if (!isBot(req)) return redirect(res, rawUrl);
  if (!detected) return html(res, buildError('Platform not supported or URL not recognised.', rawUrl));

  try {
    const data = await fetchEmbed(detected.platform, detected.path);
    if (!data) return html(res, buildError(PLATFORM_ERRORS[detected.platform], rawUrl));
    return html(res, buildEmbed(data, rawUrl));
  } catch (err) {
    console.error(`[resolve/${detected.platform}] Error:`, err.message);
    return html(res, buildError('Error fetching post.', rawUrl));
  }
});

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>BetterEmbeds</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 680px; margin: 60px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 2rem; margin-bottom: .25em; }
    h2 { margin-top: 2em; }
    p  { color: #444; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-size: .88em; }
    table { border-collapse: collapse; width: 100%; margin-top: 1em; }
    td, th { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: .9em; }
    th { background: #f5f5f5; }
    .badge { display: inline-block; background: #4f46e5; color: #fff; font-size: .75em; padding: 2px 7px; border-radius: 99px; vertical-align: middle; margin-left: 6px; }
  </style>
</head>
<body>
  <h1>BetterEmbeds <span class="badge">v1</span></h1>
  <p>Fix social media embeds for Discord. Just replace the domain — no prefix needed.</p>

  <h2>Smart auto-detect</h2>
  <table>
    <tr><th>Original URL</th><th>BetterEmbeds URL</th></tr>
    <tr><td><code>twitter.com/user/status/123</code></td><td><code>yourhost/user/status/123</code></td></tr>
    <tr><td><code>x.com/user/status/123</code></td><td><code>yourhost/user/status/123</code></td></tr>
    <tr><td><code>instagram.com/p/ABC123/</code></td><td><code>yourhost/p/ABC123/</code></td></tr>
    <tr><td><code>instagram.com/reel/ABC123/</code></td><td><code>yourhost/reel/ABC123/</code></td></tr>
    <tr><td><code>tiktok.com/@user/video/12345</code></td><td><code>yourhost/@user/video/12345</code></td></tr>
    <tr><td><code>reddit.com/r/sub/comments/…</code></td><td><code>yourhost/r/sub/comments/…</code></td></tr>
    <tr><td><code>facebook.com/events/123</code></td><td><code>yourhost/events/123</code></td></tr>
    <tr><td><code>facebook.com/marketplace/item/123</code></td><td><code>yourhost/marketplace/item/123</code></td></tr>
  </table>

  <h2>Explicit prefix routes</h2>
  <table>
    <tr><th>Platform</th><th>URL</th></tr>
    <tr><td>Twitter / X</td><td><code>yourhost/twitter/user/status/123</code></td></tr>
    <tr><td>Instagram</td><td><code>yourhost/instagram/p/ABC123/</code></td></tr>
    <tr><td>TikTok</td><td><code>yourhost/tiktok/@user/video/12345</code></td></tr>
    <tr><td>Reddit</td><td><code>yourhost/reddit/r/sub/comments/…</code></td></tr>
    <tr><td>Facebook</td><td><code>yourhost/facebook/…</code></td></tr>
  </table>

  <h2>Paste any URL</h2>
  <p><code>yourhost/resolve?url=https://twitter.com/user/status/123</code></p>
</body>
</html>`);
});

app.get('/*', async (req, res) => {
  const path = req.path;
  const detected = detectPlatform(path, null);
  if (!detected) return res.redirect('/');
  return handleEmbed(req, res, detected.platform, detected.path);
});

app.listen(PORT, () => {
  console.log(`BetterEmbeds running on http://localhost:${PORT}`);
});
