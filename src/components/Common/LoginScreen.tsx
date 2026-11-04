import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Oturum açma ekranı.
 *
 * Kimlik doğrulama sunucuda yapılır; başarılı girişte oturum httpOnly çerezle
 * taşınır ve tarayıcıdan okunamaz.
 */
export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Kullanıcı adı ve parola zorunludur.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      if (!res.success) {
        setError(res.error || 'Kullanıcı adı veya parola hatalı.');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Giriş yapılamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-full max-w-[280px] rounded-2xl bg-white p-2 shadow-lg shadow-slate-900/10">
            <img
              src="/brand/dmr-nexus-wordmark.png"
              alt="DMR Nexus ERP"
              className="w-full h-auto object-contain"
            />
          </div>
          <h1 className="sr-only">DMR Nexus</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Muhasebe, üretim ve stok yönetim sistemi
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4"
        >
          <div>
            <label htmlFor="login-username" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Kullanıcı Adı
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                placeholder="kullanıcı adınız"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Parola
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-xs leading-relaxed">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Giriş yapılıyor…
              </>
            ) : (
              'Giriş Yap'
            )}
          </button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
            Parolanızı bilmiyorsanız sistem yöneticinizle görüşün. Çok sayıda hatalı denemede
            giriş geçici olarak kısıtlanır.
          </p>
        </form>
      </div>
    </div>
  );
}
