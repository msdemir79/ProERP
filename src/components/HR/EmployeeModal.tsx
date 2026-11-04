import React, { useState, useEffect } from 'react';
import { X, User, Briefcase, DollarSign, Calendar, Phone, Mail, CreditCard, Shield, Heart } from 'lucide-react';
import type { Employee, EmployeeDepartment, SgkStatus, SalaryType } from '../../types';
import { hrService } from '../../services/hrService';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: Employee | null;
  onSaved?: () => void;
}

const DEPARTMENTS: EmployeeDepartment[] = [
  'KESİM',
  'SAYA',
  'MONTA',
  'FİNİSAJ',
  'KALİTE & PAKET',
  'DEPO & SEVKİYAT',
  'MUHASEBE & FİNANS',
  'YÖNETİM & İDARİ',
  'DİĞER'
];

export default function EmployeeModal({ isOpen, onClose, employee, onSaved }: EmployeeModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'salary' | 'details'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [employeeCode, setEmployeeCode] = useState('');
  const [name, setName] = useState('');
  const [tcNo, setTcNo] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState<EmployeeDepartment>('KESİM');
  const [position, setPosition] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'active' | 'passive'>('active');

  // Salary & SGK states
  const [sgkStatus, setSgkStatus] = useState<SgkStatus>('sgk_li');
  const [salaryType, setSalaryType] = useState<SalaryType>('monthly_net');
  const [baseSalary, setBaseSalary] = useState<number>(30000);
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'cash'>('bank');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');

  // Additional
  const [entitledAnnualLeave, setEntitledAnnualLeave] = useState<number>(14);
  const [usedAnnualLeave, setUsedAnnualLeave] = useState<number>(0);
  const [bloodGroup, setBloodGroup] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (employee) {
      setEmployeeCode(employee.employeeCode || '');
      setName(employee.name || '');
      setTcNo(employee.tcNo || '');
      setPhone(employee.phone || '');
      setEmail(employee.email || '');
      setDepartment(employee.department || 'KESİM');
      setPosition(employee.position || '');
      setHireDate(
        employee.hireDate 
          ? new Date(employee.hireDate).toISOString().split('T')[0] 
          : new Date().toISOString().split('T')[0]
      );
      setStatus(employee.status || 'active');
      setSgkStatus(employee.sgkStatus || 'sgk_li');
      setSalaryType(employee.salaryType || 'monthly_net');
      setBaseSalary(employee.baseSalary || 30000);
      setPaymentMethod(employee.paymentMethod || 'bank');
      setBankName(employee.bankName || '');
      setIban(employee.iban || '');
      setEntitledAnnualLeave(employee.entitledAnnualLeave ?? 14);
      setUsedAnnualLeave(employee.usedAnnualLeave ?? 0);
      setBloodGroup(employee.bloodGroup || '');
      setEmergencyContact(employee.emergencyContact || '');
      setAddress(employee.address || '');
      setNotes(employee.notes || '');
    } else {
      // Auto-generate code
      const randNum = Math.floor(100 + Math.random() * 900);
      setEmployeeCode(`PER-${randNum}`);
      setName('');
      setTcNo('');
      setPhone('');
      setEmail('');
      setDepartment('KESİM');
      setPosition('');
      setHireDate(new Date().toISOString().split('T')[0]);
      setStatus('active');
      setSgkStatus('sgk_li');
      setSalaryType('monthly_net');
      setBaseSalary(30000);
      setPaymentMethod('bank');
      setBankName('');
      setIban('');
      setEntitledAnnualLeave(14);
      setUsedAnnualLeave(0);
      setBloodGroup('');
      setEmergencyContact('');
      setAddress('');
      setNotes('');
    }
    setError(null);
  }, [employee, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Lütfen personel ad ve soyadını giriniz.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const payload = {
        employeeCode: employeeCode.trim() || 'PER-001',
        name: name.trim(),
        tcNo: tcNo.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        department,
        position: position.trim() || 'Personel',
        hireDate: new Date(hireDate),
        status,
        sgkStatus,
        salaryType,
        baseSalary: Number(baseSalary) || 0,
        agreedNetSalary: Number(baseSalary) || 0,
        paymentMethod,
        bankName: bankName.trim() || undefined,
        iban: iban.trim() || undefined,
        entitledAnnualLeave: Number(entitledAnnualLeave) || 14,
        usedAnnualLeave: Number(usedAnnualLeave) || 0,
        bloodGroup: bloodGroup.trim() || undefined,
        emergencyContact: emergencyContact.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined
      };

      if (employee?.id) {
        await hrService.updateEmployee(employee.id, payload);
      } else {
        await hrService.addEmployee(payload);
      }

      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Personel kaydedilirken hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                {employee ? 'Personel Kartını Düzenle' : 'Yeni Personel Kartı'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Özlük, ücretlendirme ve SGK yapılandırması</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 bg-slate-50 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'general'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Genel & Görev
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('salary')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'salary'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Ücret & SGK Ayarları
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'details'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200'
            }`}
          >
            <Heart className="w-4 h-4" />
            Özlük & İzin Hakları
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: GENEL BİLGİLER */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Personel Sicil / Kodu *
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="PER-001"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Durum
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'passive')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                  >
                    <option value="active">Aktif Çalışıyor</option>
                    <option value="passive">Ayrıldı / Pasif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Adı Soyadı *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Ahmet Yılmaz"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    T.C. Kimlik No
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={tcNo}
                    onChange={(e) => setTcNo(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="12345678901"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    İşe Giriş Tarihi
                  </label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Departman *
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value as EmployeeDepartment)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Görev / Pozisyon *
                  </label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Saya Dikim Ustası, Kalıpçı..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Telefon Numarası
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="0532 123 45 67"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    E-Posta
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="personel@sirket.com"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ÜCRET & SGK AYARLARI */}
          {activeTab === 'salary' && (
            <div className="space-y-4">
              {/* SGK Statüsü Seçimi - ÖNEMLİ */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">
                  Sosyal Güvenlik (SGK) Durumu *
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSgkStatus('sgk_li')}
                    className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                      sgkStatus === 'sgk_li'
                        ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Shield className={`w-5 h-5 mt-0.5 ${sgkStatus === 'sgk_li' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs font-bold">SGK'lı (Sigortalı / Bordrolu)</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Yasal SGK işçi (%14), işsizlik (%1), gelir/damga vergisi ve işveren maliyetleri hesaplanır.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSgkStatus('sgk_siz')}
                    className={`p-3 rounded-lg border text-left flex items-start gap-3 transition-all ${
                      sgkStatus === 'sgk_siz'
                        ? 'border-amber-500 bg-amber-50/70 text-amber-900 ring-2 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <DollarSign className={`w-5 h-5 mt-0.5 ${sgkStatus === 'sgk_siz' ? 'text-amber-600' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs font-bold">SGK'sız / Günlük Yevmiyeli / Harici</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Vergi ve SGK kesintisi yapılmaz. Fiili yevmiye ve saatlik mesai üzerinden doğrudan net ödeme yapılır.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Ücret Hesaplama Tipi *
                  </label>
                  <select
                    value={salaryType}
                    onChange={(e) => setSalaryType(e.target.value as SalaryType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                  >
                    <option value="monthly_net">Aylık Sabit Net Ücret (₺)</option>
                    <option value="monthly_gross">Aylık Sabit Brüt Ücret (₺)</option>
                    <option value="daily">Günlük Yevmiye (₺/Gün)</option>
                    <option value="hourly">Saatlik Ücret (₺/Saat)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    {salaryType === 'daily' ? 'Günlük Yevmiye Tutarı (₺)' : 
                     salaryType === 'hourly' ? 'Saatlik Ücret Tutarı (₺)' : 
                     salaryType === 'monthly_gross' ? 'Aylık Brüt Maaş (₺)' : 'Aylık Net Maaş (₺)'} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-bold font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="30000"
                  />
                </div>
              </div>

              {/* Ödeme Yöntemi */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                  Maaş / Ödeme Şekli
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="bank"
                      checked={paymentMethod === 'bank'}
                      onChange={() => setPaymentMethod('bank')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Banka Hesabı (IBAN / Havale)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={() => setPaymentMethod('cash')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    Nakit Kasa (Elden Ödeme)
                  </label>
                </div>

                {paymentMethod === 'bank' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        Banka Adı
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Garanti BBVA, İş Bankası..."
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                        IBAN No
                      </label>
                      <input
                        type="text"
                        value={iban}
                        onChange={(e) => setIban(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="TR00 0000 0000 0000 0000 0000 00"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ÖZLÜK & İZİN HAKLARI */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Hak Edilen Yıllık İzin (Gün)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={entitledAnnualLeave}
                    onChange={(e) => setEntitledAnnualLeave(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Yasal standart: 1-5 yıl 14 gün, 5-15 yıl 20 gün.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Kullanılan İzin (Gün)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={usedAnnualLeave}
                    onChange={(e) => setUsedAnnualLeave(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Kan Grubu
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white dark:bg-slate-900"
                  >
                    <option value="">Seçiniz</option>
                    <option value="A Rh+">A Rh(+)</option>
                    <option value="A Rh-">A Rh(-)</option>
                    <option value="B Rh+">B Rh(+)</option>
                    <option value="B Rh-">B Rh(-)</option>
                    <option value="AB Rh+">AB Rh(+)</option>
                    <option value="AB Rh-">AB Rh(-)</option>
                    <option value="0 Rh+">0 Rh(+)</option>
                    <option value="0 Rh-">0 Rh(-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                    Acil Durum İletişimi (Kişi & Tel)
                  </label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Yakını Adı (05xx xxx xx xx)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  İkametgah Adresi
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="İlçe, İl ve tam açık adres..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase mb-1">
                  Özel Notlar & Açıklama
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Personel hakkındaki ek bilgiler..."
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm shadow-indigo-200 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Kaydediliyor...' : employee ? 'Güncelle' : 'Personeli Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
