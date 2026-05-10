import { useState, useRef, useEffect, useCallback } from "react";
import {
  PlusCircle, TrendingUp, TrendingDown, Target, Wallet, BarChart3,
  X, ArrowUpRight, ArrowDownRight, Upload, Tag, Pencil, Check,
  ChevronLeft, ChevronRight, Save, RefreshCw, CreditCard, Building2, CalendarDays
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "ledger-data-v2";
const MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ACCOUNT_CATEGORIES = {
  asset:     ["Chequing","Savings","TFSA","FHSA","RRSP","RESP","Cash","Other Asset"],
  liability: ["Credit Card","Line of Credit","Mortgage","Car Loan","Student Loan","Other Debt"],
};
const ACCOUNT_COLORS = ["#3b82f6","#22c55e","#a855f7","#f97316","#ec4899","#14b8a6","#eab308","#ef4444"];

const SEED_DATA = {
  transactions: [
    { id:1,  type:"income",  category:"Salary",    amount:5200, date:"2026-05-01", note:"Monthly salary" },
    { id:2,  type:"expense", category:"Rent",       amount:1800, date:"2026-05-01", note:"May rent" },
    { id:3,  type:"expense", category:"Groceries",  amount:210,  date:"2026-05-03", note:"Whole Foods" },
    { id:4,  type:"expense", category:"Dining",     amount:85,   date:"2026-05-05", note:"Dinner out" },
    { id:5,  type:"income",  category:"Freelance",  amount:800,  date:"2026-05-06", note:"Design project" },
    { id:6,  type:"expense", category:"Transport",  amount:120,  date:"2026-05-07", note:"Monthly transit" },
    { id:7,  type:"expense", category:"Utilities",  amount:95,   date:"2026-05-08", note:"Electric bill" },
    { id:8,  type:"income",  category:"Salary",     amount:5200, date:"2026-04-01", note:"Monthly salary" },
    { id:9,  type:"expense", category:"Rent",       amount:1800, date:"2026-04-01", note:"April rent" },
    { id:10, type:"expense", category:"Groceries",  amount:190,  date:"2026-04-10", note:"Superstore run" },
  ],
  budgets: [
    { id:1, category:"Rent",      limit:1800, color:"#f97316" },
    { id:2, category:"Groceries", limit:400,  color:"#22c55e" },
    { id:3, category:"Dining",    limit:200,  color:"#a855f7" },
    { id:4, category:"Transport", limit:150,  color:"#3b82f6" },
    { id:5, category:"Utilities", limit:150,  color:"#ec4899" },
  ],
  accounts: [
    { id:1, name:"TD Chequing",      kind:"asset",     category:"Chequing",    balance:3240.50,  color:"#3b82f6", emoji:"🏦" },
    { id:2, name:"EQ Bank Savings",  kind:"asset",     category:"Savings",     balance:12800.00, color:"#22c55e", emoji:"💰" },
    { id:3, name:"FHSA",             kind:"asset",     category:"FHSA",        balance:8000.00,  color:"#a855f7", emoji:"🏠" },
    { id:4, name:"RRSP",             kind:"asset",     category:"RRSP",        balance:22500.00, color:"#f97316", emoji:"📈" },
    { id:5, name:"Visa Credit Card", kind:"liability", category:"Credit Card", balance:1420.75,  color:"#ef4444", emoji:"💳" },
  ],
  goals: [
    { id:1, name:"Emergency Fund",    target:15000, saved:9200, color:"#f97316", emoji:"🛡️" },
    { id:2, name:"Vacation to Japan", target:5000,  saved:2100, color:"#3b82f6", emoji:"✈️" },
    { id:3, name:"New Car",           target:20000, saved:4500, color:"#a855f7", emoji:"🚗" },
  ],
  expenseCats: ["Rent","Groceries","Dining","Transport","Utilities","Health","Entertainment","Shopping","Other"],
  incomeCats:  ["Salary","Freelance","Investment","Gift","Other"],
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt    = n => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const fmtInt = n => new Intl.NumberFormat("en-CA",{style:"currency",currency:"CAD",minimumFractionDigits:0,maximumFractionDigits:0}).format(n);
const ym     = (y,m) => `${y}-${String(m+1).padStart(2,"0")}`;
const txMonth = tx => tx.date.slice(0,7);

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g,""));
  return lines.slice(1).map(line => {
    const cols=[]; let cur="",inQ=false;
    for(let ch of line){
      if(ch==='"') inQ=!inQ;
      else if(ch===","&&!inQ){cols.push(cur.trim());cur="";}
      else cur+=ch;
    }
    cols.push(cur.trim());
    const row={};
    headers.forEach((h,i)=>{row[h]=(cols[i]||"").replace(/^"|"$/g,"").trim();});
    return row;
  }).filter(r=>Object.values(r).some(v=>v));
}
function guessField(row,candidates){
  for(const c of candidates){const k=Object.keys(row).find(k=>k.includes(c));if(k&&row[k])return row[k];}
  return "";
}
function rowToTransaction(row){
  const dateRaw=guessField(row,["date","time","day"]);
  const noteRaw=guessField(row,["description","desc","memo","note","name","merchant","payee","details"]);
  const amtRaw =guessField(row,["amount","amt","debit","credit","sum","total"]);
  const amt=parseFloat(String(amtRaw).replace(/[$, ]/g,""))||0;
  let parsedDate=new Date().toISOString().slice(0,10);
  try{if(dateRaw)parsedDate=new Date(dateRaw).toISOString().slice(0,10);}catch(_){}
  return{date:parsedDate,note:noteRaw||"Imported",amount:Math.abs(amt),type:amt<0?"expense":"income",raw:row};
}

