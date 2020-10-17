// import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'
const { getAssetFromKV } = require('kv4cf');

/**
 * The DEBUG flag will do two things that help during development:
 * 1. we will skip caching on the edge, which makes it easier to
 *    debug.
 * 2. we will return an error message on exception in your Response rather
 *    than the default 404.html page.
 */
const DEBUG = false

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 500,
        }),
      )
    }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {
  const url = new URL(event.request.url)
  let options = {}

  /**
   * You can add custom logic to how we fetch your assets
   * by configuring the function `mapRequestToAsset`
   */
  // options.mapRequestToAsset = handlePrefix(/^\/docs/)

  try {
    if (DEBUG) {
      // customize caching
      options.cacheControl = {
        bypassCache: true,
      }
    }
    const { origin, pathname: path, search } = new URL(event.request.url);
    if (path.endsWith('/index.html')) {
      return new Response(null, {
        status: 301,
        headers: {
          'Location': `${origin}${path.substring(0, path.length - 10)}${search}`,
          'Cache-Control': 'max-age=3600'
        }
      });
    }

    if (path.endsWith('/')) {
      const response = await getAssetFromKV(event, {
        cacheControl: {
          edgeTtl: 60 * 60,
          browserTtl: 5 * 60
        }
      });
      response.headers.set('Link', '<https://s.hackerchai.com>; rel=dns-prefetch, <https://s.hackerchai.com>; rel=preconnect; crossorigin, <https://cdn.jsdelivr.net>; rel=dns-prefetch, <https://cdn.jsdelivr.net>; rel=preconnect; crossorigin');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      return response;
    }

    if (path.endsWith('.xml')) {
      return getAssetFromKV(event, {
        cacheControl: {
          edgeTtl: 60 * 60,
          browserTtl: 2 * 60 * 60,
        }
      });
    }

    if (path.startsWith('/assets/')) {
      const response = await getAssetFromKV(event, {
        cacheControl: {
          edgeTtl: 365 * 24 * 60 * 60,
          browserTtl: 365 * 24 * 60 * 60,
        }
      });
      response.headers.set('cache-control', `public, max-age=${365 * 24 * 60 * 60}, immutable`);
      return response;
    }

    const response = await getAssetFromKV(event, {
      cacheControl: {
        edgeTtl: 60 * 60,
        browserTtl: 5 * 60
      }
    });

    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');

    return response;
  } catch (e) {
    // if an error is thrown try to serve the asset at 404.html
    if (!DEBUG) {
      try {
        let notFoundResponse = await getAssetFromKV(event, {
          mapRequestToAsset: req => new Request(`${new URL(req.url).origin}/404.html`, req),
        })

        return new Response(notFoundResponse.body, { ...notFoundResponse, status: 404 })
      } catch (e) { }
    }

    return new Response(e.message || e.toString(), { status: 500 })
  }
}

/**
 * Here's one example of how to modify a request to
 * remove a specific prefix, in this case `/docs` from
 * the url. This can be useful if you are deploying to a
 * route on a zone, or if you only want your static content
 * to exist at a specific path.
 */
function handlePrefix(prefix) {
  return request => {
    // compute the default (e.g. / -> index.html)
    let defaultAssetKey = mapRequestToAsset(request)
    let url = new URL(defaultAssetKey.url)

    // strip the prefix from the path for lookup
    url.pathname = url.pathname.replace(prefix, '/')

    // inherit all other props from the default request
    return new Request(url.toString(), defaultAssetKey)
  }
}