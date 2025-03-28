/**
 * Web2Notion 工具函数
 */

/**
 * 将HTML内容转换为Markdown格式
 * @param {HTMLElement} element - HTML元素
 * @returns {string} - 转换后的Markdown文本
 */
function htmlToMarkdown(element) {
  if (!element) return '';
  
  // 创建一个文档片段来处理内容
  const clone = element.cloneNode(true);
  
  // 处理标题
  const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(heading => {
    const level = parseInt(heading.tagName[1]);
    const hashes = '#'.repeat(level);
    heading.outerHTML = `\n${hashes} ${heading.textContent.trim()}\n`;
  });
  
  // 处理段落
  const paragraphs = clone.querySelectorAll('p');
  paragraphs.forEach(p => {
    p.outerHTML = `\n${p.textContent.trim()}\n`;
  });
  
  // 处理列表
  const listItems = clone.querySelectorAll('li');
  listItems.forEach(item => {
    const parent = item.parentElement;
    const prefix = parent.tagName === 'OL' ? '1. ' : '- ';
    item.outerHTML = `${prefix}${item.textContent.trim()}\n`;
  });
  
  // 处理链接
  const links = clone.querySelectorAll('a');
  links.forEach(link => {
    const text = link.textContent.trim();
    const href = link.getAttribute('href');
    if (href) {
      link.outerHTML = `[${text}](${href})`;
    }
  });
  
  // 处理图片
  const images = clone.querySelectorAll('img');
  images.forEach(img => {
    const alt = img.getAttribute('alt') || '';
    const src = img.getAttribute('src');
    if (src) {
      img.outerHTML = `![${alt}](${src})`;
    }
  });
  
  // 处理粗体文本
  const boldTexts = clone.querySelectorAll('strong, b');
  boldTexts.forEach(bold => {
    bold.outerHTML = `**${bold.textContent.trim()}**`;
  });
  
  // 处理斜体文本
  const italicTexts = clone.querySelectorAll('em, i');
  italicTexts.forEach(italic => {
    italic.outerHTML = `*${italic.textContent.trim()}*`;
  });
  
  // 处理代码块
  const codeBlocks = clone.querySelectorAll('pre');
  codeBlocks.forEach(block => {
    const code = block.textContent.trim();
    block.outerHTML = `\n\`\`\`\n${code}\n\`\`\`\n`;
  });
  
  // 处理行内代码
  const inlineCodes = clone.querySelectorAll('code');
  inlineCodes.forEach(code => {
    if (!code.closest('pre')) { // 避免重复处理pre>code
      code.outerHTML = `\`${code.textContent.trim()}\``;
    }
  });
  
  // 处理引用
  const blockquotes = clone.querySelectorAll('blockquote');
  blockquotes.forEach(quote => {
    const lines = quote.textContent.trim().split('\n');
    const quotedLines = lines.map(line => `> ${line}`).join('\n');
    quote.outerHTML = `\n${quotedLines}\n`;
  });
  
  // 处理水平线
  const hrs = clone.querySelectorAll('hr');
  hrs.forEach(hr => {
    hr.outerHTML = '\n---\n';
  });
  
  // 获取处理后的文本内容
  let markdown = clone.textContent || clone.innerText || '';
  
  // 清理多余的空行
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  
  return markdown;
}

/**
 * 将HTML字符串转换为Markdown
 * @param {string} html - HTML字符串
 * @returns {string} - 转换后的Markdown文本
 */
function convertHtmlStringToMarkdown(html) {
  if (!html) return '';
  
  // 创建一个临时的div元素
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  return htmlToMarkdown(tempDiv);
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    htmlToMarkdown,
    convertHtmlStringToMarkdown
  };
}