const axios = require('axios');
const cache = require('../cache');

async function fetchOEmbed(originalUrl) {
  const res = await axios.get(
    `https://www.tiktok.com/oembed?url=${encodeURIComponent(originalUrl)}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)',
        Accept: 'application/json',
      },
      timeout: 8000,
    }
  );
  return res.data;
}

async function scrapeTikTok(originalUrl) {
  const res = await axios.get(originalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 10000,
    maxRedirects: 5,
  });

  const html  = res.data;
  const title = extractMeta(html, 'og:title');
  const desc  = extractMeta(html, 'og:description');
  const image = extractMeta(html, 'og:image');
  const video = extractMeta(html, 'og:video:secure_url') || extractMeta(html, 'og:video');
  const vw    = extractMeta(html, 'og:video:width');
  const vh    = extractMeta(html, 'og:video:height');

  let likes = null, comments = null, shares = null, views = null;

  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld    = JSON.parse(jsonLdMatch[1]);
      const stats = ld.interactionStatistic || [];
      for (const s of stats) {
        const type  = (s.interactionType || '').toLowerCase();
        const count = Number(s.userInteractionCount);
        if (type.includes('like'))    likes    = count;
        if (type.includes('comment')) comments = count;
        if (type.includes('share'))   shares   = count;
        if (type.includes('watch') || type.includes('view')) views = count;
      }
    } catch (_) {}
  }

  return {
    title, desc, image, video,
    videoWidth:  vw ? Number(vw) : null,
    videoHeight: vh ? Number(vh) : null,
    likes, comments, shares, views,
  };
}

function fmt(n) {
  n = Number(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function fetchTikTokEmbed(path) {
  const cacheKey = `tiktok:${path}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const originalUrl = `https://www.tiktok.com${path.startsWith('/') ? path : '/' + path}`;

  let authorName  = null;
  let caption     = '';
  let thumbnail   = null;
  let video       = null;
  let videoWidth  = null;
  let videoHeight = null;
  let likes       = null;
  let comments    = null;
  let shares      = null;
  let views       = null;

  try {
    const d    = await fetchOEmbed(originalUrl);
    authorName = d.author_name || d.author_unique_id || null;
    thumbnail  = d.thumbnail_url || null;
    caption    = d.title || '';
    videoWidth  = d.thumbnail_width  || null;
    videoHeight = d.thumbnail_height || null;
  } catch (_) {}

  try {
    const scraped = await scrapeTikTok(originalUrl);
    if (scraped) {
      if (!thumbnail && scraped.image) thumbnail = scraped.image;
      if (!caption && scraped.title)   caption   = scraped.title;
      if (scraped.video) {
        video       = scraped.video;
        videoWidth  = scraped.videoWidth  || videoWidth;
        videoHeight = scraped.videoHeight || videoHeight;
      }
      if (!authorName && scraped.title) {
        const m = (scraped.title || '').match(/@([\w.]+)/);
        if (m) authorName = m[1];
      }
      likes    = scraped.likes    ?? likes;
      comments = scraped.comments ?? comments;
      shares   = scraped.shares   ?? shares;
      views    = scraped.views    ?? views;
    }
  } catch (_) {}

  if (!thumbnail && !caption) return null;

  const handle = authorName ? `@${authorName}` : 'TikTok';

  const parts = [];
  if (likes    != null) parts.push(`❤️ ${fmt(likes)}`);
  if (comments != null) parts.push(`💬 ${fmt(comments)}`);
  if (shares   != null) parts.push(`🔗 ${fmt(shares)}`);
  if (views    != null) parts.push(`👁 ${fmt(views)}`);
  const stats = parts.length ? '\n\n' + parts.join('  ') : '';

  const embedData = {
    siteName: `TikTok • ${handle}`,
    title: handle,
    description: (caption || `Video by ${handle}`).slice(0, 300) + stats,
    image: thumbnail,
    video,
    videoWidth,
    videoHeight,
    color: '#010101',
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
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  }
  return null;
}

module.exports = { fetchTikTokEmbed };
