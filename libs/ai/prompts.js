const stripHtml = html =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LIVE_COMPONENT_SPEC = `
## Live 组件规范（必须遵守）

1. 编辑对象是配置里的 content 字段：一段 JSX 表达式源码，不是完整 .js 模块，也不是 PlantUML 编码串。
2. 运行时会编译为 render(<content>);，因此 content 应是可放入 render(...) 的表达式；不要写 import / export / 外层 render(。
3. 运行时可用标识：
   - React、Antd（antd 全量）、props（合并后的组件参数）
   - scope 声明的变量名（如 FormInfo ← components-core:FormInfo），另有 PureGlobal
   - libs：仅限当前请求告知的 libKeys，禁止使用未列出的 lib 标识符
4. 组件选用优先级（强制）：
   1) 远程组件优先（本次 remotes 索引 / 当前 scope 中已有）
   2) 其次 Antd.*
   3) 最后原生 HTML；禁止用 HTML 重复实现已有远程或 Antd 能力
5. props：{ name: { type, defaultValue } }，代码里用 props.xxx；scope：{ 变量名: 'moduleToken' }。若使用了当前 scope 没有的远程组件，须通过 suggestScope 工具声明 suggestedScope。
6. 使用 FormInfo 时字段须落在 <FormInfo.Form> 上下文中（已有则保持；缺失可包一层）。
7. 保持现有代码风格；不引入 npm 包名式 import。文档示例中的 _FormInfo / @components/FormInfo 在 Live 中应写成 scope 变量 FormInfo + token components-core:FormInfo。
`.trim();

const buildLibsSection = libKeys => {
  const keys = Array.isArray(libKeys) ? libKeys.filter(Boolean) : [];
  if (!keys.length) {
    return '当前环境可用 libs：（无）请勿使用任何第三方 lib 标识符。';
  }
  return `当前环境可用 libs：${keys.join(', ')}。只能使用这些标识符。`;
};

const buildCatalogIndexSection = catalogs => {
  if (!catalogs?.length) {
    return '远程组件索引：（无可用索引）';
  }
  const lines = ['远程组件索引（L1）：'];
  catalogs.forEach(cat => {
    lines.push(`### ${cat.remote}@${cat.version}`);
    (cat.index || []).forEach(item => {
      lines.push(`- ${item.name} | ${item.token} | ${item.summary || ''}`);
    });
  });
  return lines.join('\n');
};

const buildComponentDetailSection = (catalogs, hitNames) => {
  if (!hitNames?.length || !catalogs?.length) {
    return '';
  }
  const nameSet = new Set(hitNames.map(n => String(n).toLowerCase()));
  const blocks = [];
  catalogs.forEach(cat => {
    const components = cat.components || {};
    Object.keys(components).forEach(name => {
      if (!nameSet.has(name.toLowerCase())) {
        return;
      }
      const c = components[name];
      const examples = (c.examples || []).map(ex => `- id=${ex.id} | ${ex.title || ''} | ${ex.description || ''}`).join('\n');
      blocks.push(
        [
          `### 组件详情 ${c.token || `${cat.remote}:${name}`}`,
          stripHtml(c.summary).slice(0, 800),
          c.api ? `API 摘要：${stripHtml(c.api).slice(0, 1200)}` : '',
          '示例目录（仅 title/description，完整 code 请调用 getComponentExample）：',
          examples || '（无示例）'
        ]
          .filter(Boolean)
          .join('\n')
      );
    });
  });
  return blocks.join('\n\n');
};

const collectHitComponentNames = ({ messages = [], scope = {}, catalogs = [] }) => {
  const hits = new Set();
  Object.keys(scope || {}).forEach(k => hits.add(k));
  Object.values(scope || {}).forEach(token => {
    const m = String(token).match(/:([^@]+)/);
    if (m) {
      hits.add(m[1]);
    }
  });
  const text = (messages || []).map(m => m.content || '').join('\n');
  catalogs.forEach(cat => {
    (cat.index || []).forEach(item => {
      if (item.name && text.includes(item.name)) {
        hits.add(item.name);
      }
    });
  });
  return Array.from(hits);
};

const buildRefineSystemPrompt = ctx => {
  const { libKeys = [], catalogs = [], messages = [], scope = {}, hasSelection, selectionLabel } = ctx;
  const hits = collectHitComponentNames({ messages, scope, catalogs });
  const detail = buildComponentDetailSection(catalogs, hits);
  return [
    '你是 Live 组件需求顾问（不是通用前端架构师）。只聊需求、完善描述，禁止输出可运行业务源码或大段 JSX。',
    LIVE_COMPONENT_SPEC,
    buildLibsSection(libKeys),
    buildCatalogIndexSection(catalogs),
    detail,
    hasSelection ? `当前讨论范围限定在选中组件：${selectionLabel || '已选中片段'}。` : '当前讨论整份 content。',
    `行为规则：
1. 推荐组件时遵守：远程 → Antd → HTML。
2. 涉及 UI 结构时，必须用 ASCII 线框给出 2～4 个方案（A/B/C…），简述差异，请用户选择；选定前不要宣称需求已确认。
3. 信息与布局都够了后，用短结构化小结（目标 / 改动点 / 选用布局 / 建议组件 / 是否动 props·scope），并明确提示用户点击界面上的「开始生成」按钮。
4. 不要暗示会自动写代码或自行进入生成阶段。
5. 不要输出完整组件实现。`
  ]
    .filter(Boolean)
    .join('\n\n');
};

const buildGenerateSystemPrompt = ctx => {
  const { libKeys = [], catalogs = [], messages = [], scope = {}, hasSelection, selectionLabel } = ctx;
  const hits = collectHitComponentNames({ messages, scope, catalogs });
  // generate：对命中组件 + 索引前列组件提供详情；若无命中则不塞过多
  const detailNames = hits.length ? hits : (catalogs[0]?.index || []).slice(0, 5).map(i => i.name);
  const detail = buildComponentDetailSection(catalogs, detailNames);
  return [
    '你是 Live content 代码生成器。根据已完善的需求对话，一次产出可直接写入编辑器的源码。',
    LIVE_COMPONENT_SPEC,
    buildLibsSection(libKeys),
    buildCatalogIndexSection(catalogs),
    detail,
    hasSelection ? `只输出替换后的选中片段源码（选中：${selectionLabel || ''}）。不要输出整文件。` : '输出替换后的整份 content 源码。',
    `工具：
- getComponentExample：按示例 id 读取完整示例 code（先看示例目录的 description 再决定是否拉取）。
- suggestScope：若使用了当前 scope 没有的远程组件，调用此工具声明 { 变量名: 'remote:Component' }。

输出契约：
1. 优先纯代码；不要追问、不要复述需求、不要解释。
2. 选型：远程 → Antd → HTML。
3. 只能使用本次 libs 键与 scope∪suggestedScope。
4. 需要官方示例时根据 description 挑选后调用 getComponentExample。`
  ]
    .filter(Boolean)
    .join('\n\n');
};

module.exports = {
  LIVE_COMPONENT_SPEC,
  stripHtml,
  buildRefineSystemPrompt,
  buildGenerateSystemPrompt,
  collectHitComponentNames,
  buildCatalogIndexSection,
  buildComponentDetailSection
};
