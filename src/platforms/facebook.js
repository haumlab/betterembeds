const axios = require('axios');
const cache = require('../cache');

const GRAPH = 'https://graph.facebook.com/v19.0';

function detectFbContent(pathname, searchParams) {
  const p = pathname;

  if (/\/marketplace\/item\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'marketplace', id: p.match(/\/marketplace\/item\/([A-Za-z0-9_-]+)/)[1] };
  if (/\/events\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'event', id: p.match(/\/events\/([A-Za-z0-9_-]+)/)[1] };
  if (/\/reel(?:s)?\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'reel', id: p.match(/\/reel(?:s)?\/([A-Za-z0-9_-]+)/)[1] };
  if (/\/videos\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'video', id: p.match(/\/videos\/([A-Za-z0-9_-]+)/)[1] };
  if (p === '/watch' && searchParams.get('v'))
    return { type: 'video', id: searchParams.get('v') };
  if (searchParams.get('fbid'))
    return { type: 'photo', id: searchParams.get('fbid') };
  if (/\/photos\/[^/]+\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'photo', id: p.match(/\/photos\/[^/]+\/([A-Za-z0-9_-]+)/)[1] };
  if (/\/photo\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'photo', id: p.match(/\/photo\/([A-Za-z0-9_-]+)/)[1] };
  if (/\/groups\/[^/]+\/(?:permalink|posts)\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'post', id: p.match(/\/groups\/[^/]+\/(?:permalink|posts)\/([A-Za-z0-9_-]+)/)[1] };
  if (searchParams.get('story_fbid'))
    return { type: 'post', id: searchParams.get('story_fbid') };
  if (/\/posts\/([A-Za-z0-9_-]+)/.test(p))
    return { type: 'post', id: p.match(/\/posts\/([A-Za-z0-9_-]+)/)[1] };

  const pageMatch = p.match(/^\/([A-Za-z0-9._-]+)\/?$/);
  if (pageMatch && pageMatch[1] !== 'watch' && pageMatch[1] !== 'marketplace')
    return { type: 'page', id: pageMatch[1] };

  return { type: 'unknown', id: null };
}

