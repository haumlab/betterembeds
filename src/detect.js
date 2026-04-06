function detectPlatform(rawPath, hostname) {
  if (hostname) {
    const host = hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'twitter.com' || host === 'x.com')
      return { platform: 'twitter', path: rawPath };
    if (host === 'instagram.com')
      return { platform: 'instagram', path: rawPath };
    if (host === 'tiktok.com')
      return { platform: 'tiktok', path: rawPath };
    if (host === 'reddit.com' || host === 'redd.it')
      return { platform: 'reddit', path: rawPath };
    if (host === 'facebook.com' || host === 'fb.com' || host === 'fb.watch' || host === 'm.facebook.com')
      return { platform: 'facebook', path: rawPath };
    return null;
  }

  const p = rawPath.split('?')[0];

  if (/^\/(?:i\/)?[A-Za-z0-9_]{1,50}\/status\/\d+/.test(p))
    return { platform: 'twitter', path: rawPath };

  if (/^\/(p|tv|stories)\//.test(p))
    return { platform: 'instagram', path: rawPath };

  if (/^\/reels?\/([A-Za-z0-9_-]+)/.test(p)) {
    const id = p.match(/^\/reels?\/([A-Za-z0-9_-]+)/)[1];
    return { platform: /^\d+$/.test(id) ? 'facebook' : 'instagram', path: rawPath };
  }

  if (/^\/@[^/]+\/video\/\d+/.test(p))
    return { platform: 'tiktok', path: rawPath };
  if (/^\/(v|t)\/[A-Za-z0-9]+/.test(p))
    return { platform: 'tiktok', path: rawPath };

  if (/^\/r\/[A-Za-z0-9_]+/.test(p))
    return { platform: 'reddit', path: rawPath };
  if (/^\/u(?:ser)?\/[A-Za-z0-9_-]+\/comments\//.test(p))
    return { platform: 'reddit', path: rawPath };

  if (/^\/marketplace\/item\/[A-Za-z0-9_-]+/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/events\/[A-Za-z0-9_-]+/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/watch/.test(p) && rawPath.includes('v='))
    return { platform: 'facebook', path: rawPath };
  if (/^\/(?:[^/]+\/)?videos\/[A-Za-z0-9_-]+/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/groups\/[^/]+\/(?:permalink|posts)\/[A-Za-z0-9_-]+/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/[^/]+\/posts\/[A-Za-z0-9_-]+/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/permalink\.php/.test(p))
    return { platform: 'facebook', path: rawPath };
  if (/^\/photos?/.test(p) && (rawPath.includes('fbid=') || /\/[A-Za-z0-9_-]+\/?$/.test(p)))
    return { platform: 'facebook', path: rawPath };

  return null;
}

module.exports = { detectPlatform };
