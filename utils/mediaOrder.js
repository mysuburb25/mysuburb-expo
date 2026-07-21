// Posts store photos and videos in two separate arrays (images: [...],
// videos: [{url, thumbnailUrl, duration}]) — kept separate mainly
// because they upload and validate differently. `mediaOrder` is a
// lightweight extra field (just an array of 'image'/'video' tokens,
// e.g. ['image','video','image']) recording the sequence they were
// actually picked in, so the feed/detail view can display them
// interleaved instead of "all photos, then all videos".
//
// Posts created before this existed won't have mediaOrder — those
// fall back to images-first-then-videos, which is a reasonable default
// and doesn't break anything, just doesn't preserve original order for
// old posts.
export function getOrderedMedia(post) {
  const images = post.images || [];
  const videos = post.videos || [];
  const order = post.mediaOrder;

  if (!Array.isArray(order) || order.length !== images.length + videos.length) {
    return [
      ...images.map(url => ({ type: 'image', url })),
      ...videos.map(v => ({ type: 'video', ...v })),
    ];
  }

  let ii = 0, vi = 0;
  return order.map(kind =>
    kind === 'video' ? { type: 'video', ...videos[vi++] } : { type: 'image', url: images[ii++] }
  );
}
