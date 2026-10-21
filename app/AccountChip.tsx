'use client';

import { useEffect, useState } from 'react';

interface Me {
  signedIn: boolean;
  email?: string;
  balance?: number;
  billingEnabled?: boolean;
}

/**
 * 顶栏右侧的账户状态。
 * 没开计费时不打扰没登录的人——只有登录过的才显示余额。
 */
export default function AccountChip() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then((r) => r.json())
      .then((d: Me) => alive && setMe(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!me) return null;

  if (me.signedIn) {
    return (
      <a className="navLink" href="/login" title={me.email}>
        算力 {me.balance ?? 0}
      </a>
    );
  }
  if (!me.billingEnabled) return null;
  return (
    <a className="navLink" href="/login">
      登录
    </a>
  );
}
