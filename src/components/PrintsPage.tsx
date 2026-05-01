import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, updateDoc } from 'firebase/firestore';
import { PrintRecord, Product, UserSession } from '../types';
import { Printer, Trash2, Tag, Search, PlusCircle, CheckCircle2, QrCode, X, Download, Edit } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../lib/utils';

interface PrintsPageProps {
  user: UserSession;
}

export default function PrintsPage({ user }: PrintsPageProps) {
  const [prints, setPrints] = useState<PrintRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<PrintRecord | null>(null);
  const [formData, setFormData] = useState({
    category: 'Child Part / Raw Material' as PrintRecord['category'],
    productName: '',
    serialNumber: '',
  });

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'prints'), orderBy('timestamp', 'desc')), (snap) => {
      setPrints(snap.docs.map(d => ({ id: d.id, ...d.data() } as PrintRecord)));
    });
    const unsubPr = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });
    return () => { unsubP(); unsubPr(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateDoc(doc(db, 'prints', editingId), {
          ...formData
        });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'prints'), {
          ...formData,
          timestamp: Date.now()
        });
      }
      setIsAdding(false);
      setFormData({ category: 'Child Part / Raw Material', productName: '', serialNumber: '' });
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, editingId ? `prints/${editingId}` : 'prints');
    }
  };

  const handleEdit = (print: PrintRecord) => {
    setFormData({
      category: print.category,
      productName: print.productName,
      serialNumber: print.serialNumber
    });
    setEditingId(print.id);
    setIsAdding(true);
  };

  const qrRef = useRef<HTMLDivElement>(null);

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `QR_${selectedPrint?.serialNumber}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this print record?')) return;
    try {
      await deleteDoc(doc(db, 'prints', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `prints/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Label Management</h1>
          <p className="text-zinc-500">Generate and track serial number labels</p>
        </div>
        <button 
          onClick={() => {
            if (isAdding) {
              setEditingId(null);
              setFormData({ category: 'Child Part / Raw Material', productName: '', serialNumber: '' });
            }
            setIsAdding(!isAdding);
          }} 
          className="btn btn-primary"
        >
          <PlusCircle size={18} />
          {editingId ? 'Modify Label' : 'Generate Label'}
        </button>
      </div>

      {isAdding && (
        <div className="card max-w-lg animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-6">{editingId ? 'Modify Record' : 'Label Generator'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Category</label>
                <select 
                  className="input"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value as any})}
                  required
                >
                  <option value="Child Part / Raw Material">Child Part / Raw Material</option>
                  <option value="Finished Good">Finished Good</option>
                  <option value="Container">Container</option>
                </select>
              </div>
              <div>
                <label className="label">Product / Part Name</label>
                <select 
                  className="input"
                  value={formData.productName}
                  onChange={(e) => setFormData({...formData, productName: e.target.value})}
                  required
                >
                  <option value="">Select a product...</option>
                  {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  <option value="Other">Other (Custom)</option>
                </select>
              </div>
              <div>
                <label className="label">Custom Serial Number</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input 
                    type="text" 
                    value={formData.serialNumber}
                    onChange={(e) => setFormData({...formData, serialNumber: e.target.value})}
                    placeholder="Enter manual or generated S/N"
                    className="input pl-10 font-mono"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsAdding(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save & Register</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Category</th>
                <th className="table-header">Product</th>
                <th className="table-header">Serial Number</th>
                <th className="table-header">Generated On</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prints.map((print) => (
                <tr key={print.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="table-cell">
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-[10px] font-bold uppercase text-zinc-500">{print.category}</span>
                  </td>
                  <td className="table-cell font-medium">{print.productName}</td>
                  <td className="table-cell"><span className="mono-value font-bold">{print.serialNumber}</span></td>
                  <td className="table-cell text-zinc-400 text-xs">
                    {new Date(print.timestamp).toLocaleDateString()}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => setSelectedPrint(print)}
                        className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-colors"
                        title="View QR Label"
                      >
                        <QrCode size={16} />
                      </button>
                      <button 
                        onClick={() => handleEdit(print)}
                        className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-colors"
                        title="Modify Label"
                      >
                        <Edit size={16} />
                      </button>
                      <button className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-colors">
                        <Printer size={16} />
                      </button>
                      {user.role !== 'Production' && (
                        <button 
                          onClick={() => handleDelete(print.id)}
                          className="p-2 hover:bg-red-50 rounded-lg text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prints.length === 0 && (
          <div className="py-20 text-center text-zinc-400">
            <Printer className="mx-auto mb-4 opacity-20" size={48} />
            <p>No labels registered yet.</p>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {selectedPrint && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setSelectedPrint(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 text-center border-b border-zinc-100">
              <div className="flex justify-between items-center mb-4">
                <span className="px-2 py-1 bg-zinc-100 rounded text-[10px] font-bold uppercase text-zinc-500">
                  {selectedPrint.category}
                </span>
                <button onClick={() => setSelectedPrint(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X size={20} />
                </button>
              </div>
              <h3 className="text-xl font-black text-zinc-900 mb-1">{selectedPrint.productName}</h3>
              <p className="text-sm font-mono font-bold text-zinc-500">{selectedPrint.serialNumber}</p>
            </div>
            
            <div className="p-10 flex flex-col items-center bg-zinc-50/50" ref={qrRef}>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-zinc-200">
                <QRCodeSVG 
                  value={JSON.stringify({
                    product: selectedPrint.productName,
                    sn: selectedPrint.serialNumber,
                    url: `${window.location.origin}/trace/${selectedPrint.serialNumber}`
                  })}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="mt-6 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">Scan for Traceability Record</p>
            </div>

            <div className="p-6 grid grid-cols-2 gap-3">
              <button 
                onClick={() => window.print()}
                className="btn btn-secondary w-full"
              >
                <Printer size={16} />
                Print
              </button>
              <button 
                onClick={downloadQR}
                className="btn btn-primary w-full"
              >
                <Download size={16} />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
