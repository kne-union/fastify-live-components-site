const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const inferPropDef = (code, name) => {
  if (/^on[A-Z]/.test(name)) {
    return { type: 'function', defaultValue: '()=>null' };
  }
  const access = `props(?:\\?\\.)?\\.${escapeRegExp(name)}`;
  const orString = code.match(new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)\\s*['"\`]([^'"\`]*)['"\`]`));
  if (orString) {
    return { type: 'string', defaultValue: orString[1] };
  }
  const orNum = code.match(new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (orNum) {
    return { type: 'number', defaultValue: orNum[1] };
  }
  const orBool = code.match(new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)\\s*(true|false)\\b`));
  if (orBool) {
    return { type: 'boolean', defaultValue: orBool[1] };
  }
  if (new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)\\s*\\[`).test(code)) {
    return { type: 'array', defaultValue: '[]' };
  }
  if (new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)\\s*\\{`).test(code)) {
    return { type: 'object', defaultValue: '{}' };
  }
  return { type: 'string', defaultValue: '' };
};

/** 从生成代码中扫描 props.xxx，补齐 suggestProps 可能漏掉的声明 */
const extractPropsFromCode = (code, existingProps = {}) => {
  const text = String(code || '');
  if (!text.trim()) {
    return {};
  }
  // 去掉 markdown 围栏外壳再扫，避免漏检
  const stripped = text.replace(/^```(?:jsx|javascript|js|tsx|ts)?\s*/i, '').replace(/```\s*$/i, '');
  const names = new Set();
  const re = /props(?:\?\.)?\.([A-Za-z_$][\w$]*)|props\[\s*['"`]([^'"`]+)['"`]\s*\]/g;
  let match;
  while ((match = re.exec(stripped))) {
    const name = match[1] || match[2];
    if (name) {
      names.add(name);
    }
  }
  const result = {};
  names.forEach(name => {
    if (existingProps && existingProps[name]) {
      return;
    }
    result[name] = inferPropDef(stripped, name);
  });
  return result;
};

const mergeSuggestedProps = (code, suggestedProps, existingProps = {}) => Object.assign({}, extractPropsFromCode(code, existingProps), suggestedProps && typeof suggestedProps === 'object' ? suggestedProps : {});

module.exports = {
  extractPropsFromCode,
  mergeSuggestedProps
};
