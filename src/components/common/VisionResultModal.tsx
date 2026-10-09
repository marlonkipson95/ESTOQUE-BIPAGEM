import React, { useState, useEffect } from 'react';
import { X, Check, Save, Package, Hash, MapPin, Tag } from 'lucide-react';
import { storageService } from '../../services/storageService';
import { beepService } from '../../services/beepService';

interface VisionResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  visionData: any;
  onSaveSuccess: () => void;
  currentUser: string;
}

export const VisionResultModal: React.FC<VisionResultModalProps> = ({
  isOpen,
  onClose,
  visionData,
  onSaveSuccess,
  currentUser,
}) => {
  const [formData, setFormData] = useState({
    codigo: '',
    descricao: '',
    locacao: '',
    quantidade: 1,
  });

  useEffect(() => {
    if (isOpen && visionData) {
      setFormData({
        codigo: visionData.codigo_sugerido || '',
        descricao: visionData.descricao_sugerida || '',
        locacao: '',
        quantidade: typeof visionData.quantidade_detectada === 'number' ? visionData.quantidade_detectada : 1,
      });
    }
  }, [isOpen, visionData]);

  if (!isOpen || !visionData) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantidade' ? (parseInt(value, 10) || 0) : value,
    }));
  };

  const handleSave = () => {
    if (!formData.codigo) {
      alert('O código é obrigatório.');
      return;
    }

    try {
      const codeType = storageService.determineCodeType(formData.codigo);
      
      // Salvar produto
      const produto = storageService.saveProduct({
        codigo: formData.codigo,
        descricao: formData.descricao || 'PRODUTO IA',
        locacao: formData.locacao,
        saldo: formData.quantidade,
        tipoCodigo: codeType,
      });

      // Registrar histórico (bipagem)
      storageService.saveCodeHistory({
        codigo: formData.codigo,
        descricao_produto: produto.descricao,
        locacao_produto: produto.locacao,
        status_leitura: 'valido',
        tipo_codigo: codeType,
        usuario: currentUser,
        quantidade_lida: formData.quantidade,
      });

      beepService.playSuccess();
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            Revisão de IA
          </h2>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Hash className="h-4 w-4 text-slate-400" /> Código Sugerido
            </label>
            <input
              type="text"
              name="codigo"
              value={formData.codigo}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 font-mono text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-slate-400" /> Descrição Identificada
            </label>
            <input
              type="text"
              name="descricao"
              value={formData.descricao}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-slate-400" /> Locação
              </label>
              <input
                type="text"
                name="locacao"
                value={formData.locacao}
                onChange={handleChange}
                placeholder="Ex: A1-05"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-slate-900 dark:text-white uppercase focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Check className="h-4 w-4 text-slate-400" /> Qtd Detectada
              </label>
              <input
                type="number"
                name="quantidade"
                value={formData.quantidade}
                onChange={handleChange}
                min={1}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-slate-900 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>
          </div>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 transition-all active:scale-95"
          >
            <Save className="h-4 w-4" /> Salvar Produto
          </button>
        </div>
      </div>
    </div>
  );
};
