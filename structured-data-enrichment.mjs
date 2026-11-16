/** Build-time metadata for the existing artwork and rendered site content. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const modified = '2026-11-16T09:33:55Z';
const rightsPath = '/image-rights/';
const owner = 'Mira John';
const notice = '© Mira John. All rights reserved.';
const contact = 'mira@dnsnotify.com';
const sites = {
  email: { origin: 'https://emaildns.gitlab.io', name: 'Email DNS Check', product: 'email-dns-monitoring', productLabel: 'email DNS monitoring', terms: ['MX record monitoring', 'email DNS monitoring', 'nameserver monitoring'] },
  alias: { origin: 'https://dnsemail.gitlab.io', name: 'Email DNS Check', target: 'https://emaildns.gitlab.io', terms: ['email DNS monitoring'] },
  github: { origin: 'https://dns-change-monitoring.github.io', name: 'DNS Change Monitoring', product: 'dns-change-monitoring', productLabel: 'DNS change monitoring', terms: ['DNS change monitoring', 'monitor DNS changes', 'DNS change alerts'] },
  ssl: { origin: 'https://ssl-monitoring.pages.dev', name: 'SSL Monitoring Handbook', product: 'ssl-certificate-expiry-monitoring', productLabel: 'SSL certificate expiry monitoring', terms: ['SSL certificate expiry monitoring', 'SSL monitoring', 'SSL expiry monitoring'] },
  domain: { origin: 'https://domain-expiry.pages.dev', name: 'Domain Expiry', product: 'domain-expiry-monitoring', productLabel: 'domain expiry monitoring', terms: ['domain expiry checker', 'domain checker', 'domain expiry'] },
};
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plain = value => value.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&(?:amp|quot|apos|lt|gt|#39);/g, c => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&#39;': "'" })[c])
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const selector = id => '[id="' + id.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"]';
const schemaScript = /(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g;
const graphOf = data => data['@graph'] || [data];
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const serialize = data => JSON.stringify(ordered(data)).replaceAll('<', '\\u003c');
const pageTypes = new Set(['WebPage', 'CollectionPage', 'ProfilePage', 'FAQPage']);

function xmp(url, license, permission) {
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="${esc(url)}" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"><dc:creator><rdf:Seq><rdf:li>${owner}</rdf:li></rdf:Seq></dc:creator><dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${notice}</rdf:li></rdf:Alt></dc:rights><dc:description><rdf:Alt><rdf:li xml:lang="x-default">Image permissions: ${esc(license)}</rdf:li></rdf:Alt></dc:description><xmp:MetadataDate>${modified}</xmp:MetadataDate><xmpRights:Marked>True</xmpRights:Marked><xmpRights:WebStatement>${esc(license)}</xmpRights:WebStatement><xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">Permission required for reuse. Contact ${owner}.</rdf:li></rdf:Alt></xmpRights:UsageTerms><plus:Licensor><rdf:Seq><rdf:li rdf:parseType="Resource"><plus:LicensorName>${owner}</plus:LicensorName><plus:LicensorURL>${esc(permission)}</plus:LicensorURL></rdf:li></rdf:Seq></plus:Licensor></rdf:Description></rdf:RDF></x:xmpmeta>`;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunks(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const result = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), end = offset + length + 12;
    assert(end <= bytes.length, 'Truncated PNG');
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), 'PNG CRC: ' + type);
    result.push({ type, data: bytes.subarray(offset + 8, end - 4), raw: bytes.subarray(offset, end) });
    offset = end;
  }
  assert.equal(result.at(-1).type, 'IEND');
  return result;
}
function pngMetadata(bytes, metadata) {
  const original = chunks(bytes);
  const data = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0'), Buffer.from(metadata)]);
  const typeAndData = Buffer.concat([Buffer.from('iTXt'), data]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(typeAndData));
  const chunk = Buffer.concat([length, typeAndData, crc]);
  const kept = original.filter(c => !(c.type === 'iTXt' && c.data.subarray(0, 18).toString().startsWith('XML:com.adobe.xmp')));
  const updated = Buffer.concat([bytes.subarray(0, 8), ...kept.slice(0, -1).map(c => c.raw), chunk, kept.at(-1).raw]);
  const after = chunks(updated);
  assert.deepEqual(after.filter(c => c.type !== 'iTXt').map(c => c.raw), original.filter(c => c.type !== 'iTXt').map(c => c.raw), 'PNG image data must not change');
  return updated;
}

async function persist(file, body, compressed) {
  await writeFile(file, body);
  if (compressed) await Promise.all([writeFile(file + '.gz', gzipSync(body)), writeFile(file + '.br', brotliCompressSync(body))]);
}
async function walk(root) {
  const files = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, item.name);
    if (item.isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files;
}
function refreshHashes(html) {
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1])
    .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  return html.replace(/(<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content=")([^"]+)(")/g, (_, start, encoded, end) => {
    const policy = encoded.replace(/&#x([a-f0-9]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
      .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const updated = policy.replace(/\bscript-src\s+([^;]*)/, (_, values) => 'script-src ' + values.replace(/'sha256-[^']+'\s*/g, '').trim() + ' ' + [...new Set(hashes)].join(' '));
    return start + updated.replaceAll('&', '&amp;').replaceAll('"', '&quot;') + end;
  });
}
function navigation(html, config) {
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
  const nav = header?.match(/<nav\b[\s\S]*?<\/nav>/)?.[0];
  if (!nav) return null;
  const parts = [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m, index) => ({
    '@type': 'SiteNavigationElement', '@id': config.origin + '/#navigation-' + (index + 1), name: plain(m[2]), url: new URL(m[1], config.origin).href,
  }));
  return { '@type': 'SiteNavigationElement', '@id': config.origin + '/#navigation', name: 'Main navigation', hasPart: parts };
}

