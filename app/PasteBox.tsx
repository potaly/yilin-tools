'use client';

import { useState } from 'react';
import { putHandoff } from '@/lib/xhs/handoff';
import styles from './page.module.css';

/**
 * 首页主入口：一个粘贴框。
 *
 * 为什么是框不是按钮：来工具站的人**手里大多已经有东西了** —— 一段自己写的草稿、
 * 一篇想改成笔记的公众号文章、一段 AI 写完觉得不对劲的文字。他要的是「把手上这个
 * 变得能发」，不是「从头做一篇」。摩擦从「选入口 → 进页面 → 再粘」压缩成「粘」。
 *
 * 这个假设没有验证过，是这一轮要验的东西之一：如果来的人多数其实是从零开始的，
 * 粘贴框会比任务入口更差，那就换回去（方案 v4.1 §8）。
 *
 * 交接复用 lib/xhs/handoff.ts 那套 —— 检查页已经在挂载时 takeHandoff() 了，
 * 不用为首页再造一条路径。
 */
export default function PasteBox() {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;

  function go() {
    if (!ready) return;
    putHandoff({ from: 'home', body: text.trim() });
    window.location.href = '/tools/check';
  }

  return (
    <div className={styles.paste}>
      <textarea
        className={styles.pasteInput}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="粘贴草稿、素材，或者 AI 写完的初稿…"
        spellCheck={false}
        rows={4}
        // 桌面端 Cmd/Ctrl + Enter 直接走，省一次摸鼠标
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') go();
        }}
      />
      <div className={styles.pasteFoot}>
        <button className="btn btnPrimary" onClick={go} disabled={!ready}>
          看看有哪些地方要改
        </button>
        {/* 隐私说明放在动作旁边，不是页脚 —— 用户是在这里决定要不要粘的 */}
        <span className={styles.pasteNote}>
          不上传你的文字；只有点了「让 AI 改一版」才会发送
        </span>
      </div>
    </div>
  );
}
