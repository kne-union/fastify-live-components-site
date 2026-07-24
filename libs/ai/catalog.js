const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const loadNpmInfo = require('@kne/load-npm-info');
const { parse: parseMdDoc } = require('@kne/md-doc');
const { stripHtml } = require('./prompts');

const DOC_MD_RE = /<!--START_SECTION:DOC_MD-->([\s\S]*?)<!--END_SECTION:DOC_MD-->/;

const extractDocMd = readme => {
  if (!readme || typeof readme !== 'string') {
    return '';
  }
  const m = readme.match(DOC_MD_RE);
  return (m ? m[1] : readme).trim();
};

const splitComponentSections = docMd => {
  if (!docMd) {
    return [];
  }
  return docMd.split(/\n(?=# )/g).filter(s => s.startsWith('# '));
};

const resolvePackageName = (remote, options) => {
  if (remote.packageName) {
    return remote.packageName;
  }
  const map = options.ai?.remotePackageNames || {};
  if (map[remote.name]) {
    return map[remote.name];
  }
  return `@kne-components/${remote.name}`;
};

const getCacheDir = (options, remoteName, version) => {
  const base = options.ai?.catalogCacheDir || path.resolve(__dirname, '../../data/ai-catalog');
  return path.join(base, remoteName, version || 'latest');
};

const isCacheComplete = dir => {
  try {
    return fs.existsSync(path.join(dir, 'index.json')) && fs.existsSync(path.join(dir, 'components.json'));
  } catch {
    return false;
  }
};

const readCachedCatalog = async (dir, remoteName, version) => {
  const [index, components, meta] = await Promise.all([
    fsp.readFile(path.join(dir, 'index.json'), 'utf8').then(JSON.parse),
    fsp.readFile(path.join(dir, 'components.json'), 'utf8').then(JSON.parse),
    fsp
      .readFile(path.join(dir, 'meta.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => ({}))
  ]);
  return {
    remote: remoteName,
    version,
    packageName: meta.packageName,
    index,
    components
  };
};

const buildCatalogFromReadme = (readme, remoteName) => {
  const docMd = extractDocMd(readme);
  const sections = splitComponentSections(docMd);
  const index = [];
  const components = {};

  sections.forEach(section => {
    let parsed;
    try {
      parsed = parseMdDoc(section);
    } catch {
      return;
    }
    const name = parsed.name || '';
    if (!name) {
      return;
    }
    const token = `${remoteName}:${name}`;
    const summary = stripHtml(parsed.summary).slice(0, 400);
    index.push({ name, token, summary });
    components[name] = {
      name,
      token,
      summary: parsed.summary || '',
      api: parsed.api || '',
      examples: (parsed.example?.list || []).map((ex, i) => ({
        id: String(i),
        title: ex.title || `示例${i + 1}`,
        description: ex.description || '',
        code: ex.code || ''
      }))
    };
  });

  return { index, components };
};

const ensureRemoteCatalog = async (remote, options) => {
  const name = remote?.name;
  const version = remote?.version || 'latest';
  if (!name) {
    return null;
  }

  const dir = getCacheDir(options, name, version);
  if (isCacheComplete(dir)) {
    return readCachedCatalog(dir, name, version);
  }

  const packageName = resolvePackageName(remote, options);
  const loadOpts = {};
  if (options.ai?.npmRegistry) {
    loadOpts.registry = options.ai.npmRegistry;
  }

  let info;
  try {
    const pkgSpec = version && version !== 'latest' ? `${packageName}@${version}` : packageName;
    info = await loadNpmInfo(pkgSpec, loadOpts);
  } catch (e) {
    console.warn(`[ai-catalog] load-npm-info failed for ${packageName}@${version}: ${e.message}`);
    await fsp.mkdir(dir, { recursive: true });
    const empty = { index: [], components: {} };
    await Promise.all([
      fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ packageName, version, error: e.message, builtAt: Date.now() }, null, 2)),
      fsp.writeFile(path.join(dir, 'index.json'), JSON.stringify(empty.index, null, 2)),
      fsp.writeFile(path.join(dir, 'components.json'), JSON.stringify(empty.components, null, 2))
    ]);
    return { remote: name, version, packageName, ...empty };
  }

  const { index, components } = buildCatalogFromReadme(info.readme, name);
  await fsp.mkdir(dir, { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ packageName, version: info.version || version, builtAt: Date.now() }, null, 2)),
    fsp.writeFile(path.join(dir, 'index.json'), JSON.stringify(index, null, 2)),
    fsp.writeFile(path.join(dir, 'components.json'), JSON.stringify(components, null, 2))
  ]);

  return {
    remote: name,
    version: info.version || version,
    packageName,
    index,
    components
  };
};

const ensureRemotesCatalogs = async (remotes, options) => {
  const list = Array.isArray(remotes) ? remotes : [];
  const catalogs = [];
  for (const remote of list) {
    const cat = await ensureRemoteCatalog(remote, options);
    if (cat) {
      catalogs.push(cat);
    }
  }
  return catalogs;
};

const getExampleCode = (catalogs, { remote, version, component, exampleId }) => {
  const cat = (catalogs || []).find(c => c.remote === remote && (!version || c.version === version || String(c.version) === String(version))) || (catalogs || []).find(c => c.remote === remote);
  if (!cat) {
    return { error: `catalog not found: ${remote}` };
  }
  const comp = cat.components?.[component];
  if (!comp) {
    return { error: `component not found: ${component}` };
  }
  const ex = (comp.examples || []).find(e => String(e.id) === String(exampleId));
  if (!ex) {
    return { error: `example not found: ${exampleId}` };
  }
  return { title: ex.title, description: ex.description, code: ex.code || '' };
};

module.exports = {
  ensureRemotesCatalogs,
  ensureRemoteCatalog,
  getExampleCode,
  getCacheDir,
  buildCatalogFromReadme,
  extractDocMd,
  resolvePackageName
};