function rightsPage(profile, config, assets) {
  const canonical = config.origin + rightsPath;
  const title = 'Image Rights and Permissions | ' + config.name;
  const description = 'Image copyright, creator credits and permission requests for ' + config.name + ' artwork by Mira John.';
  const mainTag = profile.match(/<main\b[^>]*>/)[0];
  const headerClass = profile.match(/<main\b[^>]*>[\s\S]*?<header\b([^>]*)>/)?.[1] || '';
  const main = `${mainTag}<article><header${headerClass}><p class="eyebrow">IMAGE PERMISSIONS</p><h1>Image rights and permissions</h1><p>${notice}</p></header><section id="image-ownership"><h2>Artwork by Mira John</h2><p>Mira John owns the original images published on ${esc(config.name)}. Permission is required to reproduce, adapt or redistribute this artwork.</p><ul>${assets.map(a => `<li><a href="/${a.file}">${esc(a.file)}</a> — ${a.width} × ${a.height}</li>`).join('')}</ul></section><section id="permission"><h2>Request image permission</h2><p><a href="mailto:${contact}?subject=${encodeURIComponent('Image permission — ' + config.name)}">Email Mira John</a> with the image URL, intended use and where the image will appear. Written permission specifies the approved use and credit.</p><p>Creator and copyright owner: <a href="/authors/mira-john/">Mira John</a>.</p></section><p class="small">Continuous monitoring: <a href="https://dnsnotify.com/${config.product}/">DNS Notify ${config.productLabel}</a>.</p></article></main>`;
  let html = profile.replace(/<main\b[\s\S]*?<\/main>/, main).replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>');
  html = html.replace(/<meta\b([^>]*)(?:name|property)="([^"]+)"([^>]*)>/g, (tag, before, name) => {
    const values = { description, keywords: 'Image rights, image permission, Mira John, ' + config.name + ' artwork', 'DC.title': title, 'DC.subject': 'Image rights and permissions', 'dcterms.modified': modified,
      'og:type': 'website', 'og:title': title, 'twitter:title': title, 'og:description': description, 'twitter:description': description, 'og:url': canonical };
    return name in values ? tag.replace(/content="[^"]*"/, 'content="' + esc(values[name]) + '"') : tag;
  });
  html = html.replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${canonical}">`);
  html = html.replace(schemaScript, (_, start, content, end) => {
    const data = JSON.parse(content), graph = graphOf(data).filter(n => !['SiteNavigationElement', 'Table', 'WebPageElement'].includes(n['@type']));
    if (data['@graph']) data['@graph'] = graph;
    const page = graph.find(n => pageTypes.has(n['@type']));
    assert(page, 'Profile page entity missing');
    Object.assign(page, { '@type': 'WebPage', '@id': canonical + '#page', url: canonical, name: 'Image rights and permissions', headline: 'Image rights and permissions', description,
      dateModified: modified, about: { '@type': 'DefinedTerm', name: 'Image reuse permission' }, mainEntity: { '@type': 'ItemList', name: 'Artwork covered by this policy',
        itemListElement: assets.map((a, index) => ({ '@type': 'ListItem', position: index + 1, name: a.file, url: config.origin + '/' + a.file })) } });
    if (page.mainEntityOfPage) page.mainEntityOfPage = canonical;
    delete page.hasPart;
    for (const asset of assets) if (!graph.some(n => n['@type'] === 'ImageObject' && new URL(n.contentUrl || n.url).pathname === '/' + asset.file)) {
      graph.push({ '@type': 'ImageObject', '@id': config.origin + '/#asset-' + asset.file.replaceAll(/[^a-z0-9]/gi, '-'), name: asset.name,
        url: config.origin + '/' + asset.file, contentUrl: config.origin + '/' + asset.file, width: asset.width, height: asset.height });
    }
    const crumbs = graph.find(n => n['@type'] === 'BreadcrumbList');
    if (crumbs) Object.assign(crumbs.itemListElement.at(-1), { name: 'Image permissions', item: canonical });
    return start + serialize(data) + end;
  });
  if (config === sites.domain) html = html.replace(/(<div class="breadcrumbs wrap">)[\s\S]*?(<\/div>)/, '$1<a href="/">Domain Expiry</a><span aria-hidden="true">/</span><span>Image permissions</span>$2');
  html = html.replace(/(<time[^>]*datetime=")[^"]+("[^>]*>)[^<]*(<\/time>)/g, (_, first, second, last) => first + modified + second + '16 November 2026' + last);
  return { html, canonical, title, description };
}

function footerLink(html, config, current) {
  const url = (config.target || '') + rightsPath;
  const label = current === config.origin + rightsPath ? '<span aria-current="page">Image permissions</span>' : `<a href="${url}">Image permissions</a>`;
  if (current === config.origin + rightsPath) {
    html = html.replace(`<a href="${url}">Image permissions</a>`, label);
    if (html.includes(label)) return html;
  }
  if (html.includes(`href="${url}"`)) return html;
  if (html.includes('<div class="footer-meta">')) return html.replace('<div class="footer-meta">', '<div class="footer-meta">' + label + '<span aria-hidden="true">·</span>');
  return html.replace(/(<footer\b[\s\S]*?<nav\b[^>]*>)([\s\S]*?)(<\/nav>)/, '$1$2' + label + '$3');
}

export async function enrichSite(site, directory, manifestPath) {
  const config = sites[site];
  assert(config, 'Unknown supporting site');
  const root = path.resolve(directory), compressed = site === 'email' || site === 'alias';
  const rightsOrigin = config.target || config.origin;
  const creator = { '@type': 'Person', '@id': rightsOrigin + '/authors/mira-john/#person', name: owner, url: rightsOrigin + '/authors/mira-john/' };
  const license = rightsOrigin + rightsPath, permission = license + '#permission';
  const files = (await walk(root)).sort(), assets = [];
  for (const file of files.filter(f => /\.(?:png|svg)$/.test(f))) {
    const name = path.relative(root, file).replaceAll('\\', '/');
    const before = await readFile(file), metadata = xmp(config.origin + '/' + name, license, permission);
    let after, width, height;
    if (name.endsWith('.png')) {
      after = pngMetadata(before, metadata); width = before.readUInt32BE(16); height = before.readUInt32BE(20);
    } else {
      const original = before.toString('utf8').replace(/\r\n/g, '\n');
      const cleaned = original.replace(/\s*<metadata\b[^>]*id="image-rights-metadata"[^>]*>[\s\S]*?<\/metadata>/g, '');
      const box = cleaned.match(/viewBox="[^"]*?\s([\d.]+)\s([\d.]+)"/);
      width = Number(box?.[1] || cleaned.match(/\bwidth="(\d+)"/)?.[1]); height = Number(box?.[2] || cleaned.match(/\bheight="(\d+)"/)?.[1]);
      assert(width > 0 && height > 0, name);
      after = Buffer.from(cleaned.replace(/(<svg\b[^>]*>)/, '$1\n<metadata id="image-rights-metadata">' + metadata + '</metadata>'));
      assert.equal(after.toString().replace(/\s*<metadata\b[^>]*id="image-rights-metadata"[^>]*>[\s\S]*?<\/metadata>/, ''), cleaned, 'SVG geometry must not change');
    }
    await persist(file, after, compressed && name.endsWith('.svg'));
    const label = name.endsWith('.svg') ? plain(after.toString().match(/<title\b[^>]*>([\s\S]*?)<\/title>/)?.[1] || config.name + ' logo')
      : config.name + (name.includes('apple') ? ' home-screen icon' : name.includes('favicon') ? ' browser icon' : ' preview');
    assets.push({ file: name, name: label, width, height, bytes: after.length, sha256: sha(after), pixelsPreserved: true });
  }

  let rights;
  if (site !== 'alias') {
    const profile = await readFile(path.join(root, 'authors/mira-john/index.html'), 'utf8');
    rights = rightsPage(profile, config, assets);
    await mkdir(path.join(root, 'image-rights'), { recursive: true });
    await writeFile(path.join(root, 'image-rights/index.html'), rights.html);
  }
  const allFiles = (await walk(root)).sort();
  for (const file of allFiles.filter(f => f.endsWith('.html') && !path.basename(f).startsWith('google'))) {
    let html = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (!canonical) continue;
    html = footerLink(html, config, canonical);
    // Asset versions must describe the final metadata-bearing SVG bytes.
    for (const asset of assets) html = html.replaceAll(new RegExp('/' + asset.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=[a-f0-9]{12}', 'g'), '/' + asset.file + '?v=' + asset.sha256.slice(0, 12));
    const title = plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] || html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || config.name);
    const body = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] || '';
    const parts = [];
    if (site !== 'alias') {
      let number = 0;
      html = html.replace(/<table\b([^>]*)>([\s\S]*?)<\/table>/g, (_, attrs, content) => {
        const id = attrs.match(/\bid="([^"]+)"/)?.[1] || 'data-table-' + (++number);
        parts.push({ '@type': 'Table', '@id': canonical + '#' + id, name: plain(content.match(/<caption[^>]*>([\s\S]*?)<\/caption>/)?.[1] || title + ' table'),
          url: canonical + '#' + id, text: plain(content), cssSelector: selector(id), inLanguage: 'en', isPartOf: { '@id': canonical + '#page' } });
        return '<table' + attrs + (attrs.includes('id=') ? '' : ' id="' + id + '"') + '>' + content + '</table>';
      });
      for (const match of body.matchAll(/<section\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/section>/g)) {
        if (/\bhidden\b|data-nosnippet/.test(match[1]) || /^(?:results?|provider-findings|saved-domains|recent-checks)$/.test(match[2])) continue;
        const heading = match[3].match(/<h[2-3]\b[^>]*>([\s\S]*?)<\/h[2-3]>/)?.[1];
        if (heading) parts.push({ '@type': 'WebPageElement', '@id': canonical + '#' + match[2], name: plain(heading), url: canonical + '#' + match[2], cssSelector: selector(match[2]), isPartOf: { '@id': canonical + '#page' } });
      }
    }
    html = html.replace(schemaScript, (_, start, content, end) => {
      const data = JSON.parse(content), graph = graphOf(data);
      function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node['@type'] === 'ImageObject') {
          Object.assign(node, { creator, copyrightHolder: { '@id': creator['@id'] }, creditText: owner, copyrightNotice: notice, license, acquireLicensePage: permission,
            isAccessibleForFree: true, dateModified: modified, isPartOf: { '@id': rightsOrigin + '/#' + (site === 'github' ? 'website' : site === 'ssl' ? 'site' : 'website') } });
          const url = node.contentUrl || node.url;
          const asset = url && assets.find(a => new URL(url, config.origin).origin === config.origin && new URL(url, config.origin).pathname === '/' + a.file);
          if (asset) Object.assign(node, { contentSize: asset.bytes + ' bytes', sha256: asset.sha256, encodingFormat: asset.file.endsWith('.svg') ? 'image/svg+xml' : 'image/png', width: asset.width, height: asset.height });
        }
        for (const value of Object.values(node)) if (value && typeof value === 'object') {
          if (Array.isArray(value)) value.forEach(visit); else visit(value);
        }
      }
      visit(data);
      if (site !== 'alias') {
        const page = graph.find(n => pageTypes.has(n['@type']));
        const siteNode = graph.find(n => n['@type'] === 'WebSite');
        if (siteNode) Object.assign(siteNode, { about: config.terms.map(name => ({ '@type': 'DefinedTerm', name })), isAccessibleForFree: true });
        if (page) {
          page.keywords = [...new Set([title, ...config.terms])];
          page.about ||= { '@type': 'DefinedTerm', name: title };
          page.isAccessibleForFree = true;
          const nav = navigation(html, config);
          if (nav && !graph.some(n => n['@id'] === nav['@id'])) graph.push(nav);
          for (const part of parts) if (!graph.some(n => n['@id'] === part['@id'])) graph.push(part);
          // Sections link back with isPartOf; page.hasPart is reserved by Google's paywall parser.
          if (page.hasPart) {
            const retained = (Array.isArray(page.hasPart) ? page.hasPart : [page.hasPart]).filter(p => !graph.some(n => n['@id'] === p['@id'] && ['SiteNavigationElement', 'WebPageElement', 'Table'].includes(n['@type'])));
            if (retained.length) page.hasPart = retained; else delete page.hasPart;
          }
        }
        for (const node of graph.filter(n => n['@type'] === 'TechArticle')) {
          node.keywords = [...new Set([title, ...config.terms])]; node.about ||= { '@type': 'DefinedTerm', name: title };
          node.wordCount = plain(body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/)?.[1] || body).split(/\s+/).filter(Boolean).length;
        }
        for (const app of graph.filter(n => n['@type'] === 'WebApplication')) {
          app.browserRequirements = 'JavaScript enabled'; app.inLanguage = 'en';
          const lookup = site === 'email' || site === 'domain';
          app.potentialAction = { '@type': lookup ? 'SearchAction' : 'UseAction', name: lookup ? 'Look up domain records' : app.name,
            target: { '@type': 'EntryPoint', urlTemplate: site === 'email' ? app.url + '?d={domain}#checker' : site === 'domain' ? config.origin + '/{domain}' : app.url,
              actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] }, ...(lookup ? { 'query-input': 'required name=domain' } : {}) };
        }
      }
      return start + serialize(data) + end;
    });
    await persist(file, refreshHashes(html), compressed);
  }

  if (site !== 'alias') {
    const sitemapFile = path.join(root, 'sitemap.xml');
    let sitemap = await readFile(sitemapFile, 'utf8');
    if (!sitemap.includes('<loc>' + rights.canonical + '</loc>')) sitemap = sitemap.replace('</urlset>', `<url><loc>${rights.canonical}</loc><lastmod>${modified}</lastmod></url></urlset>`);
    sitemap = sitemap.replace(/<lastmod>[^<]+<\/lastmod>/g, '<lastmod>' + modified + '</lastmod>');
    await writeFile(sitemapFile, sitemap);
    const index = path.join(root, 'llms.txt');
    let text = await readFile(index, 'utf8');
    if (!text.includes(rights.canonical)) await persist(index, text + `\n- [Image rights and permissions](${rights.canonical}): Original artwork by Mira John; request written permission for reuse.\n`, compressed);
    if (manifestPath) {
      const rows = JSON.parse(await readFile(manifestPath, 'utf8'));
      const routeKey = 'route' in rows[0] ? 'route' : 'path';
      if (!rows.some(row => row[routeKey] === rightsPath)) rows.push({ [routeKey]: rightsPath, file: 'image-rights/index.html', title: rights.title, description: rights.description,
        canonical: rights.canonical, lastmod: modified, article: false, application: false });
      await writeFile(manifestPath, JSON.stringify(rows, null, 2) + '\n');
    }
    const routesFile = path.join(root, '_routes.json');
    try {
      const routes = JSON.parse(await readFile(routesFile, 'utf8'));
      for (const route of ['/image-rights', '/image-rights/*']) if (!routes.exclude.includes(route)) routes.exclude.push(route);
      assert(routes.exclude.length + routes.include.length <= 100);
      await writeFile(routesFile, JSON.stringify(routes, null, 2) + '\n');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const report = { site, origin: config.origin, rights: license, creator: owner, copyrightNotice: notice, assets, rightsPage: rights?.canonical, imagePixelsPreserved: true };
  console.log(`Enriched ${config.name}: ${assets.length} existing images; image rights, navigation, sections, tables and real application actions.`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [site, directory, manifestPath, reportPath] = process.argv.slice(2);
  const report = await enrichSite(site, directory, manifestPath || undefined);
  if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
