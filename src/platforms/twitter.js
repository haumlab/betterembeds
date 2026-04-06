const axios = require('axios');
const cache = require('../cache');

const BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I7BeIgUtWMQrQk%2FIDaRQHJNcmRo9dBFPAqRBERqH0tLGsRivA1dFJCJQFNiUGdB0A%2FWBxsQ0lVkFRoFaEy';

function syndicationToken(id) {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, '');
}

async function getGuestToken() {
  const cached = cache.get('twitter_guest_token');
  if (cached) return cached;

  const res = await axios.post(
    'https://api.twitter.com/1.1/guest/activate.json',
    {},
    {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
        Origin: 'https://twitter.com',
        Referer: 'https://twitter.com/',
      },
      timeout: 8000,
    }
  );

  const token = res.data.guest_token;
  cache.set('twitter_guest_token', token, 7200);
  return token;
}

async function fetchSyndication(tweetId) {
  const token = syndicationToken(tweetId);
  const url =
    `https://cdn.syndication.twimg.com/tweet-result` +
    `?id=${tweetId}&lang=en` +
    `&features=tfw_timeline_list%3A%3Btfw_follower_count_sunset%3Atrue%3Btfw_tweet_edit_backend%3Aon%3Btfw_refsrc_session%3Aon%3Btfw_show_blue_verified_badge%3Aon%3Btfw_legacy_timeline_sunset%3Atrue%3Btfw_tweet_edit_frontend%3Aon` +
    `&token=${token}`;

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: 'https://platform.twitter.com/',
      Origin: 'https://platform.twitter.com',
      Accept: '*/*',
    },
    timeout: 8000,
  });

  return res.data;
}

async function fetchV1(tweetId) {
  const guestToken = await getGuestToken();

  const res = await axios.get(
    `https://api.twitter.com/1.1/statuses/show.json?id=${tweetId}&tweet_mode=extended&include_entities=true`,
    {
      headers: {
        Authorization: `Bearer ${BEARER}`,
        'x-guest-token': guestToken,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
        Origin: 'https://twitter.com',
        Referer: 'https://twitter.com/',
      },
      timeout: 8000,
    }
  );

  return res.data;
}

async function fetchOEmbed(tweetId) {
  const res = await axios.get(
    `https://publish.twitter.com/oembed?url=https%3A%2F%2Ftwitter.com%2Fi%2Fstatus%2F${tweetId}&omit_script=true`,
    { timeout: 8000 }
  );
  return res.data;
}

function parseMedia(mediaArr) {
  let image = null;
  let video = null;
  let videoWidth = null;
  let videoHeight = null;

  for (const media of mediaArr || []) {
    const type = media.type;

    if (type === 'photo') {
      if (!image) {
        image = media.media_url_https || media.media_url;
        if (image && !image.includes('?')) image += '?format=jpg&name=large';
      }
    } else if (type === 'video' || type === 'animated_gif') {
      const variants = (
        media.video_info?.variants ||
        media.variants ||
        []
      ).filter((v) => (v.content_type || v.type) === 'video/mp4');

      variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      if (variants[0]) {
        video = variants[0].url || variants[0].src;
        videoWidth = media.original_info?.width || media.sizes?.large?.w || media.width;
        videoHeight = media.original_info?.height || media.sizes?.large?.h || media.height;
      }

      if (!image) image = media.media_url_https || media.media_url;
    }
  }

  return { image, video, videoWidth, videoHeight };
}

function statsLine(replies, retweets, likes, views) {
  const parts = [];
  if (replies != null)  parts.push(`💬 ${fmt(replies)}`);
  if (retweets != null) parts.push(`🔁 ${fmt(retweets)}`);
  if (likes != null)    parts.push(`❤️ ${fmt(likes)}`);
  if (views != null)    parts.push(`👁 ${fmt(views)}`);
  return parts.length ? '\n\n' + parts.join('  ') : '';
}

