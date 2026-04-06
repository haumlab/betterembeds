function buildEmbed(data, originalUrl) {
  const {
    siteName,
    title,
    description,
    image,
    imageWidth,
    imageHeight,
    video,
    videoType = 'video/mp4',
    videoWidth,
    videoHeight,
    color = '#1DA1F2',
    authorName,
    redirectUrl,
  } = data;

  const dest = redirectUrl || originalUrl;

  const videoMeta = video
    ? `
  <meta property="og:type" content="video.other" />
  <meta property="og:video" content="${esc(video)}" />
  <meta property="og:video:secure_url" content="${esc(video)}" />
  <meta property="og:video:type" content="${esc(videoType)}" />
  ${videoWidth ? `<meta property="og:video:width" content="${videoWidth}" />` : ''}
  ${videoHeight ? `<meta property="og:video:height" content="${videoHeight}" />` : ''}
  <meta name="twitter:card" content="player" />
  <meta name="twitter:player" content="${esc(video)}" />
  ${videoWidth ? `<meta name="twitter:player:width" content="${videoWidth}" />` : ''}
  ${videoHeight ? `<meta name="twitter:player:height" content="${videoHeight}" />` : ''}`
    : `
  <meta property="og:type" content="website" />
  ${image ? `<meta name="twitter:card" content="summary_large_image" />` : `<meta name="twitter:card" content="summary" />`}`;

  const imageMeta = image
    ? `
  <meta property="og:image" content="${esc(image)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  ${imageWidth ? `<meta property="og:image:width" content="${imageWidth}" />` : ''}
  ${imageHeight ? `<meta property="og:image:height" content="${imageHeight}" />` : ''}`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:site_name" content="${esc(siteName || 'BetterEmbeds')}" />
  <meta property="og:title" content="${esc(title || '')}" />
  <meta property="og:description" content="${esc(description || '')}" />
  <meta property="og:url" content="${esc(dest)}" />
  <meta name="theme-color" content="${esc(color)}" />
  ${authorName ? `<meta name="twitter:creator" content="${esc(authorName)}" />` : ''}
  ${videoMeta}
  ${imageMeta}
  <meta http-equiv="refresh" content="0; url=${esc(dest)}" />
  <link rel="canonical" href="${esc(dest)}" />
  <title>${esc(title || siteName || 'BetterEmbeds')}</title>
</head>
<body>
  <p>Redirecting to <a href="${esc(dest)}">${esc(dest)}</a>…</p>
</body>
</html>`;
}

function buildError(message, redirectUrl) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="BetterEmbeds" />
  <meta property="og:description" content="${esc(message)}" />
  ${redirectUrl ? `<meta http-equiv="refresh" content="0; url=${esc(redirectUrl)}" />` : ''}
  <title>BetterEmbeds — Error</title>
</head>
<body>
  <p>${esc(message)}</p>
  ${redirectUrl ? `<p><a href="${esc(redirectUrl)}">Go to original URL</a></p>` : ''}
</body>
</html>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { buildEmbed, buildError };