async function graphGet(id, fields, token) {
  const res = await axios.get(`${GRAPH}/${id}?fields=${fields}&access_token=${token}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' },
    timeout: 8000,
  });
  return res.data;
}

async function fetchOEmbed(originalUrl, token, endpointType = 'post') {
  const ep  = ['post', 'video', 'page'].includes(endpointType) ? endpointType : 'post';
  const res = await axios.get(
    `${GRAPH}/oembed_${ep}?url=${encodeURIComponent(originalUrl)}&access_token=${token}&omitscript=true`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' },
      timeout: 8000,
    }
  );
  return res.data;
}


async function scrapeFacebook(originalUrl, { marketplace = false } = {}) {
  const UAS = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'facebookexternalhit/1.1',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Twitterbot/1.0',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  ];

  for (const ua of UAS) {
    try {
      const res = await axios.get(originalUrl, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        timeout: 10000,
        maxRedirects: 5,
      });

      const html  = res.data;
      const title = decodeHtmlEntities(extractMeta(html, 'og:title'));
      const desc  = decodeHtmlEntities(extractMeta(html, 'og:description'));
      const image = extractMeta(html, 'og:image');
      const video = extractMeta(html, 'og:video:url') || extractMeta(html, 'og:video:secure_url') || extractMeta(html, 'og:video');

      if (!title && !image) continue;

      if (!marketplace) return { title, desc, image, video };

      const images = extractAllMeta(html, 'og:image').filter(Boolean);

      let jsonLd = null;
      const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      for (const m of ldMatches) {
        try {
          const parsed = JSON.parse(m[1]);
          const items  = Array.isArray(parsed) ? parsed : [parsed];
          const product = items.find((x) => x['@type'] === 'Product' || x['@type'] === 'ItemPage');
          if (product) { jsonLd = product; break; }
          if (!jsonLd) jsonLd = items[0];
        } catch (_) {}
      }

      return { title, desc, image, images, video, jsonLd };
    } catch (_) {}
  }
  return null;
}

function fmt(n) {
  n = Number(n);
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function fmtDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch { return iso; }
}

function parsePost(data, originalUrl) {
  const text     = data.message || data.story || 'Facebook Post';
  const likes    = data.likes?.summary?.total_count;
  const comments = data.comments?.summary?.total_count;
  const shares   = data.shares?.count;

  const parts = [];
  if (likes    != null) parts.push(`👍 ${fmt(likes)}`);
  if (comments != null) parts.push(`💬 ${fmt(comments)}`);
  if (shares   != null) parts.push(`↗️ ${fmt(shares)}`);
  const stats = parts.length ? '\n\n' + parts.join('  ') : '';

  return {
    siteName: data.from?.name ? `Facebook • ${data.from.name}` : 'Facebook',
    title: data.from?.name || 'Facebook Post',
    description: text.slice(0, 300) + stats,
    image: data.full_picture || null,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

function parseVideo(data, originalUrl) {
  const title    = data.title || 'Facebook Video';
  const desc     = data.description || '';
  const likes    = data.likes?.summary?.total_count;
  const comments = data.comments?.summary?.total_count;
  const views    = data.views;

  let image = data.picture || null;
  if (data.thumbnails?.data?.length) {
    const sorted = [...data.thumbnails.data].sort((a, b) => (b.width || 0) - (a.width || 0));
    image = sorted[0].uri || image;
  }

  const parts = [];
  if (likes    != null) parts.push(`👍 ${fmt(likes)}`);
  if (comments != null) parts.push(`💬 ${fmt(comments)}`);
  if (views    != null) parts.push(`👁 ${fmt(views)}`);
  const stats = parts.length ? '\n\n' + parts.join('  ') : '';

  return {
    siteName: data.place?.name ? `Facebook Video • ${data.place.name}` : 'Facebook Video',
    title,
    description: (desc || title).slice(0, 300) + stats,
    image,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

function parseEvent(data, originalUrl) {
  const name  = data.name || 'Facebook Event';
  const desc  = (data.description || '').slice(0, 250);
  const start = fmtDate(data.start_time);
  const place = data.place?.name;
  const city  = data.place?.location?.city;
  const going = data.attending_count;
  const maybe = data.maybe_count;

  const lines = [];
  if (start) lines.push(`📅 ${start}`);
  if (place) lines.push(`📍 ${[place, city].filter(Boolean).join(', ')}`);
  if (desc)  lines.push('', desc);

  const statsParts = [];
  if (going != null) statsParts.push(`✅ ${fmt(going)} going`);
  if (maybe != null) statsParts.push(`🤔 ${fmt(maybe)} interested`);
  if (statsParts.length) lines.push('', statsParts.join('  '));

  return {
    siteName: 'Facebook Event',
    title: name,
    description: lines.join('\n'),
    image: data.cover?.source || null,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

function parsePhoto(data, originalUrl) {
  const caption  = data.name || 'Facebook Photo';
  const likes    = data.likes?.summary?.total_count;
  const comments = data.comments?.summary?.total_count;

  let image = null;
  if (data.images?.length) {
    const sorted = [...data.images].sort((a, b) => (b.width || 0) - (a.width || 0));
    image = sorted[0].source;
  }

  const parts = [];
  if (likes    != null) parts.push(`❤️ ${fmt(likes)}`);
  if (comments != null) parts.push(`💬 ${fmt(comments)}`);
  const stats = parts.length ? '\n\n' + parts.join('  ') : '';

  return {
    siteName: data.from?.name ? `Facebook • ${data.from.name}` : 'Facebook Photo',
    title: data.from?.name || 'Facebook Photo',
    description: caption.slice(0, 300) + stats,
    image,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

function parsePage(data, originalUrl) {
  const fans = data.fan_count;
  const desc = data.description || data.about || '';

  const parts = [];
  if (fans != null) parts.push(`👥 ${fmt(fans)} followers`);
  if (data.category) parts.push(data.category);

  return {
    siteName: 'Facebook',
    title: data.name || 'Facebook Page',
    description: (parts.join(' · ') ? parts.join(' · ') + '\n\n' : '') + desc.slice(0, 300),
    image: data.cover?.source || data.picture?.data?.url || null,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

function parseMarketplace(scraped, originalUrl) {
  if (!scraped) return null;

  const ld       = scraped.jsonLd || {};
  const titleRaw = scraped.title || ld.name || 'Marketplace Listing';
  const descRaw  = scraped.desc  || ld.description || '';
  const allText  = titleRaw + ' ' + descRaw;

  // Price — from JSON-LD offer or OG text
  const ldPrice = ld.offers?.price
    ? `$${ld.offers.price}${ld.offers.priceCurrency ? '' : ''}`
    : null;
  const priceMatch = !ldPrice && allText.match(/\$[\d,]+(?:\.\d{2})?/);
  const price = ldPrice || priceMatch?.[0] || null;

  // Condition — from JSON-LD or description keywords
  const ldCondition = ld.itemCondition
    ? ld.itemCondition.replace(/.*\//, '').replace('Condition', '').trim()
    : null;
  const conditionMatch = !ldCondition && descRaw.match(/\b(new|used|like new|good|fair|poor|refurbished)\b/i);
  const condition = ldCondition || (conditionMatch ? conditionMatch[1] : null);

  // Location — from JSON-LD or OG description patterns
  const ldLocation = ld.offers?.availableAtOrFrom?.name || ld.locationCreated?.name || null;
  const locationMatch = !ldLocation && descRaw.match(/\bin\s+([A-Z][a-zA-Z\s]{2,30}(?:,\s*[A-Z]{2})?)/);
  const location = ldLocation || locationMatch?.[1]?.trim() || null;

  // Clean up the description — remove redundant price/location/photo count lines
  const cleanDesc = descRaw
    .replace(/See \d+ photos? on Facebook Marketplace\.?/gi, '')
    .replace(/\$[\d,]+(?:\.\d{2})?/g, '')
    .replace(/\bMarketplace\b/gi, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .slice(0, 300);

  // Photo count from all scraped images
  const photoCount = (scraped.images || []).filter(Boolean).length;

  // Build description lines
  const lines = [];
  const subParts = [price, condition, location].filter(Boolean);
  if (subParts.length) lines.push(subParts.join(' · '));
  if (cleanDesc) lines.push('', cleanDesc);
  if (photoCount > 1) lines.push('', `📷 ${photoCount} photos`);

  return {
    siteName: 'Facebook Marketplace',
    title: titleRaw,
    description: lines.join('\n').trim(),
    image: scraped.image || (scraped.images || [])[0] || null,
    color: '#1877F2',
    redirectUrl: originalUrl,
  };
}

async function fetchFacebookEmbed(rawPath, accessToken) {
  const cacheKey = `facebook:${rawPath}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const qIdx     = rawPath.indexOf('?');
  const pathname = qIdx >= 0 ? rawPath.slice(0, qIdx) : rawPath;
  const search   = qIdx >= 0 ? rawPath.slice(qIdx) : '';
  const params   = new URLSearchParams(search);

  const originalUrl     = `https://www.facebook.com${pathname}${search}`;
  const { type, id }    = detectFbContent(pathname, params);

  let embedData = null;

  if (accessToken && id) {
    try {
      switch (type) {
        case 'post': {
          const d = await graphGet(id, 'message,story,full_picture,likes.summary(true),comments.summary(true),shares,created_time,from', accessToken);
          embedData = parsePost(d, originalUrl);
          break;
        }
        case 'video':
        case 'reel': {
          const d = await graphGet(id, 'title,description,picture,thumbnails{uri,width,height},likes.summary(true),comments.summary(true),views,place', accessToken);
          embedData = parseVideo(d, originalUrl);
          break;
        }
        case 'event': {
          const d = await graphGet(id, 'name,description,cover{source},attending_count,maybe_count,declined_count,start_time,end_time,place,ticket_uri', accessToken);
          embedData = parseEvent(d, originalUrl);
          break;
        }
        case 'photo': {
          const d = await graphGet(id, 'name,images,likes.summary(true),comments.summary(true),from', accessToken);
          embedData = parsePhoto(d, originalUrl);
          break;
        }
        case 'page': {
          const d = await graphGet(id, 'name,description,about,picture{url},cover{source},fan_count,category', accessToken);
          embedData = parsePage(d, originalUrl);
          break;
        }
      }
    } catch (err) {
      console.warn(`[facebook] Graph API (${type}) failed:`, err.message);
    }
  }

  // oEmbed — last resort for supported types before HTML scrape
  if (!embedData && accessToken && ['post', 'video', 'reel', 'page'].includes(type)) {
    try {
      const oembedType = type === 'video' || type === 'reel' ? 'video' : type === 'page' ? 'page' : 'post';
      const d = await fetchOEmbed(originalUrl, accessToken, oembedType);
      if (d) {
        embedData = {
          siteName: 'Facebook',
          title: d.author_name || 'Facebook',
          description: '',
          image: d.thumbnail_url || null,
          color: '#1877F2',
          redirectUrl: originalUrl,
        };
      }
    } catch (err) {
      console.warn('[facebook] oEmbed failed:', err.message);
    }
  }

  // HTML scrape — catches marketplace and anything the API can't reach
  if (!embedData) {
    try {
      const scraped = await scrapeFacebook(originalUrl, { marketplace: type === 'marketplace' });
      if (type === 'marketplace') {
        embedData = parseMarketplace(scraped, originalUrl);
      } else if (scraped) {
        const LABELS = {
          event: 'Facebook Event', video: 'Facebook Video', reel: 'Facebook Reel',
          page: 'Facebook Page', photo: 'Facebook Photo',
        };
        embedData = {
          siteName: LABELS[type] || 'Facebook',
          title: scraped.title || 'Facebook',
          description: scraped.desc || '',
          image: scraped.image || null,
          video: scraped.video || undefined,
          color: '#1877F2',
          redirectUrl: originalUrl,
        };
      }
    } catch (err) {
      console.warn('[facebook] HTML scrape failed:', err.message);
    }
  }

  if (embedData) cache.set(cacheKey, embedData);
  return embedData;
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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

function extractAllMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const results = [];
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'gi'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'gi'),
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const val = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
      if (!results.includes(val)) results.push(val);
    }
  }
  return results;
}

module.exports = { fetchFacebookEmbed };