// ─── STORAGE HOOK (localStorage) ─────────────────────────────────────────────
function usePersistedState(key, fallback) {
  const [state, setState]           = useState(fallback);
  const [loaded, setLoaded]         = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const timerRef = useRef(null);

  // Load from localStorage on mount
  useEffect(()=>{
    try{
      const raw = localStorage.getItem(key);
      if(raw) setState(JSON.parse(raw));
    }catch(_){}
    setLoaded(true);
  },[key]);

  const save = useCallback((val)=>{
    setSaveStatus("saving");
    try{
      localStorage.setItem(key, JSON.stringify(val));
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus("idle"),2000);
    }catch(_){
      setSaveStatus("error");
      setTimeout(()=>setSaveStatus("idle"),3000);
    }
  },[key]);

  const setAndSave = useCallback((updater)=>{
    setState(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      clearTimeout(timerRef.current);
      timerRef.current=setTimeout(()=>save(next),800);
      return next;
    });
  },[save]);

  return [state, setAndSave, loaded, saveStatus, ()=>save(state)];
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Modal({title,onClose,children,wide}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,padding:"1rem"}}>
      <div style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"1rem",padding:"1.5rem",width:"100%",maxWidth:wide?"560px":"420px",maxHeight:"88vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
          <h3 style={{color:"#e2e8f0",fontFamily:"'Playfair Display',serif",fontSize:"1.1rem",margin:0}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer"}}><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Inp({label,...props}){
  return(
    <div style={{marginBottom:"0.85rem"}}>
      {label&&<label style={{display:"block",color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.35rem",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>}
      <input style={{width:"100%",background:"#0f0f23",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.6rem 0.75rem",color:"#e2e8f0",fontSize:"0.9rem",outline:"none",boxSizing:"border-box"}} {...props}/>
    </div>
  );
}
function Sel({label,options,...props}){
  return(
    <div style={{marginBottom:"0.85rem"}}>
      {label&&<label style={{display:"block",color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.35rem",letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>}
      <select style={{width:"100%",background:"#0f0f23",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.6rem 0.75rem",color:"#e2e8f0",fontSize:"0.9rem",outline:"none",boxSizing:"border-box"}} {...props}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── MONTH NAV ────────────────────────────────────────────────────────────────
function MonthNav({year,month,setYear,setMonth,allTransactions}){
  const [showPicker,setShowPicker] = useState(false);
  const [pickerYear,setPickerYear] = useState(year);
  const pickerRef = useRef(null);
  const now = new Date();
  const isNow = year===now.getFullYear()&&month===now.getMonth();
  const monthsWithData = new Set(allTransactions.map(t=>txMonth(t)));

  // Close picker on outside click
  useEffect(()=>{
    if(!showPicker) return;
    function handler(e){
      if(pickerRef.current&&!pickerRef.current.contains(e.target)) setShowPicker(false);
    }
    document.addEventListener("mousedown",handler);
    document.addEventListener("touchstart",handler);
    return()=>{document.removeEventListener("mousedown",handler);document.removeEventListener("touchstart",handler);};
  },[showPicker]);

  function prev(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}
  function next(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}
  function goNow(){setYear(now.getFullYear());setMonth(now.getMonth());setShowPicker(false);}
  function selectMonth(m){setMonth(m);setYear(pickerYear);setShowPicker(false);}

  return(
    <div style={{display:"flex",alignItems:"center",gap:"0.4rem",position:"relative"}} ref={pickerRef}>
      <button onClick={prev} style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.4rem",color:"#94a3b8",cursor:"pointer",display:"flex",padding:"0.35rem",alignItems:"center"}}>
        <ChevronLeft size={15}/>
      </button>
      <button onClick={()=>{setPickerYear(year);setShowPicker(s=>!s);}}
        style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.35rem 0.75rem",cursor:"pointer",minWidth:"145px",justifyContent:"center"}}>
        <CalendarDays size={13} style={{color:"#6366f1"}}/>
        <span style={{color:"#e2e8f0",fontSize:"0.85rem",fontWeight:600}}>{MONTHS[month]} {year}</span>
        {monthsWithData.has(ym(year,month))&&<span style={{width:"5px",height:"5px",background:"#6366f1",borderRadius:"50%",display:"inline-block"}}/>}
      </button>
      <button onClick={next} style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.4rem",color:"#94a3b8",cursor:"pointer",display:"flex",padding:"0.35rem",alignItems:"center"}}>
        <ChevronRight size={15}/>
      </button>
      <div style={{flex:1}}/>
      {!isNow&&(
        <button onClick={goNow} style={{background:"rgba(99,102,241,0.15)",border:"1px solid #6366f155",borderRadius:"0.4rem",color:"#a5b4fc",cursor:"pointer",fontSize:"0.72rem",padding:"0.35rem 0.6rem",fontWeight:600,whiteSpace:"nowrap"}}>
          ↩ Now
        </button>
      )}
      {showPicker&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,zIndex:100,background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem",boxShadow:"0 8px 32px rgba(0,0,0,0.5)",minWidth:"260px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
            <button onClick={()=>setPickerYear(y=>y-1)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:"1.1rem",padding:"0 0.4rem"}}>‹</button>
            <span style={{color:"#e2e8f0",fontWeight:700,fontSize:"0.95rem"}}>{pickerYear}</span>
            <button onClick={()=>setPickerYear(y=>y+1)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:"1.1rem",padding:"0 0.4rem"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.35rem"}}>
            {MONTHS_SHORT.map((m,i)=>{
              const key=ym(pickerYear,i);
              const hasDot=monthsWithData.has(key);
              const isSelected=pickerYear===year&&i===month;
              const isToday=pickerYear===now.getFullYear()&&i===now.getMonth();
              return(
                <button key={m} onClick={()=>selectMonth(i)}
                  style={{padding:"0.45rem 0.25rem",borderRadius:"0.4rem",border:"none",cursor:"pointer",fontSize:"0.8rem",fontWeight:isSelected?700:500,position:"relative",
                    background:isSelected?"linear-gradient(135deg,#6366f1,#8b5cf6)":"#0f0f23",
                    color:isSelected?"#fff":isToday?"#a5b4fc":"#cbd5e1",
                    outline:isToday&&!isSelected?"1px solid #6366f144":"none"}}>
                  {m}
                  {hasDot&&!isSelected&&<span style={{position:"absolute",bottom:"3px",left:"50%",transform:"translateX(-50%)",width:"4px",height:"4px",background:"#6366f1",borderRadius:"50%",display:"block"}}/>}
                </button>
              );
            })}
          </div>
          <button onClick={goNow} style={{width:"100%",marginTop:"0.75rem",background:"#0f0f23",border:"1px solid #2d2d4e",borderRadius:"0.4rem",color:"#94a3b8",cursor:"pointer",fontSize:"0.78rem",padding:"0.4rem",fontWeight:500}}>
            Jump to Today
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SAVE BADGE ───────────────────────────────────────────────────────────────
function SaveBadge({status,onSave}){
  const cfg={
    idle:  {color:"#475569",bg:"transparent",          icon:<Save size={12}/>,      label:"Save"},
    saving:{color:"#6366f1",bg:"rgba(99,102,241,0.1)", icon:<RefreshCw size={12}/>, label:"Saving…"},
    saved: {color:"#22c55e",bg:"rgba(34,197,94,0.1)",  icon:<Check size={12}/>,     label:"Saved"},
    error: {color:"#ef4444",bg:"rgba(239,68,68,0.1)",  icon:<X size={12}/>,         label:"Error"},
  };
  const c=cfg[status]||cfg.idle;
  return(
    <button onClick={onSave} style={{display:"flex",alignItems:"center",gap:"0.3rem",background:c.bg,border:`1px solid ${c.color}44`,borderRadius:"0.4rem",padding:"0.3rem 0.6rem",cursor:"pointer",color:c.color,fontSize:"0.72rem",fontWeight:600,transition:"all 0.3s"}}>
      {c.icon}{c.label}
    </button>
  );
}

// ─── CATEGORY MANAGER ─────────────────────────────────────────────────────────
function CategoryManager({data,setData,onClose}){
  const [kind,setKind]       = useState("expense");
  const [newCat,setNewCat]   = useState("");
  const [editing,setEditing] = useState(null);
  const cats  = kind==="expense"?data.expenseCats:data.incomeCats;
  const field = kind==="expense"?"expenseCats":"incomeCats";
  const setCats = fn=>setData(d=>({...d,[field]:fn(d[field])}));

  function add(){const v=newCat.trim();if(!v||cats.includes(v))return;setCats(c=>[...c,v]);setNewCat("");}
  function remove(cat){setCats(c=>c.filter(x=>x!==cat));}
  function saveEdit(){const v=editing.value.trim();if(v)setCats(c=>c.map((x,i)=>i===editing.index?v:x));setEditing(null);}

  return(
    <Modal title="Manage Categories" onClose={onClose}>
      <div style={{display:"flex",gap:"0.5rem",marginBottom:"1rem"}}>
        {["expense","income"].map(k=>(
          <button key={k} onClick={()=>{setKind(k);setEditing(null);}}
            style={{flex:1,padding:"0.45rem",borderRadius:"0.5rem",border:"none",cursor:"pointer",fontWeight:600,fontSize:"0.8rem",
              background:kind===k?"linear-gradient(135deg,#6366f1,#8b5cf6)":"#0f0f23",color:kind===k?"#fff":"#64748b"}}>
            {k==="expense"?"🔴 Expense":"🟢 Income"}
          </button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.4rem",marginBottom:"1rem",maxHeight:"260px",overflowY:"auto"}}>
        {cats.map((cat,i)=>(
          <div key={cat+i} style={{display:"flex",alignItems:"center",gap:"0.5rem",background:"#0f0f23",borderRadius:"0.5rem",padding:"0.5rem 0.75rem"}}>
            {editing?.index===i?(
              <>
                <input autoFocus value={editing.value} onChange={e=>setEditing(x=>({...x,value:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&saveEdit()}
                  style={{flex:1,background:"transparent",border:"none",color:"#e2e8f0",fontSize:"0.875rem",outline:"none"}}/>
                <button onClick={saveEdit} style={{background:"none",border:"none",color:"#22c55e",cursor:"pointer"}}><Check size={14}/></button>
                <button onClick={()=>setEditing(null)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer"}}><X size={14}/></button>
              </>
            ):(
              <>
                <span style={{flex:1,color:"#e2e8f0",fontSize:"0.875rem"}}>{cat}</span>
                <button onClick={()=>setEditing({index:i,value:cat})} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer"}}><Pencil size={13}/></button>
                <button onClick={()=>remove(cat)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer"}}><X size={13}/></button>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:"0.5rem"}}>
        <input value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="New category name…"
          style={{flex:1,background:"#0f0f23",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.55rem 0.75rem",color:"#e2e8f0",fontSize:"0.875rem",outline:"none"}}/>
        <button onClick={add} style={{background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.55rem 0.9rem",cursor:"pointer",fontWeight:700,fontSize:"1rem"}}>+</button>
      </div>
    </Modal>
  );
}

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────
function CSVImport({expenseCats,incomeCats,onImport,onClose}){
  const [rows,setRows]         = useState(null);
  const [cursor,setCursor]     = useState(0);
  const [done,setDone]         = useState([]);
  const [skipped,setSkipped]   = useState(0);
  const [rowState,setRowState] = useState(null);
  const fileRef = useRef();

  function loadParsed(parsed){
    if(!parsed.length)return;
    setRows(parsed);setCursor(0);setDone([]);setSkipped(0);initRow(parsed[0]);
  }
  function loadFile(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadParsed(parseCSV(ev.target.result).map(rowToTransaction));r.readAsText(f);}
  function onDrop(e){e.preventDefault();e.currentTarget.style.borderColor="#2d2d4e";const f=e.dataTransfer.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadParsed(parseCSV(ev.target.result).map(rowToTransaction));r.readAsText(f);}
  function initRow(row){setRowState({type:row.type,amount:String(row.amount),date:row.date,note:row.note,category:row.type==="income"?incomeCats[0]:expenseCats[0]});}
  function advance(nd){const next=cursor+1;if(next>=rows.length){onImport(nd);return;}setCursor(next);initRow(rows[next]);}
  function accept(){const tx={id:Date.now()+cursor,...rowState,amount:Math.abs(parseFloat(rowState.amount)||0)};const nd=[...done,tx];setDone(nd);advance(nd);}
  function skip(){setSkipped(s=>s+1);advance(done);}

  const cats=rowState?.type==="income"?incomeCats:expenseCats;
  const total=rows?.length||0;
  const progress=total?Math.round((cursor/total)*100):0;

  return(
    <Modal title="Import CSV" onClose={onClose} wide>
      {!rows&&(
        <div>
          <p style={{color:"#94a3b8",fontSize:"0.875rem",lineHeight:1.65,marginBottom:"1.25rem"}}>
            Upload a CSV from your bank. We'll walk you through each transaction to assign a category.
            <br/><span style={{color:"#475569",fontSize:"0.78rem"}}>Auto-detects Date, Description, Amount.</span>
          </p>
          <div onClick={()=>fileRef.current.click()} onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#6366f1";}} onDragLeave={e=>e.currentTarget.style.borderColor="#2d2d4e"} onDrop={onDrop}
            style={{border:"2px dashed #2d2d4e",borderRadius:"0.75rem",padding:"2.5rem",textAlign:"center",cursor:"pointer",transition:"border-color 0.2s"}}>
            <Upload size={28} style={{color:"#6366f1",marginBottom:"0.75rem"}}/>
            <div style={{color:"#e2e8f0",fontWeight:600,marginBottom:"0.25rem"}}>Click to upload CSV</div>
            <div style={{color:"#475569",fontSize:"0.8rem"}}>or drag and drop</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={loadFile} style={{display:"none"}}/>
        </div>
      )}
      {rows&&done.length+skipped<rows.length&&rowState&&(
        <div>
          <div style={{marginBottom:"1.1rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.35rem"}}>
              <span style={{color:"#64748b",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>Transaction {cursor+1} of {total}</span>
              <span style={{color:"#6366f1",fontSize:"0.75rem",fontWeight:600}}>{total-cursor} remaining</span>
            </div>
            <div style={{height:"5px",background:"#0f0f23",borderRadius:"3px"}}>
              <div style={{height:"5px",background:"linear-gradient(90deg,#6366f1,#8b5cf6)",borderRadius:"3px",width:`${progress}%`,transition:"width 0.35s ease"}}/>
            </div>
          </div>
          <div style={{background:"#0f0f23",borderRadius:"0.5rem",padding:"0.6rem 0.85rem",marginBottom:"1rem",fontSize:"0.76rem",color:"#64748b",fontFamily:"monospace",overflowX:"auto",whiteSpace:"nowrap",borderLeft:"3px solid #2d2d4e"}}>
            {Object.entries(rows[cursor].raw).slice(0,5).map(([k,v])=>`${k}: ${v}`).join("   ·   ")}
          </div>
          <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.9rem"}}>
            {["expense","income"].map(t=>(
              <button key={t} onClick={()=>setRowState(r=>({...r,type:t,category:t==="income"?incomeCats[0]:expenseCats[0]}))}
                style={{flex:1,padding:"0.5rem",borderRadius:"0.5rem",cursor:"pointer",fontWeight:600,fontSize:"0.82rem",
                  border:rowState.type===t?`1px solid ${t==="expense"?"#ef444466":"#22c55e66"}`:"1px solid #2d2d4e",
                  background:rowState.type===t?(t==="expense"?"rgba(239,68,68,0.15)":"rgba(34,197,94,0.15)"):"#0f0f23",
                  color:rowState.type===t?(t==="expense"?"#ef4444":"#22c55e"):"#64748b"}}>
                {t==="expense"?"🔴 Expense":"🟢 Income"}
              </button>
            ))}
          </div>
          <div style={{marginBottom:"0.9rem"}}>
            <label style={{display:"block",color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.5rem",letterSpacing:"0.05em",textTransform:"uppercase"}}>Category</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.4rem"}}>
              {cats.map(c=>(
                <button key={c} onClick={()=>setRowState(r=>({...r,category:c}))}
                  style={{padding:"0.35rem 0.75rem",borderRadius:"2rem",border:"1px solid",cursor:"pointer",fontSize:"0.8rem",fontWeight:500,transition:"all 0.15s",
                    borderColor:rowState.category===c?"#6366f1":"#2d2d4e",
                    background:rowState.category===c?"rgba(99,102,241,0.2)":"#0f0f23",
                    color:rowState.category===c?"#a5b4fc":"#64748b"}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Inp label="Description" value={rowState.note} onChange={e=>setRowState(r=>({...r,note:e.target.value}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
            <Inp label="Amount ($)" type="number" value={rowState.amount} onChange={e=>setRowState(r=>({...r,amount:e.target.value}))}/>
            <Inp label="Date" type="date" value={rowState.date} onChange={e=>setRowState(r=>({...r,date:e.target.value}))}/>
          </div>
          <div style={{display:"flex",gap:"0.5rem",marginTop:"0.35rem"}}>
            <button onClick={skip} style={{flex:1,background:"#0f0f23",color:"#64748b",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem"}}>Skip</button>
            <button onClick={accept} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem",display:"flex",alignItems:"center",justifyContent:"center",gap:"0.4rem"}}>
              <Check size={15}/> Add & Continue
            </button>
          </div>
          <div style={{marginTop:"0.9rem",display:"flex",justifyContent:"center",gap:"1.5rem",color:"#475569",fontSize:"0.78rem"}}>
            <span>✅ {done.length} added</span><span>⏭ {skipped} skipped</span>
          </div>
        </div>
      )}
      {rows&&done.length+skipped>=rows.length&&(
        <div style={{textAlign:"center",padding:"1rem 0"}}>
          <div style={{fontSize:"3.5rem",marginBottom:"0.75rem"}}>🎉</div>
          <div style={{color:"#e2e8f0",fontWeight:700,fontSize:"1.15rem",fontFamily:"'Playfair Display',serif",marginBottom:"0.5rem"}}>Import Complete!</div>
          <div style={{color:"#94a3b8",fontSize:"0.875rem",marginBottom:"1.75rem"}}>{done.length} transactions ready · {skipped} skipped</div>
          <button onClick={()=>onImport(done)} style={{width:"100%",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.7rem",cursor:"pointer",fontWeight:700,fontSize:"0.95rem"}}>Add to Ledger →</button>
        </div>
      )}
    </Modal>
  );
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function Overview({data,monthTxs}){
  const totalIncome   = monthTxs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExpenses = monthTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const totalAssets   = (data.accounts||[]).filter(a=>a.kind==="asset").reduce((s,a)=>s+a.balance,0);
  const totalLiabs    = (data.accounts||[]).filter(a=>a.kind==="liability").reduce((s,a)=>s+a.balance,0);
  const netWorth      = totalAssets-totalLiabs;
  const cards=[
    {label:"Income",      value:fmtInt(totalIncome),              color:"#22c55e",bg:"rgba(34,197,94,0.1)",  icon:<TrendingUp size={18}/>},
    {label:"Expenses",    value:fmtInt(totalExpenses),            color:"#ef4444",bg:"rgba(239,68,68,0.1)", icon:<TrendingDown size={18}/>},
    {label:"Net / Month", value:fmtInt(totalIncome-totalExpenses),color:"#6366f1",bg:"rgba(99,102,241,0.1)",icon:<Wallet size={18}/>},
    {label:"Net Worth",   value:fmtInt(netWorth),                 color:"#f97316",bg:"rgba(249,115,22,0.1)",icon:<BarChart3 size={18}/>},
  ];
  const expByCat={};
  monthTxs.filter(t=>t.type==="expense").forEach(t=>{expByCat[t.category]=(expByCat[t.category]||0)+t.amount;});
  const catEntries=Object.entries(expByCat).sort((a,b)=>b[1]-a[1]);
  const maxExp=catEntries[0]?.[1]||1;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem",marginBottom:"1.5rem"}}>
        {cards.map(c=>(
          <div key={c.label} style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
              <div style={{background:c.bg,color:c.color,borderRadius:"0.5rem",padding:"0.35rem",display:"flex"}}>{c.icon}</div>
              <span style={{color:"#64748b",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>{c.label}</span>
            </div>
            <div style={{color:c.color,fontSize:"1.2rem",fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{c.value}</div>
          </div>
        ))}
      </div>
      {catEntries.length>0&&(
        <div style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem"}}>
          <h3 style={{color:"#94a3b8",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.875rem"}}>Spending This Month</h3>
          {catEntries.map(([cat,amt])=>(
            <div key={cat} style={{marginBottom:"0.7rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.25rem"}}>
                <span style={{color:"#cbd5e1",fontSize:"0.85rem"}}>{cat}</span>
                <span style={{color:"#94a3b8",fontSize:"0.85rem"}}>{fmtInt(amt)}</span>
              </div>
              <div style={{height:"4px",background:"#0f0f23",borderRadius:"2px"}}>
                <div style={{height:"4px",background:"linear-gradient(90deg,#6366f1,#8b5cf6)",borderRadius:"2px",width:`${(amt/maxExp)*100}%`,transition:"width 0.6s ease"}}/>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem"}}>
        <h3 style={{color:"#94a3b8",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.875rem"}}>Recent Transactions</h3>
        {monthTxs.length===0&&<div style={{color:"#475569",fontSize:"0.875rem"}}>No transactions this month.</div>}
        {[...monthTxs].reverse().slice(0,5).map(t=>(
          <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.5rem 0",borderBottom:"1px solid #1e1e3a"}}>
            <div>
              <div style={{color:"#e2e8f0",fontSize:"0.875rem"}}>{t.note}</div>
              <div style={{color:"#64748b",fontSize:"0.75rem"}}>{t.category} · {t.date}</div>
            </div>
            <div style={{color:t.type==="income"?"#22c55e":"#ef4444",fontWeight:600,fontSize:"0.9rem"}}>
              {t.type==="income"?"+":"-"}{fmtInt(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function Transactions({data,setData,monthTxs,year,month}){
  const [showAdd,setShowAdd] = useState(false);
  const [showCSV,setShowCSV] = useState(false);
  const defaultDate=`${year}-${String(month+1).padStart(2,"0")}-01`;
  const [form,setForm] = useState({type:"expense",category:data.expenseCats[0],amount:"",date:defaultDate,note:""});
  const cats=form.type==="expense"?data.expenseCats:data.incomeCats;
  function add(){
    if(!form.amount||isNaN(form.amount))return;
    setData(d=>({...d,transactions:[...d.transactions,{id:Date.now(),...form,amount:parseFloat(form.amount)}]}));
    setShowAdd(false);setForm({type:"expense",category:data.expenseCats[0],amount:"",date:defaultDate,note:""});
  }
  function handleImport(txs){setData(d=>({...d,transactions:[...d.transactions,...txs]}));setShowCSV(false);}
  function remove(id){setData(d=>({...d,transactions:d.transactions.filter(t=>t.id!==id)}));}
  const sorted=[...monthTxs].sort((a,b)=>b.date.localeCompare(a.date));
  return(
    <div>
      <div style={{display:"flex",gap:"0.5rem",justifyContent:"flex-end",marginBottom:"1rem"}}>
        <button onClick={()=>setShowCSV(true)} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"#1a1a2e",color:"#a5b4fc",border:"1px solid #2d2d4e",borderRadius:"0.5rem",padding:"0.55rem 0.85rem",cursor:"pointer",fontWeight:600,fontSize:"0.8rem"}}>
          <Upload size={14}/> Import CSV
        </button>
        <button onClick={()=>setShowAdd(true)} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.55rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem"}}>
          <PlusCircle size={16}/> Add
        </button>
      </div>
      <div style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",overflow:"hidden"}}>
        {sorted.length===0&&<div style={{padding:"2rem",textAlign:"center",color:"#475569",fontSize:"0.875rem"}}>No transactions this month.</div>}
        {sorted.map((t,i)=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",padding:"0.875rem 1rem",borderBottom:i<sorted.length-1?"1px solid #1e1e3a":"none"}}>
            <div style={{flex:1}}>
              <div style={{color:"#e2e8f0",fontSize:"0.875rem",fontWeight:500}}>{t.note||t.category}</div>
              <div style={{color:"#64748b",fontSize:"0.75rem",marginTop:"0.15rem"}}>{t.category} · {t.date}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:"0.75rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:"0.25rem",color:t.type==="income"?"#22c55e":"#ef4444",fontWeight:700,fontSize:"0.9rem"}}>
                {t.type==="income"?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>}
                {fmtInt(t.amount)}
              </div>
              <button onClick={()=>remove(t.id)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer"}}><X size={14}/></button>
            </div>
          </div>
        ))}
      </div>
      {showAdd&&(
        <Modal title="Add Transaction" onClose={()=>setShowAdd(false)}>
          <div style={{display:"flex",gap:"0.5rem",marginBottom:"0.85rem"}}>
            {["expense","income"].map(t=>(
              <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:t==="expense"?data.expenseCats[0]:data.incomeCats[0]}))}
                style={{flex:1,padding:"0.45rem",borderRadius:"0.5rem",cursor:"pointer",fontWeight:600,fontSize:"0.8rem",
                  border:form.type===t?`1px solid ${t==="expense"?"#ef444466":"#22c55e66"}`:"1px solid #2d2d4e",
                  background:form.type===t?(t==="expense"?"rgba(239,68,68,0.15)":"rgba(34,197,94,0.15)"):"#0f0f23",
                  color:form.type===t?(t==="expense"?"#ef4444":"#22c55e"):"#64748b"}}>
                {t==="expense"?"🔴 Expense":"🟢 Income"}
              </button>
            ))}
          </div>
          <Sel label="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} options={cats}/>
          <Inp label="Amount ($)" type="number" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))}/>
          <Inp label="Date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/>
          <Inp label="Note" placeholder="Optional note" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
          <button onClick={add} style={{width:"100%",marginTop:"0.5rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:700,fontSize:"0.9rem"}}>Add Transaction</button>
        </Modal>
      )}
      {showCSV&&<CSVImport expenseCats={data.expenseCats} incomeCats={data.incomeCats} onImport={handleImport} onClose={()=>setShowCSV(false)}/>}
    </div>
  );
}

// ─── BUDGETS ──────────────────────────────────────────────────────────────────
function Budgets({data,setData,monthTxs}){
  const [showAdd,setShowAdd] = useState(false);
  const [form,setForm] = useState({category:data.expenseCats[0],limit:""});
  const spent={};
  monthTxs.filter(t=>t.type==="expense").forEach(t=>{spent[t.category]=(spent[t.category]||0)+t.amount;});
  function add(){
    if(!form.limit||isNaN(form.limit))return;
    const colors=["#f97316","#22c55e","#3b82f6","#a855f7","#ec4899","#14b8a6","#eab308"];
    setData(d=>({...d,budgets:[...d.budgets,{id:Date.now(),...form,limit:parseFloat(form.limit),color:colors[d.budgets.length%colors.length]}]}));
    setShowAdd(false);setForm({category:data.expenseCats[0],limit:""});
  }
  function remove(id){setData(d=>({...d,budgets:d.budgets.filter(b=>b.id!==id)}));}
  return(
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"1rem"}}>
        <button onClick={()=>setShowAdd(true)} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.55rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem"}}>
          <PlusCircle size={16}/> Add Budget
        </button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
        {data.budgets.length===0&&<div style={{padding:"2rem",textAlign:"center",color:"#475569",fontSize:"0.875rem"}}>No budgets yet.</div>}
        {data.budgets.map(b=>{
          const s=spent[b.category]||0,pct=Math.min((s/b.limit)*100,100),over=s>b.limit;
          return(
            <div key={b.id} style={{background:"#1a1a2e",border:`1px solid ${over?"rgba(239,68,68,0.3)":"#2d2d4e"}`,borderRadius:"0.875rem",padding:"1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.75rem"}}>
                <div>
                  <div style={{color:"#e2e8f0",fontWeight:600,fontSize:"0.9rem"}}>{b.category}</div>
                  <div style={{color:"#64748b",fontSize:"0.75rem",marginTop:"0.15rem"}}>{fmtInt(s)} of {fmtInt(b.limit)}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                  <span style={{color:over?"#ef4444":"#22c55e",fontWeight:700,fontSize:"0.875rem"}}>{Math.round(pct)}%</span>
                  <button onClick={()=>remove(b.id)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer"}}><X size={14}/></button>
                </div>
              </div>
              <div style={{height:"8px",background:"#0f0f23",borderRadius:"4px"}}>
                <div style={{height:"8px",background:over?"#ef4444":b.color,borderRadius:"4px",width:`${pct}%`,transition:"width 0.6s ease"}}/>
              </div>
              {over&&<div style={{color:"#ef4444",fontSize:"0.75rem",marginTop:"0.5rem"}}>⚠️ Over by {fmtInt(s-b.limit)}</div>}
            </div>
          );
        })}
      </div>
      {showAdd&&(
        <Modal title="Add Budget" onClose={()=>setShowAdd(false)}>
          <Sel label="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} options={data.expenseCats}/>
          <Inp label="Monthly Limit ($)" type="number" placeholder="0.00" value={form.limit} onChange={e=>setForm(f=>({...f,limit:e.target.value}))}/>
          <button onClick={add} style={{width:"100%",marginTop:"0.5rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:700,fontSize:"0.9rem"}}>Add Budget</button>
        </Modal>
      )}
    </div>
  );
}

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────
function Accounts({data,setData}){
  const [showAdd,setShowAdd] = useState(false);
  const [editId,setEditId]   = useState(null);
  const accounts = data.accounts||[];
  const emptyForm={name:"",kind:"asset",category:ACCOUNT_CATEGORIES.asset[0],balance:"",emoji:"🏦"};
  const [form,setForm] = useState(emptyForm);

  const totalAssets = accounts.filter(a=>a.kind==="asset").reduce((s,a)=>s+a.balance,0);
  const totalLiabs  = accounts.filter(a=>a.kind==="liability").reduce((s,a)=>s+a.balance,0);
  const netWorth    = totalAssets-totalLiabs;
  const assetAccounts = accounts.filter(a=>a.kind==="asset");
  const liabAccounts  = accounts.filter(a=>a.kind==="liability");

  function openAdd(){setForm(emptyForm);setEditId(null);setShowAdd(true);}
  function openEdit(acc){setForm({name:acc.name,kind:acc.kind,category:acc.category,balance:String(acc.balance),emoji:acc.emoji||"🏦"});setEditId(acc.id);setShowAdd(true);}
  function save(){
    if(!form.name||form.balance===""||isNaN(form.balance))return;
    const bal=parseFloat(form.balance);
    if(editId){
      setData(d=>({...d,accounts:d.accounts.map(a=>a.id===editId?{...a,...form,balance:bal}:a)}));
    }else{
      const color=ACCOUNT_COLORS[accounts.length%ACCOUNT_COLORS.length];
      setData(d=>({...d,accounts:[...(d.accounts||[]),{id:Date.now(),...form,balance:bal,color}]}));
    }
    setShowAdd(false);
  }
  function remove(id){setData(d=>({...d,accounts:d.accounts.filter(a=>a.id!==id)}));}

  function AccountCard({acc}){
    const isLiab=acc.kind==="liability";
    return(
      <div style={{background:"#1a1a2e",border:`1px solid ${isLiab?"rgba(239,68,68,0.25)":"#2d2d4e"}`,borderRadius:"0.875rem",padding:"1rem",display:"flex",alignItems:"center",gap:"0.75rem"}}>
        <div style={{fontSize:"1.5rem",lineHeight:1}}>{acc.emoji||"🏦"}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:"#e2e8f0",fontWeight:600,fontSize:"0.875rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{acc.name}</div>
          <span style={{background:isLiab?"rgba(239,68,68,0.1)":"rgba(34,197,94,0.1)",color:isLiab?"#ef4444":"#22c55e",fontSize:"0.7rem",fontWeight:600,padding:"0.1rem 0.4rem",borderRadius:"0.25rem",marginTop:"0.2rem",display:"inline-block"}}>
            {acc.category}
          </span>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{color:isLiab?"#ef4444":"#e2e8f0",fontWeight:700,fontSize:"0.95rem",fontFamily:"'Playfair Display',serif"}}>
            {isLiab?"-":""}{fmt(acc.balance)}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.25rem"}}>
          <button onClick={()=>openEdit(acc)} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",padding:"0.1rem"}}><Pencil size={13}/></button>
          <button onClick={()=>remove(acc.id)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",padding:"0.1rem"}}><X size={13}/></button>
        </div>
      </div>
    );
  }

  return(
    <div>
      <div style={{background:"linear-gradient(135deg,#1a1a2e,#16213e)",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem"}}>
        <div style={{textAlign:"center",marginBottom:"0.75rem"}}>
          <div style={{color:"#64748b",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.25rem"}}>Net Worth</div>
          <div style={{color:netWorth>=0?"#a5b4fc":"#ef4444",fontSize:"1.75rem",fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{fmt(netWorth)}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem"}}>
          <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:"0.5rem",padding:"0.6rem",textAlign:"center"}}>
            <div style={{color:"#64748b",fontSize:"0.7rem",marginBottom:"0.2rem"}}>Assets</div>
            <div style={{color:"#22c55e",fontWeight:700,fontSize:"0.95rem"}}>{fmt(totalAssets)}</div>
          </div>
          <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"0.5rem",padding:"0.6rem",textAlign:"center"}}>
            <div style={{color:"#64748b",fontSize:"0.7rem",marginBottom:"0.2rem"}}>Liabilities</div>
            <div style={{color:"#ef4444",fontWeight:700,fontSize:"0.95rem"}}>{fmt(totalLiabs)}</div>
          </div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"1rem"}}>
        <button onClick={openAdd} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.55rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem"}}>
          <PlusCircle size={16}/> Add Account
        </button>
      </div>
      {assetAccounts.length>0&&(
        <div style={{marginBottom:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
            <Building2 size={13} style={{color:"#22c55e"}}/>
            <span style={{color:"#22c55e",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Assets</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {assetAccounts.map(a=><AccountCard key={a.id} acc={a}/>)}
          </div>
        </div>
      )}
      {liabAccounts.length>0&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.5rem"}}>
            <CreditCard size={13} style={{color:"#ef4444"}}/>
            <span style={{color:"#ef4444",fontSize:"0.72rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Liabilities</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"0.5rem"}}>
            {liabAccounts.map(a=><AccountCard key={a.id} acc={a}/>)}
          </div>
        </div>
      )}
      {accounts.length===0&&<div style={{padding:"2rem",textAlign:"center",color:"#475569",fontSize:"0.875rem"}}>No accounts yet. Add your bank accounts, cards, and registered accounts.</div>}
      {showAdd&&(
        <Modal title={editId?"Edit Account":"Add Account"} onClose={()=>setShowAdd(false)}>
          <div style={{marginBottom:"0.85rem"}}>
            <label style={{display:"block",color:"#94a3b8",fontSize:"0.75rem",marginBottom:"0.5rem",letterSpacing:"0.05em",textTransform:"uppercase"}}>Type</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem"}}>
              {[
                {v:"asset",     label:"💰 Asset",    sub:"Money you own", ac:"#22c55e"},
                {v:"liability", label:"💳 Liability", sub:"Money you owe", ac:"#ef4444"},
              ].map(opt=>(
                <button key={opt.v} onClick={()=>setForm(f=>({...f,kind:opt.v,category:ACCOUNT_CATEGORIES[opt.v][0]}))}
                  style={{padding:"0.65rem 0.5rem",borderRadius:"0.625rem",cursor:"pointer",textAlign:"left",
                    border:form.kind===opt.v?`1px solid ${opt.ac}55`:"1px solid #2d2d4e",
                    background:form.kind===opt.v?`${opt.ac}12`:"#0f0f23"}}>
                  <div style={{color:form.kind===opt.v?opt.ac:"#94a3b8",fontWeight:700,fontSize:"0.85rem"}}>{opt.label}</div>
                  <div style={{color:"#475569",fontSize:"0.72rem",marginTop:"0.15rem"}}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
          <Sel label="Category" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} options={ACCOUNT_CATEGORIES[form.kind]}/>
          <Inp label="Account Name" placeholder="e.g. TD Chequing" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
            <Inp label="Balance ($)" type="number" placeholder="0.00" value={form.balance} onChange={e=>setForm(f=>({...f,balance:e.target.value}))}/>
            <Inp label="Emoji" placeholder="🏦" value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}/>
          </div>
          <button onClick={save} style={{width:"100%",marginTop:"0.5rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:700,fontSize:"0.9rem"}}>
            {editId?"Save Changes":"Add Account"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ─── GOALS ────────────────────────────────────────────────────────────────────
function Goals({data,setData}){
  const [showAdd,setShowAdd]         = useState(false);
  const [showDeposit,setShowDeposit] = useState(null);
  const [form,setForm]               = useState({name:"",target:"",saved:"",emoji:"🎯"});
  const [deposit,setDeposit]         = useState("");
  function add(){
    if(!form.name||!form.target)return;
    const colors=["#f97316","#3b82f6","#a855f7","#22c55e","#ec4899","#14b8a6"];
    setData(d=>({...d,goals:[...d.goals,{id:Date.now(),...form,target:parseFloat(form.target),saved:parseFloat(form.saved)||0,color:colors[d.goals.length%colors.length]}]}));
    setShowAdd(false);setForm({name:"",target:"",saved:"",emoji:"🎯"});
  }
  function addDeposit(id){
    const amt=parseFloat(deposit);if(!amt||isNaN(amt))return;
    setData(d=>({...d,goals:d.goals.map(g=>g.id===id?{...g,saved:Math.min(g.saved+amt,g.target)}:g)}));
    setShowDeposit(null);setDeposit("");
  }
  function remove(id){setData(d=>({...d,goals:d.goals.filter(g=>g.id!==id)}));}
  const totalSaved=data.goals.reduce((s,g)=>s+g.saved,0);
  const totalTarget=data.goals.reduce((s,g)=>s+g.target,0);
  return(
    <div>
      <div style={{background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.875rem",padding:"1rem",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:"#64748b",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>Total Saved</div>
          <div style={{color:"#e2e8f0",fontSize:"1.4rem",fontWeight:700,fontFamily:"'Playfair Display',serif"}}>{fmt(totalSaved)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{color:"#64748b",fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.05em"}}>Total Target</div>
          <div style={{color:"#6366f1",fontSize:"1.1rem",fontWeight:700}}>{fmt(totalTarget)}</div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"1rem"}}>
        <button onClick={()=>setShowAdd(true)} style={{display:"flex",alignItems:"center",gap:"0.4rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.55rem 1rem",cursor:"pointer",fontWeight:600,fontSize:"0.85rem"}}>
          <PlusCircle size={16}/> Add Goal
        </button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
        {data.goals.map(g=>{
          const pct=Math.min((g.saved/g.target)*100,100),done=g.saved>=g.target;
          return(
            <div key={g.id} style={{background:"#1a1a2e",border:`1px solid ${done?"rgba(34,197,94,0.3)":"#2d2d4e"}`,borderRadius:"0.875rem",padding:"1rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"0.75rem"}}>
                <div style={{display:"flex",gap:"0.65rem",alignItems:"center"}}>
                  <span style={{fontSize:"1.5rem"}}>{g.emoji}</span>
                  <div>
                    <div style={{color:"#e2e8f0",fontWeight:600,fontSize:"0.9rem"}}>{g.name} {done&&"✅"}</div>
                    <div style={{color:"#64748b",fontSize:"0.75rem"}}>{fmt(g.saved)} of {fmt(g.target)}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                  <span style={{color:g.color,fontWeight:700,fontSize:"0.875rem"}}>{Math.round(pct)}%</span>
                  <button onClick={()=>remove(g.id)} style={{background:"none",border:"none",color:"#475569",cursor:"pointer"}}><X size={14}/></button>
                </div>
              </div>
              <div style={{height:"8px",background:"#0f0f23",borderRadius:"4px",marginBottom:"0.75rem"}}>
                <div style={{height:"8px",background:done?"#22c55e":g.color,borderRadius:"4px",width:`${pct}%`,transition:"width 0.6s ease"}}/>
              </div>
              {!done&&(
                <button onClick={()=>setShowDeposit(g.id)} style={{display:"flex",alignItems:"center",gap:"0.35rem",color:g.color,background:`${g.color}15`,border:`1px solid ${g.color}40`,borderRadius:"0.4rem",padding:"0.35rem 0.75rem",cursor:"pointer",fontSize:"0.8rem",fontWeight:600}}>
                  <PlusCircle size={13}/> Add Funds
                </button>
              )}
            </div>
          );
        })}
      </div>
      {showAdd&&(
        <Modal title="New Savings Goal" onClose={()=>setShowAdd(false)}>
          <Inp label="Goal Name" placeholder="e.g. Dream Vacation" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
          <Inp label="Emoji" placeholder="🎯" value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}/>
          <Inp label="Target Amount ($)" type="number" placeholder="0.00" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))}/>
          <Inp label="Already Saved ($)" type="number" placeholder="0.00" value={form.saved} onChange={e=>setForm(f=>({...f,saved:e.target.value}))}/>
          <button onClick={add} style={{width:"100%",marginTop:"0.5rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:700,fontSize:"0.9rem"}}>Create Goal</button>
        </Modal>
      )}
      {showDeposit&&(
        <Modal title="Add Funds" onClose={()=>setShowDeposit(null)}>
          <Inp label="Amount ($)" type="number" placeholder="0.00" value={deposit} onChange={e=>setDeposit(e.target.value)}/>
          <button onClick={()=>addDeposit(showDeposit)} style={{width:"100%",marginTop:"0.5rem",background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff",border:"none",borderRadius:"0.5rem",padding:"0.65rem",cursor:"pointer",fontWeight:700,fontSize:"0.9rem"}}>Deposit</button>
        </Modal>
      )}
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS         = ["Overview","Transactions","Budgets","Accounts","Goals"];
const MONTH_SCOPED = [true, true, true, false, false];

export default function App(){
  const now = new Date();
  const [tab,setTab]     = useState(0);
  const [year,setYear]   = useState(now.getFullYear());
  const [month,setMonth] = useState(now.getMonth());
  const [showCatMgr,setShowCatMgr] = useState(false);
  const [data,setData,loaded,saveStatus,forceSave] = usePersistedState(STORAGE_KEY, SEED_DATA);
  const currentYM = ym(year,month);
  const monthTxs  = data.transactions.filter(t=>txMonth(t)===currentYM);
  const tabIcons=[<BarChart3 size={15}/>,<TrendingDown size={15}/>,<Wallet size={15}/>,<Building2 size={15}/>,<Target size={15}/>];

  if(!loaded){
    return(
      <div style={{minHeight:"100vh",background:"#0f0f23",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{color:"#6366f1",fontFamily:"'DM Sans',sans-serif",fontSize:"0.9rem",display:"flex",alignItems:"center",gap:"0.5rem"}}>
          <RefreshCw size={16} style={{animation:"spin 1s linear infinite"}}/> Loading…
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"#0f0f23",fontFamily:"'DM Sans',sans-serif",color:"#e2e8f0"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{background:"linear-gradient(180deg,#1a1a2e 0%,#0f0f23 100%)",borderBottom:"1px solid #2d2d4e",padding:"1rem 1rem 0"}}>
        <div style={{maxWidth:"480px",margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.75rem"}}>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",fontWeight:700,background:"linear-gradient(135deg,#a5b4fc,#c4b5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>Ledger</h1>
            <div style={{display:"flex",gap:"0.4rem",alignItems:"center"}}>
              <SaveBadge status={saveStatus} onSave={forceSave}/>
              <button onClick={()=>setShowCatMgr(true)} style={{display:"flex",alignItems:"center",gap:"0.35rem",background:"#1a1a2e",border:"1px solid #2d2d4e",borderRadius:"0.4rem",padding:"0.3rem 0.6rem",cursor:"pointer",color:"#94a3b8",fontSize:"0.72rem",fontWeight:600}}>
                <Tag size={12}/> Categories
              </button>
            </div>
          </div>
          {MONTH_SCOPED[tab]&&(
            <div style={{marginBottom:"0.75rem"}}>
              <MonthNav year={year} month={month} setYear={setYear} setMonth={setMonth} allTransactions={data.transactions}/>
            </div>
          )}
          <div style={{display:"flex",gap:"0.05rem",overflowX:"auto"}}>
            {TABS.map((t,i)=>(
              <button key={t} onClick={()=>setTab(i)}
                style={{display:"flex",alignItems:"center",gap:"0.3rem",padding:"0.55rem 0.65rem",background:"none",border:"none",
                  borderBottom:i===tab?"2px solid #8b5cf6":"2px solid transparent",
                  color:i===tab?"#a5b4fc":"#64748b",cursor:"pointer",fontSize:"0.78rem",fontWeight:i===tab?600:400,whiteSpace:"nowrap",transition:"all 0.2s"}}>
                {tabIcons[i]}{t}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{maxWidth:"480px",margin:"0 auto",padding:"1.25rem 1rem 5rem"}}>
        {tab===0&&<Overview data={data} monthTxs={monthTxs}/>}
        {tab===1&&<Transactions data={data} setData={setData} monthTxs={monthTxs} year={year} month={month}/>}
        {tab===2&&<Budgets data={data} setData={setData} monthTxs={monthTxs}/>}
        {tab===3&&<Accounts data={data} setData={setData}/>}
        {tab===4&&<Goals data={data} setData={setData}/>}
      </div>
      {showCatMgr&&<CategoryManager data={data} setData={setData} onClose={()=>setShowCatMgr(false)}/>}
    </div>
  );
}
