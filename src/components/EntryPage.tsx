import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, syncToGoogleSheet } from '../lib/firebase';
import { collection, onSnapshot, addDoc, query, where, getDocs } from 'firebase/firestore';
import { Product, UserSession } from '../types';
import { cn } from '../lib/utils';
import { ClipboardCheck, CheckCircle2, User, Calendar, QrCode, ShieldCheck, Clock, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface EntryPageProps {
  user: UserSession;
}

export default function EntryPage({ user }: EntryPageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [formData, setFormData] = useState({
    inspectorName: localStorage.getItem('nt_session_operator') || '',
    orderNo: '',
    frameNo: '',
    serialNumber: '',
    shift: 'A' as 'A' | 'B' | 'C'
  });
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Live timer
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    const unsub = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);

  const handleProductChange = (productId: string) => {
    const p = products.find(x => x.id === productId) || null;
    setSelectedProduct(p);
    setDynamicValues({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setError(null);

    try {
      // Duplicate check: One instance of a product per order number + serial
      const q = query(
        collection(db, 'inspections'), 
        where('productName', '==', selectedProduct.name),
        where('orderNo', '==', formData.orderNo),
        where('serialNumber', '==', formData.serialNumber)
      );
      
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty && formData.serialNumber) {
        setError(`Duplicate Entry: Unit ${formData.serialNumber} is already registered for this batch.`);
        return;
      }

      // If frameNo is empty (since we removed the static field), try to use the first dynamic value as a fallback for indexing
      const fallbackFrameNo = Object.values(dynamicValues)[0] || '';
      
      const record = {
        productName: selectedProduct.name,
        orderNo: formData.orderNo,
        frameNo: formData.frameNo || fallbackFrameNo,
        serialNumber: formData.serialNumber,
        shift: formData.shift,
        dynamicFields: dynamicValues,
        inspector: formData.inspectorName,
        authEmail: user.email,
        timestamp: currentTime.getTime(),
        qcStatus: 'Pending'
      };

      await addDoc(collection(db, 'inspections'), record);
      
      // Real-time sync to Google Sheets
      await syncToGoogleSheet({
        category: 'Inspection',
        ...record,
        dateString: format(currentTime, 'yyyy-MM-dd HH:mm:ss'),
        ...dynamicValues
      });

      setSubmitted(true);
      
      // Reset form fields
      setFormData({ 
        ...formData,
        orderNo: '', 
        frameNo: '', 
        serialNumber: '' 
      });
      setDynamicValues({});
      setSelectedProduct(null);
      localStorage.removeItem('nt_session_operator');

      setTimeout(() => setSubmitted(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'inspections');
    }
  };

  const currentFields = selectedProduct?.fieldConfigs || selectedProduct?.customFields.map(f => ({ label: f, required: true })) || [];

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-zinc-900 text-white rounded-xl shadow-lg">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 leading-none">Production Entry</h1>
            <p className="text-zinc-500 font-medium text-sm mt-1">Record unit traceability details</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200">
            {['A', 'B', 'C'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFormData({...formData, shift: s as any})}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all",
                  formData.shift === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
                )}
              >
                Shift {s}
              </button>
            ))}
          </div>
          <div className="text-lg font-mono font-black text-zinc-900 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-sm flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            {format(currentTime, 'HH:mm:ss')}
          </div>
        </div>
      </div>

      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-12 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/20">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-2xl font-black text-emerald-900 mb-2">Record Locked</h3>
          <p className="text-emerald-700 font-medium">Data synced to Tracello-R and Google Sheets.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <div className="w-8 h-8 bg-red-500 text-white rounded-lg flex items-center justify-center shrink-0">
                <ShieldCheck size={16} />
              </div>
              <p className="text-red-600 text-xs font-black uppercase tracking-tight">{error}</p>
            </div>
          )}
          <div className="card p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-1">
                <label className="label">Entry</label>
                <select 
                  className="input font-black text-lg"
                  value={selectedProduct?.id || ''}
                  onChange={(e) => handleProductChange(e.target.value)}
                  required
                >
                  <option value="">Select</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {products.length === 0 && (
                  <p className="text-[10px] text-red-500 font-black uppercase mt-2">No products available. Check Master Data.</p>
                )}
              </div>

              <div className="md:col-span-1">
                <label className="label">Order/Batch No.</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    value={formData.orderNo}
                    onChange={(e) => setFormData({...formData, orderNo: e.target.value})}
                    placeholder="Enter Batch No."
                    className="input focus:ring-4 focus:ring-zinc-900/5 transition-all text-lg font-bold"
                    required
                  />
                  <QrCode className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300" size={16} />
                </div>
              </div>

              <div className="md:col-span-1">
                <label className="label">Serial / Unit ID</label>
                <div className="relative group">
                  <input 
                    type="text" 
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                    placeholder="Enter Serial ID"
                    className="input focus:ring-4 focus:ring-zinc-900/5 transition-all text-lg font-bold"
                  />
                  <Hash className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300" size={16} />
                </div>
              </div>
            </div>

            {selectedProduct && currentFields.length > 0 && (
              <div className="pt-8 border-t border-zinc-100 animate-in slide-in-from-top-4">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-6">Traceable Components</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {currentFields.map((fieldObj: any) => {
                    const label = typeof fieldObj === 'string' ? fieldObj : fieldObj.label;
                    const required = typeof fieldObj === 'string' ? true : fieldObj.required;
                    return (
                      <div key={label} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                            {label}
                          </label>
                          {required && (
                            <span className="text-[8px] font-black bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100 uppercase tracking-tighter">
                              Mandatory
                            </span>
                          )}
                        </div>
                        <div className="relative group">
                          <input 
                            type="text" 
                            value={dynamicValues[label] || ''}
                            onChange={(e) => setDynamicValues({...dynamicValues, [label]: e.target.value})}
                            placeholder={`Enter ${label}`}
                            className={cn(
                              "input h-12 focus:ring-4 transition-all text-sm font-bold",
                              required ? "border-zinc-200 focus:ring-zinc-900/5" : "border-zinc-100 bg-zinc-50/30 focus:ring-zinc-900/5 opacity-80"
                            )}
                            required={required}
                          />
                          <QrCode className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300" size={14} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8 border-t border-zinc-100 bg-zinc-50/50 -mx-8 -mb-8 p-8 items-end">
              <div>
                <label className="label">Operator/Personnel</label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input 
                    type="text" 
                    value={formData.inspectorName}
                    onChange={(e) => setFormData({...formData, inspectorName: e.target.value})}
                    placeholder="Enter Name"
                    className="input pl-10 bg-white"
                    required
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <button type="submit" className="w-full h-12 bg-zinc-900 text-white font-black rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/20 active:scale-[0.98] flex items-center justify-center gap-2">
                  <ClipboardCheck size={20} />
                  ENTER
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
