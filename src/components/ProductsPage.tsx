import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Package, ShieldAlert } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Product, UserSession, CustomField } from '../types';
import { cn } from '../lib/utils';

interface ProductsPageProps {
  user: UserSession;
}

export default function ProductsPage({ user }: ProductsPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [qcTemplate, setQcTemplate] = useState('');
  const [cycleTime, setCycleTime] = useState<number | ''>('');
  const [efficiency, setEfficiency] = useState<number | ''>('');
  const [fieldConfigs, setFieldConfigs] = useState<CustomField[]>([]);
  const [qcTemplates, setQcTemplates] = useState<any[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(true);

  const isAdmin = user.role === 'Admin';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
      setProducts(data);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const unsubQC = onSnapshot(collection(db, 'qc_templates'), (snap) => {
      setQcTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsub();
      unsubQC();
    };
  }, []);

  const handleStartEdit = (product: Product) => {
    setEditingId(product.id);
    setNewProductName(product.name);
    setQcTemplate(product.qcTemplate || '');
    setCycleTime(product.cycleTime || '');
    setEfficiency(product.efficiency || '');
    // Migration logic or load existing
    if (product.fieldConfigs) {
      setFieldConfigs([...product.fieldConfigs]);
    } else {
      setFieldConfigs(product.customFields.map(f => ({ label: f, required: true })));
    }
    setIsAdding(true);
  };

  const handleCancel = () => {
    setEditingId(null);
    setNewProductName('');
    setQcTemplate('');
    setCycleTime('');
    setEfficiency('');
    setFieldConfigs([]);
    setNewFieldLabel('');
    setNewFieldRequired(true);
    setIsAdding(false);
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    try {
      const productPayload = {
        name: newProductName,
        qcTemplate: qcTemplate || null,
        cycleTime: cycleTime !== '' ? Number(cycleTime) : null,
        efficiency: efficiency !== '' ? Number(efficiency) : null,
        customFields: fieldConfigs.map(f => f.label), // Legacy sync
        fieldConfigs: fieldConfigs
      };

      if (editingId) {
        await updateDoc(doc(db, 'products', editingId), productPayload);
      } else {
        await addDoc(collection(db, 'products'), productPayload);
      }
      handleCancel();
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'products');
    }
  };

  const addField = () => {
    if (newFieldLabel.trim()) {
      setFieldConfigs([...fieldConfigs, { label: newFieldLabel.trim(), required: newFieldRequired }]);
      setNewFieldLabel('');
      setNewFieldRequired(true);
    }
  };

  const removeField = (index: number) => {
    setFieldConfigs(fieldConfigs.filter((_, i) => i !== index));
  };

  const toggleRequired = (index: number) => {
    if (!isAdmin) return;
    const updated = [...fieldConfigs];
    updated[index].required = !updated[index].required;
    setFieldConfigs(updated);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 leading-none">Product Management</h1>
          <p className="text-zinc-500 font-medium text-sm mt-1">Configure products and their custom inspection fields</p>
        </div>
        {!isAdding && (
          <div className="flex gap-2">
            <button 
              onClick={() => setIsAdding(true)}
              className="h-10 px-4 bg-zinc-900 text-white font-black rounded-xl shadow-lg shadow-zinc-900/10 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={18} />
              Add Product
            </button>
          </div>
        )}
      </div>

      {isAdding && (
        <div className="card max-w-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="p-8">
            <h3 className="text-lg font-black text-zinc-900 mb-6">
              {editingId ? 'Modify Product Definition' : 'New Product Definition'}
            </h3>
            <form onSubmit={handleAddProduct} className="space-y-6">
              <div>
                <label className="label">Product Name</label>
                <input 
                  type="text" 
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="Enter product name"
                  className="input font-bold"
                  required
                />
              </div>

              <div>
                <label className="label">Linked QC Template</label>
                <select 
                  className="input font-bold"
                  value={qcTemplate}
                  onChange={(e) => setQcTemplate(e.target.value)}
                >
                  <option value="">No QC Protocol Linked</option>
                  {qcTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-zinc-400 mt-2 font-medium">Selecting a template will auto-load it when auditing this product in Kanban.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Base Cycle Time (Secs)</label>
                  <input 
                    type="number"
                    value={cycleTime}
                    onChange={(e) => setCycleTime(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input font-mono"
                    placeholder="Enter seconds"
                  />
                </div>
                <div>
                  <label className="label">Target Efficiency (%)</label>
                  <input 
                    type="number"
                    value={efficiency}
                    onChange={(e) => setEfficiency(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input font-mono"
                    placeholder="Enter percentage"
                  />
                </div>
              </div>

              <div>
                <label className="label">Child Part Fields (for traceability)</label>
                <div className="space-y-2 mb-3">
                  {fieldConfigs.map((field, i) => (
                    <div key={i} className="flex items-center gap-3 bg-zinc-50 px-4 py-2.5 rounded-xl border border-zinc-100 group">
                      <span className="flex-1 text-sm font-bold text-zinc-600">{field.label}</span>
                      
                      <div 
                        onClick={() => toggleRequired(i)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-all cursor-pointer",
                          field.required 
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                            : "bg-white border-zinc-100 text-zinc-400 opacity-60"
                        )}
                        title={isAdmin ? "Toggle Mandatory" : "Required Setting"}
                      >
                        <Check size={14} className={cn(!field.required && "opacity-0")} />
                        <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Mandatory</span>
                        {!isAdmin && <ShieldAlert size={10} className="ml-1" />}
                      </div>

                      <button 
                        type="button"
                        onClick={() => removeField(i)}
                        className="text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {fieldConfigs.length === 0 && (
                    <div className="bg-zinc-50/50 border border-dashed border-zinc-200 rounded-xl p-6 text-center">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No traceability fields added</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input 
                    type="text" 
                    value={newFieldLabel}
                    onChange={(e) => setNewFieldLabel(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addField())}
                    placeholder="Enter label (e.g. Battery S/N)"
                    className="input font-medium flex-1"
                  />
                  <div className="flex gap-2 shrink-0">
                    <button 
                      type="button" 
                      onClick={() => setNewFieldRequired(!newFieldRequired)}
                      className={cn(
                        "px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 transition-all flex items-center gap-2",
                        newFieldRequired ? "bg-emerald-50 border-emerald-500/20 text-emerald-600" : "bg-white border-zinc-200 text-zinc-400"
                      )}
                    >
                      {newFieldRequired ? <Check size={14} /> : <X size={14} />}
                      Mandatory
                    </button>
                    <button type="button" onClick={addField} className="h-12 px-6 bg-zinc-100 text-zinc-900 font-black rounded-xl hover:bg-zinc-200 transition-colors">
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-zinc-100">
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="h-12 px-6 font-black text-zinc-400 hover:text-zinc-900 transition-colors uppercase text-[10px] tracking-widest"
                >
                  Cancel
                </button>
                <button type="submit" className="h-12 px-8 bg-zinc-900 text-white font-black rounded-xl shadow-xl shadow-zinc-900/10 transition-all hover:scale-[1.02]">
                  {editingId ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="data-grid">
        {products.map((product) => (
          <div key={product.id} className="card group hover:shadow-2xl transition-all duration-300">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-zinc-100 rounded-xl group-hover:bg-zinc-900 group-hover:text-white transition-all duration-300">
                  <Package size={24} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleStartEdit(product)}
                    className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDelete(product.id)}
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-black text-zinc-900 mb-1">{product.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                  {(product.fieldConfigs || product.customFields).length} Traceable units
                </p>
                {product.qcTemplate && (
                  <span className="w-1 h-1 bg-zinc-200 rounded-full" />
                )}
                {product.qcTemplate && (
                  <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                    QC: {product.qcTemplate}
                  </p>
                )}
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                {(product.fieldConfigs || product.customFields.map(f => ({ label: f, required: false }))).map((f: any, i: number) => (
                  <span key={i} className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-colors",
                    f.required 
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                      : "bg-zinc-50 text-zinc-500 border border-zinc-100"
                  )}>
                    {f.label || f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && !loading && !isAdding && (
        <div className="card p-20 text-center border-dashed border-2 border-zinc-100 bg-zinc-50/20">
          <div className="w-20 h-20 bg-zinc-50 flex items-center justify-center rounded-3xl mx-auto mb-6">
            <Package className="text-zinc-200" size={48} />
          </div>
          <h3 className="text-xl font-black text-zinc-400">Vault Empty</h3>
          <p className="text-zinc-400 font-medium mt-2">Initialize products to start production entries.</p>
          <button 
            onClick={() => setIsAdding(true)}
            className="mt-6 h-12 px-8 bg-zinc-900 text-white font-black rounded-xl"
          >
            Create Product Definition
          </button>
        </div>
      )}
    </div>
  );
}
