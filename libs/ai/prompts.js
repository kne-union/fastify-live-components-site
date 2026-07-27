const stripHtml = html =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LIVE_COMPONENT_SPEC = `
## Live 组件规范（必须遵守）

1. 编辑对象是配置里的 content 字段：一段 **JSX 表达式**源码，不是完整 .js 模块，也不是 PlantUML 编码串。
2. 运行时会编译为 \`render(<content>);\`，因此 content **只能是可放入 JSX 子节点位置的表达式**（通常是一个根 JSX 元素，或用 \`<>...</>\` / \`(...)\` 包裹的表达式）。
   - **禁止**写 \`import\` / \`export\` / 外层 \`render(\`。
   - **禁止**在 content 里写 JS 语句：\`const\` / \`let\` / \`var\` / \`function\` / \`class\` / \`return\` / \`if\` 语句块等。
   - **禁止**伪代码块：\`<>{ const x = 1; return (<div/>); }</>\` 或 IIFE \`(()=>{...})()\`（除非整段仍是纯表达式且无语句；默认不要用）。
   - 需要临时数据时，把数组/对象 **内联**在 JSX 属性里，例如 \`options={[{ label: '男', value: '男' }]}\`。
3. 运行时可用标识：
   - React、Antd（antd 全量，但表单场景有额外禁令，见第 8 条）、props（合并后的组件参数）
   - scope 声明的变量名（如 FormInfo ← components-core:FormInfo），另有 PureGlobal
   - libs：仅限当前请求告知的 libKeys，禁止使用未列出的 lib 标识符
4. 组件选用优先级（强制）：
   1) 远程组件优先（本次 remotes 索引 / 当前 scope 中已有）
   2) 其次 Antd.*（**表单除外，见第 8 条**）
   3) 最后原生 HTML；禁止用 HTML 重复实现已有远程或 Antd 能力
5. props 与 scope（生成时必须显式声明，不能只写在 content 里假设已存在）：
   - props 形态：\`{ name: { type: 'string'|'number'|'boolean'|'array'|'object'|'function', defaultValue } }\`，代码里用 \`props.xxx\`。
   - scope 形态：\`{ 变量名: 'moduleToken' }\`（如 \`FormInfo: 'components-core:FormInfo'\`）。
   - 使用了当前 scope 没有的远程组件 → **必须**调用 \`suggestScope\`。
   - content 使用了 \`props.xxx\` 且当前 props 没有该字段 → **必须**调用 \`suggestProps\` 补齐声明（含 type 与合理 defaultValue；function 类型 defaultValue 用 \`'()=>null'\`）。
6. 使用 FormInfo 时字段须落在 <FormInfo.Form> 上下文中（已有则保持；缺失可包一层）。
7. 保持现有代码风格；不引入 npm 包名式 import。文档示例中的 _FormInfo / @components/FormInfo 在 Live 中应写成 scope 变量 FormInfo + token components-core:FormInfo。
8. **表单强制规范（最高优先级，覆盖第 4 条的 Antd 选型）**：
   - 凡涉及表单（录入、校验、提交、表单项布局），**必须**用 \`components-core:FormInfo\` 实现，并确保 scope 含 \`FormInfo: 'components-core:FormInfo'\`（可用 suggestScope）。
   - **禁止**使用 \`Antd.Form\` / \`Antd.Form.Item\` / \`Antd.Form.List\` 以及把 \`Antd.Input\` / \`Antd.Select\` / \`Antd.DatePicker\` 等当作表单字段直接拼表单。
   - **禁止** \`const { Input } = FormInfo.fields\` 这类解构（属于 JS 语句，Live 无法运行）。字段必须写成 \`FormInfo.fields.Input\` / \`FormInfo.fields.Select\` 等。
   - 标准写法示例（注意整段都是 JSX，无 const/return）：
\`\`\`jsx
<FormInfo.Form data={{}}>
  <FormInfo
    title="基础信息"
    list={[
      <FormInfo.fields.Input name="name" label="姓名" rule="REQ" placeholder="请输入姓名" />,
      <FormInfo.fields.Select
        name="gender"
        label="性别"
        rule="REQ"
        options={[
          { label: '男', value: '男' },
          { label: '女', value: '女' }
        ]}
        placeholder="请选择性别"
      />
    ]}
  />
  <FormInfo.SubmitButton>提交</FormInfo.SubmitButton>
</FormInfo.Form>
\`\`\`
   - 字段必须带 FormInfo 字段契约：\`name\`、\`label\`，校验用 \`rule\` 字符串（如 \`REQ\`、\`REQ EMAIL\`、\`LEN-3-50\`），需要自定义规则时走 FormInfo.Form 的 \`rules\` / \`interceptors\`，不要用 Antd rules。
   - **自定义字段类型**：不得手写 Antd Form.Item 包装。必须符合 FormInfo 字段规范——优先复用 \`FormInfo.fields.*\`；若确需自定义，只能用表达式方式挂到已有字段能力上，且仍出现在 \`FormInfo\` 的 \`list\` 与 \`FormInfo.Form\` 上下文中（不要在 content 里声明新组件函数）。
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
  // 表单相关需求强制带上 FormInfo 文档命中，便于注入 L2
  if (/表单|校验|FormInfo|Form\.Item|录入|提交|字段/.test(text)) {
    hits.add('FormInfo');
  }
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
1. 推荐组件时遵守：远程 → Antd → HTML；但**凡表单必须推荐 FormInfo**，禁止建议 Antd.Form / Form.Item。
2. 涉及表单时提醒：字段写 FormInfo.fields.*（禁止解构 const），options 等数据内联在 JSX 属性；必须是纯 JSX 表达式；scope 需 FormInfo。
3. 涉及 UI 结构时，必须用 **HTML 线框示意**给出 2～4 个方案（A/B/C…），简述差异，请用户选择；**禁止 ASCII 字符画**。HTML 必须放在 Markdown 的 \`\`\`html 围栏中（前端会渲染为真实 DOM，不要指望当代码展示）。示例外层可用 class="ui-mock" 或 "layout-mock"。回复整体使用 Markdown。选定前不要宣称需求已确认。
4. 信息与布局都够了后，用短结构化小结（目标 / 改动点 / 选用布局 / 建议组件 / 是否动 props·scope），并明确提示用户点击界面上的「开始生成」按钮。
5. 不要暗示会自动写代码或自行进入生成阶段。
6. 不要输出完整组件实现（可运行 JSX）。`
  ]
    .filter(Boolean)
    .join('\n\n');
};

