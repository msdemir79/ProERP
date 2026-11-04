import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Shield, Building2, KeyRound, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AppUser, Role, UserStatus } from '../../types';

const MIN_PASSWORD_LENGTH = 8;

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: Partial<AppUser>) => Promise<void>;
  user?: AppUser | null;
  roles: Role[];
}

const DEPARTMENTS = [
  'YÖNETİM',
  'SATIŞ & PAZARLAMA',
  'ÜRETİM & FABRİKA',
  'DEPO & LOJİSTİK',
  'İNSAN KAYNAKLARI',
  'FİNANS & MUHASEBE',
  'DENETİM & KALİTE',
  'BİLGİ TEKNOLOJİLERİ',
  'SATIN ALMA'
];

const AVATAR_COLORS = [
  '#4f46e5', // indigo
  '#059669', // emerald
  '#0891b2', // cyan
  '#7c3aed', // violet
  '#d97706', // amber
  '#e11d48', // rose
  '#475569', // slate
  '#ea580c'  // orange
];

export default function UserModal({
  isOpen,
  onClose,
  onSave,
  user,
  roles
}: UserModalProps) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('YÖNETİM');
  const [roleCode, setRoleCode] = useState('sales_manager');
  const [status, setStatus] = useState<UserStatus>('active');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [color, setColor] = useState('#4f46e5');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentUser } = useAuth();
  const isEditingSelf = Boolean(user?.id && currentUser?.id === user.id);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setUsername(user.username || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setTitle(user.title || '');
      setDepartment(user.department || 'YÖNETİM');
      setRoleCode(user.roleCode || (roles[0]?.code || 'super_admin'));
      setStatus(user.status || 'active');
      setColor(user.color || '#4f46e5');
      setNotes(user.notes || '');
    } else {
      setFullName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setTitle('');
      setDepartment('SATIŞ & PAZARLAMA');
      setRoleCode(roles[1]?.code || roles[0]?.code || 'sales_manager');
      setStatus('active');
      setColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
      setNotes('');
    }
    // Parola alanları her açılışta boş başlar; kayıtlı parola gösterilmez.
    setPassword('');
    setCurrentPassword('');
    setShowPassword(false);
    setError(null);
  }, [user, isOpen, roles]);

  if (!isOpen) return null;

  // Auto-generate username from fullName if creating new
  const handleFullNameChange = (val: string) => {
    setFullName(val);
    if (!user) {
      const generated = val
        .trim()
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]/g, '');
      if (generated && !username) {
        setUsername(generated);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Ad Soyad alanı zorunludur.');
      return;
    }
    if (!username.trim()) {
      setError('Kullanıcı adı alanı zorunludur.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (!user && !password) {
      setError('Yeni kullanıcı için parola tanımlanmalıdır.');
      return;
    }
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
      return;
    }
    if (password && isEditingSelf && !currentPassword) {
      setError('Kendi parolanızı değiştirmek için mevcut parolanızı girmelisiniz.');
      return;
    }

    const selectedRole = roles.find(r => r.code === roleCode);

    try {
      setIsSubmitting(true);
      await onSave({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        title: title.trim(),
        department,
        roleCode,
        roleId: selectedRole?.id,
        roleName: selectedRole?.name,
        status,
        color,
        notes: notes.trim(),
        // Parola düz metin olarak yalnızca sunucuya gönderilir; orada scrypt ile saklanır.
        ...(password ? { password } : {}),
        ...(password && isEditingSelf ? { currentPassword } : {})
      } as Partial<AppUser>);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Kullanıcı kaydedilirken bir hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {user ? 'Kullanıcı Hesabını Düzenle' : 'Yeni Kullanıcı Tanımla'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Kullanıcı kimlik bilgileri, departman ve rol ataması
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Ad Soyad & Kullanıcı Adı */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Ad Soyad <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Örn: Ahmet Yılmaz"
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Kullanıcı Adı <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Örn: ayilmaz"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Sistemde oturum açarken kullanılır</span>
            </div>
          </div>

          {/* E-posta & Telefon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                E-posta Adresi <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="ornek@firma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Telefon Numarası
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="0 (5xx) xxx xx xx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>
          </div>

          {/* Departman & Ünvan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Departman
              </label>
              <div className="relative">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Görevi / Resmi Ünvanı
              </label>
              <input
                type="text"
                placeholder="Örn: Satış Sorumlusu"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Rol Seçimi & Durum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-indigo-600" />
                Yetki Rolü <span className="text-rose-500">*</span>
              </label>
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name} {r.isSystem ? '(Ön Tanımlı)' : '(Özel Rol)'}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                {roles.find(r => r.code === roleCode)?.description}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">
                Hesap Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                <option value="active">🟢 Aktif (Sisteme Giriş Yapabilir)</option>
                <option value="passive">⚪ Pasif (Giriş Yapamaz)</option>
                <option value="suspended">🔴 Askıda / Kilitli</option>
              </select>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                Pasif veya askıdaki kullanıcılar sisteme erişemez.
              </span>
            </div>
          </div>

          {/* Parola & Renk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                {user ? 'Yeni Parola (boş bırakılırsa değişmez)' : 'Giriş Parolası'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={user ? '••••••••' : `en az ${MIN_PASSWORD_LENGTH} karakter`}
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {user && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
                  Parola sunucuda scrypt ile saklanır; kayıtlı parola görüntülenemez.
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Profil Rozet Rengi
              </label>
              <div className="flex items-center gap-2 pt-1">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center"
                    style={{ backgroundColor: c, borderColor: color === c ? '#0f172a' : 'transparent' }}
                  >
                    {color === c && <Check className="w-3 h-3 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Kendi parolasını değiştiren kullanıcıdan mevcut parolası da istenir */}
          {password && isEditingSelf && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Mevcut Parolanız
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Kimliğinizi doğrulamak için gerekli"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          )}

          {/* Notlar */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Özel Notlar & Açıklama
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Kullanıcı hakkında şirket içi notlar..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Kaydediliyor...' : (user ? 'Değişiklikleri Kaydet' : 'Kullanıcıyı Oluştur')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
