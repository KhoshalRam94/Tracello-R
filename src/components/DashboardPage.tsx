import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { InspectionRecord, QCReport, Product, DowntimeRecord } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { TrendingUp, Users, ClipboardCheck, AlertCircle, MessageSquare, Send, X as CloseIcon, Loader2, Calendar, Clock, Search } from 'lucide-react';
import { format, startOfDay, eachDayOfInterval, subDays, startOfHour, endOfHour } from 'date-fns';
import { cn } from '../lib/utils';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: (process.env.GEMINI_API_KEY as string) });

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
}

export default function DashboardPage() {
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [reports, setReports] = useState<QCReport[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [downtime, setDowntime] = useState<DowntimeRecord[]>([]);
  const [selectedProductFilter, setSelectedProductFilter] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedHourStart, setSelectedHourStart] = useState<number>(0);
  const [selectedHourEnd, setSelectedHourEnd] = useState<number>(23);
  const [sessionOperator, setSessionOperator] = useState(localStorage.getItem('nt_session_operator') || '');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  const saveOperator = (name: string) => {
    setSessionOperator(name);
    localStorage.setItem('nt_session_operator', name);
  };

  useEffect(() => {
    const unsubI = onSnapshot(collection(db, 'inspections'), (snap) => {
      setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inspections');
    });
    const unsubR = onSnapshot(collection(db, 'qc_reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCReport)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'qc_reports');
    });
    const unsubP = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    const unsubD = onSnapshot(collection(db, 'downtime'), (snap) => {
      setDowntime(snap.docs.map(d => ({ id: d.id, ...d.data() } as DowntimeRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'downtime');
    });
    return () => { unsubI(); unsubR(); unsubP(); unsubD(); };
  }, []);

  // Filter logic
  const filteredByDateAndHour = (data: (InspectionRecord | QCReport)[]) => {
    return data.filter(item => {
      const date = new Date(item.timestamp);
      const dayStr = format(date, 'yyyy-MM-dd');
      const hour = date.getHours();
      
      const dateMatch = !selectedDateFilter || dayStr === selectedDateFilter;
      const hourMatch = hour >= selectedHourStart && hour <= selectedHourEnd;
      
      return dateMatch && hourMatch;
    });
  };

  // Filter data based on selected product and date/hour
  const baseInspections = filteredByDateAndHour(inspections) as InspectionRecord[];
  const baseReports = filteredByDateAndHour(reports) as QCReport[];

  const filteredInspections = selectedProductFilter 
    ? baseInspections.filter(i => i.productName === selectedProductFilter)
    : baseInspections;

  const filteredReports = selectedProductFilter 
    ? baseReports.filter(r => {
        const prod = inspections.find(ins => ins.frameNo === r.frameNo);
        return prod?.productName === selectedProductFilter;
      })
    : baseReports;

  // Stats
  const totalProduced = filteredInspections.length;
  const totalQC = filteredReports.length;

  // MTTR calculation: Average of duration in records with maintenancePersonnel
  const maintenanceRecords = downtime.filter(d => d.maintenancePersonnel && d.maintenancePersonnel.trim() !== '');
  const mttr = maintenanceRecords.length > 0 
    ? (maintenanceRecords.reduce((acc, curr) => acc + curr.duration, 0) / maintenanceRecords.length).toFixed(1)
    : "0";

  // MTTR by Category (Pareto data)
  const downtimeByCategory = downtime.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + curr.duration;
    return acc;
  }, {} as Record<string, number>);

  const paretoData = Object.entries(downtimeByCategory)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isTyping) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsTyping(true);

    try {
      const statsSummary = {
        totalProduced,
        totalQC,
        anomalies,
        anomalyRate,
        inspectorStats,
        topProducts: products.map(p => ({
          name: p.name,
          count: inspections.filter(i => i.productName === p.name).length
        })).sort((a,b) => b.count - a.count).slice(0, 3),
        filteredDate: selectedDateFilter,
        filteredHours: `${selectedHourStart}:00 - ${selectedHourEnd}:00`
      };

      const prompt = `
        You are Statbot, an intelligent production analyst for Tracello-R. 
        You help factory managers understand their data in a natural, helpful way.

        Current Dashboard Context:
        - Total Produced: ${statsSummary.totalProduced}
        - Total QC Reports: ${statsSummary.totalQC}
        - Anomalies Found: ${statsSummary.anomalies} (${statsSummary.anomalyRate}%)
        - MTTR (Mean Time To Repair): ${mttr} mins
        - Date Filter: ${statsSummary.filteredDate}
        - Hour Filter: ${statsSummary.filteredHours}
        - Inspector breakdown: ${JSON.stringify(statsSummary.inspectorStats)}
        - Top Products: ${JSON.stringify(statsSummary.topProducts)}

        Maintenance Analytics Context (if asked):
        - MTTR (Mean Time To Repair): Calculating average of breakdown durations provided in downtime logs.
        - MTBF (Mean Time Between Failures): Evaluating gaps between breakdown timestamps.

        The user asks: "${userMsg}"
        Answer in natural, conversational English. 
        IMPORTANT: Do NOT use markdown bolding (like **text**) in your response. 
        Use professional analytics language but keep it easy to read. 
        If they ask about trends or maintenance metrics, refer to the data logic provided.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      setChatMessages(prev => [...prev, { role: 'bot', content: result.text || "I couldn't process that data right now." }]);
    } catch (err) {
      console.error("Chatbot Error:", err);
      setChatMessages(prev => [...prev, { role: 'bot', content: "Error connecting to AI brain. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  // Calculate Anomalies (QC reports with at least one NOK status)
  const anomalies = filteredReports.filter(r => 
    r.sections.some(s => s.items.some(i => i.status === 'NOK'))
  ).length;
  const anomalyRate = totalQC > 0 ? ((anomalies / totalQC) * 100).toFixed(1) : "0";
  
  // Chart Data: Last 7 Days
  const last7Days = eachDayOfInterval({
    start: subDays(new Date(), 6),
    end: new Date()
  });

  const chartData = last7Days.map(date => {
    const dayStr = format(date, 'MMM dd');
    const dayStart = startOfDay(date).getTime();
    const dayEnd = dayStart + 86400000;
    
    const dayInspections = filteredInspections.filter(i => i.timestamp >= dayStart && i.timestamp < dayEnd).length;
    const dayQC = filteredReports.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
    const dayAnomalies = filteredReports.filter(r => 
      r.timestamp >= dayStart && r.timestamp < dayEnd && 
      r.sections.some(s => s.items.some(i => i.status === 'NOK'))
    ).length;

    // Calculate plan for the day based on products produced
    // If multiple products produced, we take a weighted average of their hourly plan rates * 8 hrs
    const dayRecords = filteredInspections.filter(i => i.timestamp >= dayStart && i.timestamp < dayEnd);
    const hourlyRates = dayRecords.map(rec => {
      const p = products.find(prod => prod.name === rec.productName);
      if (p && p.cycleTime && p.efficiency) {
        return 3600 / (p.cycleTime / (p.efficiency / 100));
      }
      return 0; // No plan if not defined
    });
    
    // Average hourly plan across the day's mix
    const avgHourlyPlan = hourlyRates.length > 0 ? (hourlyRates.reduce((a, b) => a + b, 0) / hourlyRates.length) : 0;
    const dayPlan = Math.round(avgHourlyPlan * 8);

    return {
      name: dayStr,
      inspections: dayInspections,
      qcReports: dayQC,
      anomalies: dayAnomalies,
      plan: dayPlan,
      gap: Math.max(0, dayPlan - dayInspections),
      efficiency: dayInspections > 0 ? ((dayInspections / dayPlan) * 100).toFixed(1) : 0
    };
  });

  // Current Hourly Performance
  const now = new Date().getTime();
  const oneHourAgo = now - 3600000;
  const lastHourOutput = filteredInspections.filter(i => i.timestamp >= oneHourAgo).length;
  
  // Calculate Target for Last Hour based on mix
  const lastHourRecords = filteredInspections.filter(i => i.timestamp >= oneHourAgo);
  const lastHourTarget = lastHourRecords.length > 0 
    ? Math.round(lastHourRecords.reduce((acc, rec) => {
        const p = products.find(prod => prod.name === rec.productName);
        if (p && p.cycleTime && p.efficiency) {
          return acc + (3600 / (p.cycleTime / (p.efficiency / 100)));
        }
        return acc;
      }, 0) / lastHourRecords.length)
    : 0;

  // Inspector Performance
  const inspectorStats = filteredInspections.reduce((acc, curr) => {
    acc[curr.inspector] = (acc[curr.inspector] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(inspectorStats).map(([name, value]) => ({ name, value }));
  const COLORS = ['#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8'];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900">Performance Dashboard</h1>
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-[10px] font-black uppercase tracking-wider text-emerald-600 rounded-full animate-pulse border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              Live
            </div>
          </div>
          <p className="text-zinc-500">Real-time production and quality overviews</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="card p-2 flex items-center gap-2 border-zinc-200">
            <Calendar size={14} className="text-zinc-400 ml-2" />
            <input 
              type="date" 
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="bg-transparent border-none text-[11px] font-black uppercase text-zinc-900 focus:ring-0 cursor-pointer"
            />
          </div>
          <div className="card p-2 flex items-center gap-2 border-zinc-200">
            <Clock size={14} className="text-zinc-400 ml-2" />
            <select 
              value={selectedHourStart}
              onChange={(e) => setSelectedHourStart(parseInt(e.target.value))}
              className="bg-transparent border-none text-[11px] font-black uppercase text-zinc-900 focus:ring-0 cursor-pointer"
            >
              {[...Array(24)].map((_, i) => {
                const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
                const ampm = i < 12 ? 'AM' : 'PM';
                return <option key={i} value={i}>{hour} {ampm}</option>;
              })}
            </select>
            <span className="text-zinc-300 text-xs text-[10px] font-black uppercase">to</span>
            <select 
              value={selectedHourEnd}
              onChange={(e) => setSelectedHourEnd(parseInt(e.target.value))}
              className="bg-transparent border-none text-[11px] font-black uppercase text-zinc-900 focus:ring-0 cursor-pointer"
            >
              {[...Array(24)].map((_, i) => {
                const hour = i === 0 ? 12 : i > 12 ? i - 12 : i;
                const ampm = i < 12 ? 'AM' : 'PM';
                return <option key={i} value={i}>{hour} {ampm}</option>;
              })}
            </select>
          </div>
          <div className="card p-2 flex items-center gap-2 border-zinc-200">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 pl-2">Filter Category</label>
            <select 
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
              className="bg-transparent border-none text-[11px] font-black uppercase text-zinc-900 focus:ring-0 cursor-pointer"
            >
              <option value="">All Products</option>
              {products.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="card p-4 min-w-[200px] flex items-center gap-4 border-emerald-100 bg-emerald-50/20">
          <div className="w-10 h-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center shadow-lg">
            <Users size={20} />
          </div>
          <div className="flex-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Active Staff Session</label>
            <input 
              type="text" 
              value={sessionOperator}
              onChange={(e) => saveOperator(e.target.value)}
              placeholder="ENTER PERSONNEL NAME"
              className="bg-transparent border-none p-0 focus:ring-0 font-black text-zinc-900 placeholder:text-zinc-300 w-full"
            />
          </div>
        </div>
      </div>
    </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Output', value: totalProduced, icon: TrendingUp, color: 'text-[#4ade80]' },
          { label: 'QC Pass Rate', value: `${100 - parseFloat(anomalyRate)}%`, icon: ClipboardCheck, color: 'text-[#f97316]' },
          { label: 'Anomaly Rate', value: `${anomalyRate}%`, icon: AlertCircle, color: 'text-[#d946ef]' },
          { label: 'MTTR (Avg)', value: `${mttr} min`, icon: Clock, color: 'text-zinc-600' },
          { label: 'Active Inspectors', value: Object.keys(inspectorStats).length, icon: Users, color: 'text-[#0ea5e9]' },
        ].map((stat, i) => (
          <div key={i} className="card p-6 flex items-center gap-4 border-l-4" style={{ 
            borderColor: i === 0 ? '#4ade80' : i === 1 ? '#f97316' : i === 2 ? '#d946ef' : i === 3 ? '#52525b' : '#0ea5e9' 
          }}>
            <div className={cn("p-3 bg-zinc-50 rounded-xl", stat.color)}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
              <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="card lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-zinc-900">Production & Quality Trends</h3>
            <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest">
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#4ade80] rounded-full" /> Output</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#0c13e8] rounded-full" /> Hourly Plan</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#f97316] rounded-full" /> QC</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#d946ef] rounded-full" /> Anomalies</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 bg-[#ef4444] rounded-full" /> Gap</div>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#a1a1aa' }}
                />
                <Tooltip 
                  cursor={{ fill: '#fafafa' }}
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '12px', 
                    border: '1px solid #e4e4e7',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }} 
                />
                <Bar dataKey="inspections" fill="#4ade80" radius={[4, 4, 0, 0]} name="Output" />
                <Bar dataKey="plan" fill="#0c13e8" radius={[4, 4, 0, 0]} name="Hourly Plan" />
                <Bar dataKey="qcReports" fill="#f97316" radius={[4, 4, 0, 0]} name="QC" />
                <Bar dataKey="anomalies" fill="#d946ef" radius={[4, 4, 0, 0]} name="Anomalies" />
                <Bar dataKey="gap" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gap in Plan" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-base font-bold text-zinc-900 mb-6 uppercase tracking-tighter">Hourly Plan vs Actual</h3>
          
          <div className="space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Last Hour Output</p>
                <p className="text-4xl font-black text-[#4ade80] tracking-tighter">{lastHourOutput}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Hourly Target</p>
                <p className="text-xl font-bold text-[#0c13e8] tracking-tighter">{lastHourTarget} Units</p>
              </div>
            </div>

            <div className="pt-6 border-t border-zinc-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Efficiency Realization</span>
                <span className={cn(
                  "text-xs font-bold",
                  (lastHourOutput / lastHourTarget) >= 0.85 ? "text-[#4ade80]" : "text-[#ef4444]"
                )}>
                  {((lastHourOutput / lastHourTarget) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-[#4ade80] transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (lastHourOutput / lastHourTarget) * 100)}%` }} 
                />
                {(lastHourOutput < lastHourTarget) && (
                  <div 
                    className="h-full bg-[#ef4444]" 
                    style={{ width: `${Math.min(100, ((lastHourTarget - lastHourOutput) / lastHourTarget) * 100)}%` }} 
                  />
                )}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[9px] font-bold text-[#4ade80] uppercase">Produced</span>
                <span className="text-[9px] font-bold text-[#ef4444] uppercase">Gap</span>
              </div>
            </div>

            <div className="bg-zinc-50 rounded-2xl p-4">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">Today's Cumulative</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase">Actual Total</p>
                  <p className="text-lg font-black text-zinc-900">{chartData[chartData.length - 1]?.inspections || 0}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase">Plan Total</p>
                  <p className="text-lg font-black text-zinc-900">{chartData[chartData.length - 1]?.plan || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Clock size={14} />
            Downtime distribution (Min)
          </h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paretoData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f4f4f5" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#71717a' }}
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {paretoData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#ef4444' : index === 1 ? '#f97316' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-zinc-900">Recent Inspections</h3>
          <button className="text-xs font-bold text-zinc-900 hover:underline px-2 py-1">View All</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Timestamp</th>
                <th className="table-header">Inspector</th>
                <th className="table-header">Product</th>
                <th className="table-header">Order No</th>
                <th className="table-header">Frame No</th>
              </tr>
            </thead>
            <tbody>
              {filteredInspections.slice(0, 5).map((rec) => (
                <tr key={rec.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="table-cell text-zinc-500">{format(rec.timestamp, 'HH:mm:ss')}</td>
                  <td className="table-cell font-bold">{rec.inspector}</td>
                  <td className="table-cell">{rec.productName}</td>
                  <td className="table-cell font-mono">{rec.orderNo}</td>
                  <td className="table-cell font-mono">{rec.frameNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats Chatbot */}
      <div className="fixed bottom-8 right-8 z-50">
        {isChatOpen ? (
          <div className="bg-white w-80 h-[450px] rounded-3xl shadow-2xl border border-zinc-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-zinc-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                  <Search size={16} className="text-white" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-widest">Statbot</h4>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[8px] text-zinc-400 font-bold uppercase">System Analyst Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/50">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare size={32} className="mx-auto text-zinc-200 mb-3" />
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Ask me about production rates, anomalies, or inspector efficiency.</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={cn(
                  "max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-zinc-900 text-white ml-auto rounded-tr-none" 
                    : "bg-white border border-zinc-100 text-zinc-900 mr-auto rounded-tl-none shadow-sm font-medium"
                )}>
                  {msg.content}
                </div>
              ))}
              {isTyping && (
                <div className="bg-white border border-zinc-100 text-zinc-900 mr-auto rounded-2xl rounded-tl-none shadow-sm p-3 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-zinc-400" />
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">Analysing Trends...</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-zinc-100">
              <div className="relative group">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full h-10 pl-4 pr-10 bg-zinc-50 border border-zinc-100 rounded-xl text-xs font-medium focus:ring-2 focus:ring-zinc-900/5 focus:bg-white transition-all outline-none"
                />
                <button 
                  type="submit"
                  disabled={!chatInput.trim() || isTyping}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-all disabled:opacity-50"
                >
                  <Send size={12} />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <button 
            onClick={() => setIsChatOpen(true)}
            className="w-14 h-14 bg-zinc-900 text-white rounded-2xl shadow-2xl shadow-zinc-900/40 flex items-center justify-center hover:scale-110 active:scale-95 transition-all group relative"
          >
            <MessageSquare size={24} />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full animate-bounce" />
            <div className="absolute right-full mr-4 bg-zinc-900 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Statbot Insight
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