const buildCurrentPropsSection = props => {
  const keys = props && typeof props === 'object' ? Object.keys(props) : [];
  if (!keys.length) {
    return '当前组件参数 props：（空）若 content 使用 props.xxx，必须 suggestProps 声明。';
  }
  return `当前组件参数 props：\n${JSON.stringify(props, null, 2)}\n若新增 props.xxx，必须 suggestProps 补齐未声明字段。`;
};

const buildCurrentScopeSection = scope => {
  const keys = scope && typeof scope === 'object' ? Object.keys(scope) : [];
  if (!keys.length) {
    return '当前组件域 scope：（空）若使用远程组件，必须 suggestScope 声明。';
  }
  return `当前组件域 scope：\n${JSON.stringify(scope, null, 2)}\n若使用未列出的远程组件，必须 suggestScope 补齐。`;
};

const buildGenerateSystemPrompt = ctx => {
  const { libKeys = [], catalogs = [], messages = [], scope = {}, props = {}, hasSelection, selectionLabel } = ctx;
  const hits = collectHitComponentNames({ messages, scope, catalogs });
  // generate：对命中组件 + 索引前列组件提供详情；若无命中则不塞过多
  const detailNames = hits.length ? hits : (catalogs[0]?.index || []).slice(0, 5).map(i => i.name);
  const detail = buildComponentDetailSection(catalogs, detailNames);
  return [
    '你是 Live content 代码生成器。根据已完善的需求对话，一次产出可直接写入编辑器的源码，并同步声明所需的 scope / props。',
    LIVE_COMPONENT_SPEC,
    buildLibsSection(libKeys),
    buildCurrentScopeSection(scope),
    buildCurrentPropsSection(props),
    buildCatalogIndexSection(catalogs),
    detail,
    hasSelection ? `只输出替换后的选中片段源码（选中：${selectionLabel || ''}）。不要输出整文件。` : '输出替换后的整份 content 源码。',
    `工具：
- getComponentExample：按示例 id 读取完整示例 code（先看示例目录的 description 再决定是否拉取）。
- suggestScope：声明需要合并进编辑器「组件域」的 scope，形如 { FormInfo: 'components-core:FormInfo' }。
- suggestProps：声明需要合并进编辑器「组件参数」的 props，形如 { title: { type: 'string', defaultValue: '标题' } }。

输出契约：
1. 优先纯代码；不要追问、不要复述需求、不要解释。
2. **输出必须是纯 JSX 表达式**（可被 \`render(<content>);\` 包裹）；禁止 const/let/return/函数声明，禁止 \`<>{ const ...; return (...); }</>\`。
3. 选型：远程 → Antd → HTML；**表单必须 FormInfo，禁止 Antd.Form / Form.Item**；字段用 \`FormInfo.fields.Xxx\`，options 内联在 JSX 属性中。
4. 只能使用本次 libs 键与 scope∪suggestedScope；用到 FormInfo 时必须 suggestScope（若 scope 尚无）。
5. content 中凡出现 props.xxx，必须已在当前 props 或本次 suggestProps 中声明；不要虚构未声明参数。
6. 自定义表单字段优先复用 FormInfo.fields；禁止在 content 里新声明组件函数。
7. 需要官方示例时根据 description 挑选后调用 getComponentExample（优先 FormInfo）；仿写时把示例里的 \`const { Input } = fields\` 改成 \`FormInfo.fields.Input\`。
8. **工具调用结束后必须再输出完整 JSX 正文**；禁止只调 suggestScope/suggestProps/getComponentExample 而不写代码。不要包 Markdown 说明；若使用代码围栏，仅允许一个 \`\`\`jsx 围栏且围栏内是完整可运行 JSX。`
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
