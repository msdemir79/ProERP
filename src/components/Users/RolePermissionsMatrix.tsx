import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Check, 
  X, 
  Save, 
  RotateCcw, 
  CheckCheck, 
  Ban, 
  Eye, 
  Edit, 
  Trash2, 
  Plus, 
  Sparkles,
  Info,
  Users
} from 'lucide-react';
import type { Role, RolePermissions, AppModule, PermissionAction } from '../../types';
import { ALL_APP_MODULES, PERMISSION_ACTIONS, createBlankPermissions, createFullPermissions } from '../../data/initialRoles';
import { userService } from '../../services/userService';
import { showToast } from '../../lib/feedback';

interface RolePermissionsMatrixProps {
  roles: Role[];
  selectedRoleId?: number;
  onSelectRole: (role: Role) => void;
  onEditRole: (role: Role) => void;
  onDeleteRole: (role: Role) => void;
  onAddNewRole: () => void;
  onResetDefaults: () => Promise<void>;
  userCountByRole: Record<string, number>;
}

export default function RolePermissionsMatrix({
  roles,
  selectedRoleId,
  onSelectRole,
  onEditRole,
  onDeleteRole,
  onAddNewRole,
  onResetDefaults,
  userCountByRole
}: RolePermissionsMatrixProps) {
  const activeRole = roles.find(r => r.id === selectedRoleId) || roles[0];
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (activeRole) {
      setPermissions(JSON.parse(JSON.stringify(activeRole.permissions || createBlankPermissions())));
      setHasChanges(false);
      setSaveSuccess(false);
    }
  }, [activeRole?.id]);

  if (!activeRole || !permissions) return null;

  const isSuperAdminRole = activeRole.code === 'super_admin';

  // Toggle single cell
  const handleToggle = (module: AppModule, action: PermissionAction) => {
    if (isSuperAdminRole) return;

    setPermissions(prev => {
      if (!prev) return prev;
      const currentModulePerm = prev[module] || {
        view: false,
        create: false,
        edit: false,
        delete: false,
        export: false,
        approve: false
      };

      const newActionVal = !currentModulePerm[action];
      const updatedModule = {
        ...currentModulePerm,
        [action]: newActionVal
      };

      // If granting any create/edit/delete/export/approve, automatically grant 'view' as well
      if (newActionVal && action !== 'view') {
        updatedModule.view = true;
      }
      // If revoking 'view', automatically revoke other permissions
      if (!newActionVal && action === 'view') {
        updatedModule.create = false;
        updatedModule.edit = false;
        updatedModule.delete = false;
        updatedModule.export = false;
        updatedModule.approve = false;
      }

      setHasChanges(true);
      return {
        ...prev,
        [module]: updatedModule
      };
    });
  };

  // Toggle entire row (module)
  const handleToggleRow = (module: AppModule) => {
    if (isSuperAdminRole) return;

    setPermissions(prev => {
      if (!prev) return prev;
      const mod = prev[module];
      const allActive = mod.view && mod.create && mod.edit && mod.delete && mod.export && mod.approve;
      const targetVal = !allActive;

      setHasChanges(true);
      return {
        ...prev,
        [module]: {
          view: targetVal,
          create: targetVal,
          edit: targetVal,
          delete: targetVal,
          export: targetVal,
          approve: targetVal
        }
      };
    });
  };

  // Toggle entire column (action)
  const handleToggleColumn = (action: PermissionAction) => {
    if (isSuperAdminRole) return;

    setPermissions(prev => {
      if (!prev) return prev;
      // check if all modules have this action active
      const allActive = ALL_APP_MODULES.every(m => prev[m.id]?.[action]);
      const targetVal = !allActive;

      const updated: any = { ...prev };
      for (const m of ALL_APP_MODULES) {
        updated[m.id] = {
          ...updated[m.id],
          [action]: targetVal
        };
        if (targetVal && action !== 'view') {
          updated[m.id].view = true;
        }
      }

      setHasChanges(true);
      return updated;
    });
  };

  // Quick preset: Grant All
  const handleGrantAll = () => {
    if (isSuperAdminRole) return;
    setPermissions(createFullPermissions());
    setHasChanges(true);
  };

  // Quick preset: Revoke All
  const handleRevokeAll = () => {
    if (isSuperAdminRole) return;
    setPermissions(createBlankPermissions());
    setHasChanges(true);
  };

  // Quick preset: Read Only
  const handleReadOnly = () => {
    if (isSuperAdminRole) return;
    const blank = createBlankPermissions();
    for (const m of ALL_APP_MODULES) {
      blank[m.id].view = true;
      blank[m.id].export = true;
    }
    setPermissions(blank);
    setHasChanges(true);
  };

  // Save changes to db
  const handleSave = async () => {
    if (!activeRole.id || !permissions) return;
    setIsSaving(true);
    try {
      await userService.updateRole(activeRole.id, {
        permissions
      });
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      showToast(err.message || 'Yetki matrisi kaydedilemedi.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Role Selector Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-3 shadow-xs">
        <div className="flex items-center justify-between gap-3 mb-2 px-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Yapılandırılacak Rolü Seçin:
            </span>
          </div>
          <button
            onClick={onAddNewRole}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Yeni Özel Rol Ekle
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {roles.map(r => {
            const isSelected = r.id === activeRole.id;
            const count = userCountByRole[r.code] || 0;
            return (
              <button
                key={r.code}
                onClick={() => onSelectRole(r)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800 hover:border-slate-300'
                }`}
              >
                <span>{r.name}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  isSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
                {r.isSystem && (
                  <span className={`text-[9px] px-1 rounded ${
                    isSelected ? 'text-indigo-300' : 'text-slate-400'
                  }`}>
                    • Sistem
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Role Details & Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {activeRole.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider ${
                activeRole.isSystem ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {activeRole.isSystem ? 'Ön Tanımlı Sistem Rolü' : 'Özel İşletme Rolü'}
              </span>
              <span className="text-xs text-slate-400 font-mono">({activeRole.code})</span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {activeRole.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isSuperAdminRole && (
              <>
                <button
                  type="button"
                  onClick={handleGrantAll}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors inline-flex items-center gap-1.5"
                  title="Tüm modüller ve işlemler için tam yetki ver"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Tümünü Aç
                </button>

                <button
                  type="button"
                  onClick={handleReadOnly}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors inline-flex items-center gap-1.5"
                  title="Yalnızca görüntüleme ve dışa aktarma yetkisi ver"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  Salt Okunur
                </button>

                <button
                  type="button"
                  onClick={handleRevokeAll}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors inline-flex items-center gap-1.5"
                  title="Tüm yetkileri kapat"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                  Tümünü Kapat
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => onEditRole(activeRole)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors inline-flex items-center gap-1.5"
            >
              <Edit className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              Rolü Düzenle
            </button>

            {!activeRole.isSystem && (
              <button
                type="button"
                onClick={() => onDeleteRole(activeRole)}
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Rolü Sil
              </button>
            )}

            {!isSuperAdminRole && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all shadow-xs inline-flex items-center gap-1.5 ${
                  hasChanges
                    ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer animate-pulse'
                    : 'bg-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'Kaydediliyor...' : 'Matrisi Kaydet'}
              </button>
            )}

            {saveSuccess && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <Check className="w-3.5 h-3.5" />
                Yetkiler Güncellendi
              </span>
            )}
          </div>
        </div>

        {/* Super Admin Notice */}
        {isSuperAdminRole && (
          <div className="mt-4 p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-950 leading-relaxed">
              <p className="font-bold">Süper Admin Rolü Korumalıdır</p>
              <p className="text-indigo-800/90 mt-0.5">
                Bu rol, sistemin çekirdek yöneticisi olup sistem kilitlenmelerini önlemek adına tüm modüllerde ve işlemlerde kalıcı olarak sınırsız yetkiye sahiptir. Değişiklik yapılamaz.
              </p>
            </div>
          </div>
        )}

        {/* Matrix Table */}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-bold">
                <th className="py-3 px-4 min-w-[220px]">
                  Modül & Alan
                </th>
                {PERMISSION_ACTIONS.map(action => (
                  <th key={action.id} className="py-3 px-3 text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{action.label}</span>
                      {!isSuperAdminRole && (
                        <button
                          type="button"
                          onClick={() => handleToggleColumn(action.id)}
                          className="text-[10px] text-slate-400 hover:text-white underline font-normal cursor-pointer"
                          title={`${action.label} sütunundaki tüm kutuları aç/kapat`}
                        >
                          Tüm Sütun
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {!isSuperAdminRole && (
                  <th className="py-3 px-3 text-center min-w-[80px]">
                    Hızlı Satır
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ALL_APP_MODULES.map((mod, idx) => {
                const modPerm = permissions[mod.id] || {
                  view: false,
                  create: false,
                  edit: false,
                  delete: false,
                  export: false,
                  approve: false
                };

                const isAllGranted = modPerm.view && modPerm.create && modPerm.edit && modPerm.delete && modPerm.export && modPerm.approve;
                const isViewOnly = modPerm.view && !modPerm.create && !modPerm.edit && !modPerm.delete && !modPerm.approve;

                return (
                  <tr 
                    key={mod.id} 
                    className={`transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'} hover:bg-indigo-50/30`}
                  >
                    {/* Module Column */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{mod.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                          {mod.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {mod.description}
                      </p>
                    </td>

                    {/* Action Cells */}
                    {PERMISSION_ACTIONS.map(act => {
                      const isGranted = Boolean(modPerm[act.id]);

                      return (
                        <td key={act.id} className="py-2 px-3 text-center">
                          <button
                            type="button"
                            disabled={isSuperAdminRole}
                            onClick={() => handleToggle(mod.id, act.id)}
                            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all ${
                              isGranted
                                ? 'bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-300 hover:bg-slate-200 hover:text-slate-500 dark:text-slate-400'
                            } ${isSuperAdminRole ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
                            title={`${mod.name} için ${act.label} yetkisi (${isGranted ? 'Açık' : 'Kapalı'})`}
                          >
                            {isGranted ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-3.5 h-3.5 stroke-[2]" />}
                          </button>
                        </td>
                      );
                    })}

                    {/* Row toggle button */}
                    {!isSuperAdminRole && (
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleRow(mod.id)}
                          className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                            isAllGranted
                              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          }`}
                        >
                          {isAllGranted ? 'Kapat' : 'Aç'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info & Reset to defaults */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-emerald-600 inline-block"></span>
            <span>Yetkili / İzin Verildi</span>
            <span className="w-3 h-3 rounded bg-slate-200 inline-block ml-3"></span>
            <span>Yetkisiz / Kısıtlandı</span>
          </div>

          <button
            type="button"
            onClick={onResetDefaults}
            className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 underline text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ön Tanımlı Sistem Rollerini Fabrika Ayarlarına Sıfırla
          </button>
        </div>
      </div>
    </div>
  );
}
