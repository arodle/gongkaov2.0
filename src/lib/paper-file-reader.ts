import JSZip from 'jszip';

export async function extractTextFromDocxFile(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('text');

  if (!documentXml) {
    throw new Error('未能读取 Word 正文内容，请确认文件是 .docx 格式。');
  }

  const relatedXmlFiles = Object.keys(zip.files).filter(name => (
    /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/.test(name)
  ));
  const relatedXml = await Promise.all(
    relatedXmlFiles.map(async name => zip.file(name)?.async('text') || '')
  );

  return [documentXml, ...relatedXml]
    .map(xmlToReadableText)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTextFromHtml(html: string) {
  if (typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach(node => node.remove());
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function xmlToReadableText(xml: string) {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<\/w:tr>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
