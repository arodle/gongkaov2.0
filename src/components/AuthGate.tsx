'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        const result = await response.json();
        setUser(result.user || null);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, inviteCode }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.message || '登录失败');
        return;
      }

      setUser(result.user);
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/70 bg-white/88 p-6 shadow-[0_24px_70px_rgba(31,80,96,0.11)] backdrop-blur-xl">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-foreground">
            {mode === 'login' ? '登录公考平台' : '创建账号'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">使用账号进入知识导图、题库和练习数据。</p>
        </div>

        <div className="space-y-3">
          {mode === 'register' && (
            <>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名（可选）" />
              <Input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="邀请码（如需要）" />
            </>
          )}
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" type="email" required />
          <Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码，至少 8 位" type="password" required />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <Button className="mt-5 w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'login' ? '登录' : '注册并登录'}
        </Button>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-primary hover:underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
            setInviteCode('');
          }}
        >
          {mode === 'login' ? '没有账号？创建一个' : '已有账号？去登录'}
        </button>
      </form>
    </div>
  );
}