function parseSyndication(data, tweetId) {
  const user = data.user || {};
  const text = (data.text || data.full_text || '').replace(/https?:\/\/t\.co\/\S+/g, '').trim();
  const authorName   = user.name        || 'Twitter User';
  const authorHandle = user.screen_name || '';

  const mediaArr = data.mediaDetails || data.extended_entities?.media || data.entities?.media || [];
  let parsedMedia = parseMedia(mediaArr);

  if (!parsedMedia.video && data.video?.variants) {
    const mp4s = data.video.variants
      .filter((v) => v.type === 'video/mp4' || v.content_type === 'video/mp4')
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    if (mp4s[0]) {
      parsedMedia.video = mp4s[0].src || mp4s[0].url;
      if (data.video.aspectRatio) {
        parsedMedia.videoWidth  = data.video.aspectRatio[0] * 100;
        parsedMedia.videoHeight = data.video.aspectRatio[1] * 100;
      }
    }
  }

  if (!parsedMedia.image && data.photos?.length) {
    parsedMedia.image = data.photos[0].url;
  }

  const views = data.views?.count ? Number(data.views.count) : null;

  return {
    siteName: `Twitter / @${authorHandle}`,
    title: `${authorName} (@${authorHandle})`,
    description: text + statsLine(data.reply_count ?? null, data.retweet_count ?? null, data.favorite_count ?? null, views),
    ...parsedMedia,
    color: '#1DA1F2',
    redirectUrl: `https://twitter.com/${authorHandle}/status/${tweetId}`,
  };
}

function parseV1(data, tweetId) {
  const user   = data.user || {};
  const text   = (data.full_text || data.text || '').replace(/https?:\/\/t\.co\/\S+/g, '').trim();
  const authorName   = user.name        || 'Twitter User';
  const authorHandle = user.screen_name || '';

  const mediaArr = data.extended_entities?.media || data.entities?.media || [];
  const parsedMedia = parseMedia(mediaArr);

  return {
    siteName: `Twitter / @${authorHandle}`,
    title: `${authorName} (@${authorHandle})`,
    description: text + statsLine(data.reply_count ?? null, data.retweet_count ?? null, data.favorite_count ?? null, null),
    ...parsedMedia,
    color: '#1DA1F2',
    redirectUrl: `https://twitter.com/${authorHandle}/status/${tweetId}`,
  };
}

function parseOEmbed(data, tweetId) {
  const rawHtml   = data.html || '';
  const textMatch = rawHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const text      = textMatch
    ? textMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    : '';

  return {
    siteName: 'Twitter',
    title: data.author_name || 'Twitter User',
    description: text || `Tweet by ${data.author_name}`,
    color: '#1DA1F2',
    redirectUrl: `https://twitter.com/i/status/${tweetId}`,
  };
}

function fmt(n) {
  n = Number(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function fetchTwitterEmbed(path) {
  const cacheKey = `twitter:${path}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const match = path.match(/\/status\/(\d+)/);
  if (!match) return null;
  const tweetId = match[1];

  let embedData = null;

  try {
    const data = await fetchSyndication(tweetId);
    if (data && (data.text || data.full_text)) {
      embedData = parseSyndication(data, tweetId);
    }
  } catch (err) {
    console.warn('[twitter] Syndication failed:', err.message);
  }

  if (!embedData) {
    try {
      const data = await fetchV1(tweetId);
      if (data && (data.full_text || data.text)) {
        embedData = parseV1(data, tweetId);
      }
    } catch (err) {
      console.warn('[twitter] v1.1 failed:', err.message);
    }
  }

  if (!embedData) {
    try {
      const data = await fetchOEmbed(tweetId);
      if (data) embedData = parseOEmbed(data, tweetId);
    } catch (err) {
      console.warn('[twitter] oEmbed failed:', err.message);
    }
  }

  if (embedData) cache.set(cacheKey, embedData);
  return embedData;
}

module.exports = { fetchTwitterEmbed };
