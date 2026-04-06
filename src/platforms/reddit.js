const axios = require('axios');
const cache = require('../cache');

async function fetchRedditEmbed(path) {
  const cacheKey = `reddit:${path}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const originalUrl = `https://www.reddit.com${path.startsWith('/') ? path : '/' + path}`;
  const jsonUrl = originalUrl.replace(/\/?$/, '.json?limit=1');

  let embedData = null;

  try {
    const res = await axios.get(jsonUrl, {
      headers: {
        'User-Agent': 'BetterEmbeds/1.0',
        Accept: 'application/json',
      },
      timeout: 8000,
    });

    const post = res.data?.[0]?.data?.children?.[0]?.data;
    if (!post) throw new Error('Post not found');

    const subreddit = post.subreddit_name_prefixed || `r/${post.subreddit}`;
    const title = post.title || 'Reddit Post';
    const selftext = post.selftext || '';
    const description = selftext.length > 300 ? selftext.slice(0, 297) + '…' : selftext;

    const parts = [];
    if (post.ups != null) parts.push(`⬆️ ${fmt(post.ups)}`);
    if (post.num_comments != null) parts.push(`💬 ${fmt(post.num_comments)}`);
    const statsLine = parts.length ? '\n\n' + parts.join('  ') : '';

    let image = null;
    let video = null;
    let videoWidth = null;
    let videoHeight = null;

    if (post.is_video && post.media?.reddit_video) {
      const rv = post.media.reddit_video;
      video = rv.fallback_url;
      videoWidth = rv.width;
      videoHeight = rv.height;
    }

    if (post.preview?.images?.[0]?.source) {
      image = post.preview.images[0].source.url.replace(/&amp;/g, '&');
    }

    if (!image && post.url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(post.url)) {
      image = post.url;
    }

    embedData = {
      siteName: `Reddit • ${subreddit}`,
      title,
      description: (description + statsLine).trim(),
      image,
      video,
      videoWidth,
      videoHeight,
      color: '#FF4500',
      authorName: post.author ? `u/${post.author}` : 'Reddit',
      redirectUrl: `https://www.reddit.com${post.permalink}`,
    };
  } catch (err) {
    console.warn('[reddit] API failed:', err.message);
  }

  if (embedData) cache.set(cacheKey, embedData);
  return embedData;
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

module.exports = { fetchRedditEmbed };
