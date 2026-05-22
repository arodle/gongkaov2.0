import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '公考知识导图 · 真题练习',
  description: '公务员考试知识点学习与真题练习平台，支持思维导图、套题练习、套卷模式',
  viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
