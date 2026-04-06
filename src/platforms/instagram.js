const axios = require('axios');
const cache = require('../cache');

async function fetchOEmbed(originalUrl) {
  const res = await axios.get(
    `https://api.instagram.com/oembed/?url=${encodeURIComponent(originalUrl)}&omitscript=true&hidecaption=false`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' },
      timeout: 8000,
    }
  );
  return res.data;
}

async function scrapeInstagram(originalUrl) {
  const UAS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  ];

  for (const ua of UAS) {
    try {
      const res = await axios.get(originalUrl, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 8000,
        maxRedirects: 5,
      });

      const html  = res.data;
      const title = extractMeta(html, 'og:title');
      const desc  = extractMeta(html, 'og:description');
      const image = extractMeta(html, 'og:image');
      const video = extractMeta(html, 'og:video:secure_url') || extractMeta(html, 'og:video');
      const vw    = extractMeta(html, 'og:video:width');
      const vh    = extractMeta(html, 'og:video:height');

      if (title || image) {
        return {
          title, desc, image, video,
          videoWidth: vw ? Number(vw) : null,
          videoHeight: vh ? Number(vh) : null,
        };
      }
    } catch (_) {}
  }
  return null;
}

function parseInstagramDesc(raw) {
  if (!raw) return { caption: '', likes: null, comments: null };

  const likesMatch    = raw.match(/([\d,]+)\s+like/i);
  const commentsMatch = raw.match(/([\d,]+)\s+comment/i);
  const captionMatch  = raw.match(/["""]([\s\S]+?)["""]\s*$/);

  return {
    likes:    likesMatch    ? Number(likesMatch[1].replace(/,/g, ''))    : null,
    comments: commentsMatch ? Number(commentsMatch[1].replace(/,/g, '')) : null,
    caption:  captionMatch  ? captionMatch[1].trim() : raw.replace(/^.*?[:-]\s*/i, '').trim(),
  };
}

function fmt(n) {
  n = Number(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function fetchInstagramEmbed(path) {
  const cacheKey = `instagram:${path}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const originalUrl = `https://www.instagram.com${path.startsWith('/') ? path : '/' + path}`;
  const isReel = /\/reel\//i.test(path);
  const isTV   = /\/tv\//i.test(path);

  let authorName  = null;
  let thumbnail   = null;
  let caption     = '';
  let likes       = null;
  let comments    = null;
  let video       = null;
  let videoWidth  = null;
  let videoHeight = null;

  try {
    const d = await fetchOEmbed(originalUrl);
    authorName = d.author_name || null;
    thumbnail  = d.thumbnail_url || null;
    if (d.title && d.title !== `${authorName} on Instagram`) caption = d.title;
  } catch (_) {}

  try {
    const scraped = await scrapeInstagram(originalUrl);
    if (scraped) {
      const { caption: cap, likes: l, comments: c } = parseInstagramDesc(scraped.desc || scraped.title || '');
      if (cap) caption  = cap;
      if (l)   likes    = l;
      if (c)   comments = c;
      if (!thumbnail && scraped.image) thumbnail = scraped.image;
      if (scraped.video) {
        video       = scraped.video;
        videoWidth  = scraped.videoWidth;
        videoHeight = scraped.videoHeight;
      }
      if (!authorName && scraped.title) {
        const m = (scraped.title || '').match(/@([\w.]+)/);
        if (m) authorName = m[1];
      }
    }
  } catch (_) {}

  if (!thumbnail && !caption && !authorName) return null;

  const handle    = authorName ? `@${authorName}` : 'Instagram';
  const typeLabel = isReel ? 'Reel' : isTV ? 'IGTV' : 'Post';

  const parts = [];
  if (likes    != null) parts.push(`❤️ ${fmt(likes)}`);
  if (comments != null) parts.push(`💬 ${fmt(comments)}`);
  const stats = parts.length ? '\n\n' + parts.join('  ') : '';

  const embedData = {
    siteName: `Instagram ${typeLabel} • ${handle}`,
    title: handle,
    description: (caption || `${typeLabel} by ${handle}`).slice(0, 300) + stats,
    image: thumbnail,
    video,
    videoWidth,
    videoHeight,
    color: '#E1306C',
    redirectUrl: originalUrl,
  };

  cache.set(cacheKey, embedData);
  return embedData;
}

function extractMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  }
  return null;
}

module.exports = { fetchInstagramEmbed };
