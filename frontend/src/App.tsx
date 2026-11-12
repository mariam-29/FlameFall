import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown,
  CircleAlert, ClipboardList, Database, ExternalLink, FileText, Flame, FlaskConical,
  GitCompareArrows, Info, LoaderCircle, Menu, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  X
} from 'lucide-react';
import { EvaluateRequestSchema } from '../../src/lib/schema';

type AnyRecord = Record<string, any>;
type Evaluation = AnyRecord;
type Health = {
  status: 'ok'; catalog_version: string; sha256_hash: string; generated_at: string;
  counts: Record<string, number>; ai_mode_configured: 'live_ai_ready' | 'reviewed_fallback_only';
  exports: Record<string, string>;
};
type Source = { id: string; publisher: string; title: string; url: string; doi_or_ntrs_id: string; version: string; accessed_date: string; reuse_terms: string };
type Manifest = { catalog_version: string; sha256_hash: string; counts: Record<string, number>; sources: Record<string, Source>; exclusions: unknown[] };
const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

function isRecord(value: unknown): value is AnyRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function validateApiResponse(path: string, value: unknown): AnyRecord {
  if (!isRecord(value)) throw new Error(`Invalid response from ${path}: expected an object`);
  if (path === '/api/health' && (value.status !== 'ok' || typeof value.catalog_version !== 'string' || !isRecord(value.counts) || !isRecord(value.exports))) throw new Error('Invalid health response from the FlameFall API');
  if (path === '/api/export/manifest' && (typeof value.catalog_version !== 'string' || !isRecord(value.sources) || !isRecord(value.counts))) throw new Error('Invalid source manifest returned by the FlameFall API');
  if ((path === '/api/evaluate' || path === '/api/explain') && (typeof value.catalog_version !== 'string' || !Array.isArray(value.ranked_investigations) || !isRecord(value.applicability))) throw new Error(`Invalid ${path.slice(5)} response returned by the FlameFall API`);
  if (path === '/api/explain' && (!isRecord(value.explanation) || !Array.isArray(value.citations))) throw new Error('Invalid explanation response returned by the FlameFall API');
  return value;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let request = init;
  if ((path === '/api/evaluate' || path === '/api/explain') && init.method?.toUpperCase() === 'POST' && typeof init.body === 'string') {
    let value: unknown;
    try { value = JSON.parse(init.body); } catch { throw new Error(`Invalid JSON request for ${path}`); }
    const parsed = EvaluateRequestSchema.safeParse(value);
    if (!parsed.success) throw new Error(`Request does not match the backend contract: ${parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    request = { ...init, body: JSON.stringify(parsed.data) };
  }
  const response = await fetch(`${API_BASE}${path}`, { ...request, headers: { ...(request.body ? { 'Content-Type': 'application/json' } : {}), ...request.headers } });
  if (!response.ok) {
    let payload: AnyRecord = {};
    try { payload = await response.json(); } catch { /* non-JSON error */ }
    const error = new Error(payload.error || `Request failed (${response.status})`) as Error & { status?: number; payload?: AnyRecord };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return validateApiResponse(path, await response.json()) as T;
}

function useHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setHealth(await api<Health>('/api/health')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Backend unavailable'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { health, error, refresh };
}

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const links = [['/explore', 'Explore'], ['/runs', 'Run explorer'], ['/compare', 'Compare runs'], ['/sources', 'Sources'], ['/about', 'About the data']];
  return <header className="topbar">
    <NavLink className="brand" to="/"><span className="brand-icon"><Flame size={19}/></span><span>FLAME FALL<small>RESEARCH, REIMAGINED</small></span></NavLink>
    <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
    <nav className={open ? 'nav-links open' : 'nav-links'}>{links.map(([href, label]) => <NavLink key={href} to={href}>{label}</NavLink>)}</nav>
    <a className="header-download" href={`${API_BASE}/api/export/manifest`}><ArrowDownToLine size={14}/> Data exports</a>
  </header>;
}

function Landing() {
  const [question, setQuestion] = useState('');
  const navigate = useNavigate();
  const submit = (e: FormEvent) => { e.preventDefault(); navigate(`/explore?question=${encodeURIComponent(question)}`); };
  return <>
    <main className="hero">
      <div className="hero-copy"><p className="eyebrow"><i/> COMBUSTION RESEARCH / SPACE SCIENCE</p><h1>Explore fire<br/>research in space.</h1>
        <p className="hero-lead">Explore reviewed combustion experiments beyond Earth. Compare what researchers observed, understand where findings apply, and follow every claim back to its evidence.</p>
        <form className="hero-search" onSubmit={submit}><Search size={18}/><input aria-label="Research question" value={question} maxLength={500} onChange={e => setQuestion(e.target.value)} placeholder="What would you like to investigate?"/><button aria-label="Explore research"><ArrowUpRight size={19}/></button></form>
        <div className="hero-chips"><NavLink to="/explore?preset=iss_acrylic_experiment">ISS acrylic experiment</NavLink><NavLink to="/explore?preset=illustrative_lunar_rover">Lunar rover scenario</NavLink><NavLink to="/explore?preset=custom_scenario">Build your own</NavLink></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="fire-orb"/><div className="orb-ring"/><div className="evidence-float"><span>✳</span><div><b>Evidence first.</b><small>Every claim has a source.</small></div><ArrowUpRight size={16}/></div></div>
      <div className="hero-foot"><span>01 / RESEARCH, NOT ASSUMPTIONS</span><span>SCROLL TO EXPLORE ↓</span></div>
    </main>
    <section className="landing-section"><p className="eyebrow">A RESEARCH WORKSPACE</p><h2>From a question to<br/>evidence you can trust.</h2><p className="section-lead">A focused view of space-combustion research — with clear boundaries between verified observations, approximate values, and what remains unknown.</p>
      <div className="feature-grid"><article><Search/><small>01 / DISCOVER</small><h3>Explore the evidence</h3><p>Search investigations and filter reviewed runs by platform, material, geometry, and experimental conditions.</p><NavLink to="/explore">Open workspace <ArrowUpRight size={14}/></NavLink></article><article><GitCompareArrows/><small>02 / COMPARE</small><h3>Compare reviewed runs</h3><p>Inspect experiments side by side. See which parameters match, differ, or were not reported.</p><NavLink to="/compare">Compare runs <ArrowUpRight size={14}/></NavLink></article><article><BookOpen/><small>03 / TRACE</small><h3>Follow every source</h3><p>Open evidence records, inspect page locators, and trace findings to their original publications.</p><NavLink to="/sources">Browse sources <ArrowUpRight size={14}/></NavLink></article></div>
    </section>
  </>;
}

function StatusPill({ value }: { value?: string | null }) {
  const raw = value || 'unknown';
  const label = raw.replaceAll('_', ' ');
  return <span className={`status status-${raw}`}>{label}</span>;
}

function EvidenceDrawer({ item, onClose }: { item: AnyRecord | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (item) closeRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [item, onClose]);
  if (!item) return null;
  const sourceUrl = typeof item.source_url === 'string' && /^https?:\/\//i.test(item.source_url) ? item.source_url : '';
  return <div className="drawer-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><aside className="evidence-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <div className="drawer-head"><div><p className="eyebrow">EVIDENCE RECORD</p><h2 id="drawer-title">{item.evidence_id || item.source_title || 'Evidence details'}</h2></div><button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close evidence"><X/></button></div>
    <div className="drawer-body"><div className="evidence-fact">{item.reviewed_fact || item.statement || 'No reviewed fact is available for this record.'}</div>
      <Detail label="Source" value={item.source_title}/><Detail label="DOI / NTRS ID" value={item.doi_or_ntrs_id}/><Detail label="Record" value={item.record_id}/><Detail label="Scope" value={item.scope}/><Detail label="Page" value={item.page_display || item.printed_page || item.pdf_page}/><Detail label="Locator" value={item.locator_detail}/><Detail label="Quality" value={item.quality_flag}/><Detail label="Measurement basis" value={item.measurement_basis}/><Detail label="Original value" value={[item.original_value,item.original_unit].filter(Boolean).join(' ')}/><Detail label="Normalized value" value={[item.normalized_value,item.normalized_unit].filter(v => v !== null && v !== undefined).join(' ')}/>
      {sourceUrl && <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">Open original publication <ExternalLink size={14}/></a>}
    </div>
  </aside></div>;
}
function Detail({ label, value }: { label: string; value?: unknown }) { return <div className="detail-row"><span>{label}</span><b>{value === null || value === undefined || value === '' ? 'Unreported' : String(value)}</b></div>; }

function useEvidence() {
  const [active, setActive] = useState<AnyRecord | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const open = useCallback((item: AnyRecord | undefined) => { if (item) { returnFocusRef.current = document.activeElement as HTMLElement | null; setActive(item); } }, []);
  const close = useCallback(() => { setActive(null); window.setTimeout(() => returnFocusRef.current?.focus(), 0); }, []);
  return { active, open, close };
}

function ClaimCard({ claim, citations, onEvidence }: { claim: AnyRecord; citations: AnyRecord[]; onEvidence: (item: AnyRecord | undefined) => void }) {
  const refs = (claim.evidence_ids || []).map((id: string) => citations.find(c => c.evidence_id === id)).filter(Boolean);
  return <article className="claim-card"><p>{claim.statement}</p>{claim.numeric_facts?.length > 0 && <div className="numeric-facts">{claim.numeric_facts.map((fact: AnyRecord, i: number) => <span key={i}><b>{fact.value} {fact.unit}</b><small>{fact.label} · {fact.basis}</small></span>)}</div>}{refs.length > 0 && <div className="citation-list">{refs.map((ref: AnyRecord) => <button key={ref.evidence_id} onClick={() => onEvidence(ref)}><BookOpen size={13}/>{ref.evidence_id}</button>)}</div>}</article>;
}

function Explore() {
  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState(params.get('question') || '');
  const [preset, setPreset] = useState(params.get('preset') || '');
  const [task, setTask] = useState('');
  const [material, setMaterial] = useState('');
  const [geometry, setGeometry] = useState('');
  const [gravity, setGravity] = useState('');
  const [oxygen, setOxygen] = useState('');
  const [pressure, setPressure] = useState('');
  const [airflow, setAirflow] = useState('');
  const [result, setResult] = useState<Evaluation | null>(null);
  const [explanation, setExplanation] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [error, setError] = useState('');
  const evidence = useEvidence();
  const abortRef = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const scenario = useMemo(() => ({ ...(preset ? { preset } : {}), ...(task ? { task } : {}), ...(material ? { material } : {}), ...(geometry ? { geometry_shape: geometry } : {}), ...(gravity ? { gravity_regime: gravity } : {}), ...(oxygen !== '' ? { oxygen_pct: Number(oxygen) } : {}), ...(pressure !== '' ? { pressure_kpa: Number(pressure), pressure_psia: null } : {}), ...(airflow !== '' ? { airflow_cm_s: Number(airflow) } : {}) }), [preset, task, material, geometry, gravity, oxygen, pressure, airflow]);
  const run = async (e?: FormEvent, retryVersion?: string) => {
    e?.preventDefault(); abortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; const id = ++requestRef.current;
    setLoading(true); setError(''); setParams(preset ? { preset } : {});
    const body: AnyRecord = { ...(Object.keys(scenario).length ? { scenario } : {}), ...(question.trim() ? { question: question.trim() } : {}), ...(retryVersion ? { catalog_version: retryVersion } : {}) };
    try {
      let evaluated: Evaluation;
      try { evaluated = await api<Evaluation>('/api/evaluate', { method: 'POST', body: JSON.stringify(body), signal: controller.signal }); }
      catch (err) { if ((err as any).status === 409 && !retryVersion) evaluated = await api<Evaluation>('/api/evaluate', { method: 'POST', body: JSON.stringify({ ...body, catalog_version: undefined }), signal: controller.signal }); else throw err; }
      if (id !== requestRef.current) return;
      setResult(evaluated); setExplanation(null); setLoading(false);
      if (question.trim() || preset || Object.keys(scenario).length) {
        setExplainLoading(true);
        try {
          const explainBody = { ...body, catalog_version: evaluated.catalog_version };
          const explained = await api<AnyRecord>('/api/explain', { method: 'POST', body: JSON.stringify(explainBody), signal: controller.signal });
          if (id === requestRef.current) setExplanation(explained);
        } catch (err) {
          if ((err as any).status === 409 && id === requestRef.current) {
            try { const fresh = await api<Evaluation>('/api/evaluate', { method: 'POST', body: JSON.stringify(body), signal: controller.signal }); setResult(fresh); const again = await api<AnyRecord>('/api/explain', { method: 'POST', body: JSON.stringify({ ...body, catalog_version: fresh.catalog_version }), signal: controller.signal }); if (id === requestRef.current) setExplanation(again); }
            catch (retryError) { if (id === requestRef.current) setError(retryError instanceof Error ? retryError.message : 'Explanation retry failed'); }
          } else if ((err as Error).name !== 'AbortError' && id === requestRef.current) setError(`Results loaded, but explanation failed: ${(err as Error).message}`);
        } finally { if (id === requestRef.current) setExplainLoading(false); }
      }
    } catch (err) { if ((err as Error).name !== 'AbortError' && id === requestRef.current) setError((err as Error).message); }
    finally { if (id === requestRef.current) setLoading(false); }
  };
  useEffect(() => { if (params.get('question') || params.get('preset')) void run(); /* initial shared URL only */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ranked = result?.ranked_investigations || [];
  const citations = explanation?.citations || [];
  return <main className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">RESEARCH WORKSPACE / 01</p><h1>Explore the evidence.</h1><p>Explore combustion research. See what was observed — and where the evidence stops.</p></div><span className="page-index">01 / 05</span></div>
    <div className="explore-layout"><form className="scenario-panel panel" onSubmit={run}><div className="panel-title"><span><SlidersHorizontal size={15}/> Scenario builder</span><button type="button" className="text-button" onClick={() => { setQuestion('');setPreset('');setTask('');setMaterial('');setGeometry('');setGravity('');setOxygen('');setPressure('');setAirflow('');setResult(null);setExplanation(null); }}>Reset</button></div>
      <label>Research question<textarea rows={4} maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} placeholder="What would you like to understand about this experiment?"/></label>
      <label>Preset<select value={preset} onChange={e => setPreset(e.target.value)}><option value="">Browse the collection</option><option value="iss_acrylic_experiment">ISS acrylic experiment</option><option value="illustrative_lunar_rover">Illustrative lunar rover</option><option value="custom_scenario">Custom scenario</option></select></label>
      <label>Research task<select value={task} onChange={e => setTask(e.target.value)}><option value="">Not specified</option><option value="materials_and_ventilation">Materials & ventilation</option><option value="larger_fire_spread">Larger fire spread</option><option value="smoke_detection">Smoke detection</option><option value="suppression">Suppression</option></select></label>
      <div className="field-grid"><label>Material<input value={material} onChange={e => setMaterial(e.target.value)} placeholder="e.g. PMMA"/></label><label>Geometry<input value={geometry} onChange={e => setGeometry(e.target.value)} placeholder="e.g. rod"/></label></div>
      <label>Gravity regime<select value={gravity} onChange={e => setGravity(e.target.value)}><option value="">Not specified</option><option value="microgravity">Microgravity</option><option value="lunar_1_6g">Lunar · 1/6 g</option><option value="martian_0_38g">Martian · 0.38 g</option><option value="earth_1g">Earth · 1 g</option><option value="partial_g_other">Other partial gravity</option></select></label>
      <div className="field-grid"><label>Oxygen (%)<input type="number" min="0" max="100" step="0.1" value={oxygen} onChange={e => setOxygen(e.target.value)} placeholder="Unspecified"/></label><label>Pressure (kPa)<input type="number" min="0" max="500" step="0.1" value={pressure} onChange={e => setPressure(e.target.value)} placeholder="Unspecified"/></label></div>
      <label>Airflow (cm/s)<input type="number" min="0" max="500" step="0.1" value={airflow} onChange={e => setAirflow(e.target.value)} placeholder="Unspecified"/></label>
      <button className="primary-button full" disabled={loading}>{loading ? <LoaderCircle className="spin" size={16}/> : <FlaskConical size={16}/>} {loading ? 'Evaluating scenario…' : 'Evaluate evidence'} <ArrowRight size={15}/></button>
      <p className="form-footnote">A relevance score is not a safety rating. Missing measurements remain unknown.</p>
    </form>
    <section className="results-column">
      {error && <div className="error-banner" role="alert"><CircleAlert size={17}/><span>{error}</span><button onClick={() => void run()}>Retry</button></div>}
      {!result && !loading && <div className="empty-state panel"><div className="empty-icon"><Search/></div><p className="eyebrow">START WITH A QUESTION</p><h2>Explore the collection.</h2><p>Choose a preset, enter a research question, or evaluate the full catalog to see which investigations contain relevant reviewed evidence.</p><button className="secondary-button" onClick={() => void run()}>Browse all evidence <ArrowRight size={15}/></button></div>}
      {loading && !result && <div className="loading-state panel"><LoaderCircle className="spin"/><p>Evaluating the reviewed catalog…</p></div>}
      {result && <>
        <div className="catalog-strip"><span><Database size={14}/> Catalog <b>{result.catalog_version}</b></span><span>{result.counts?.investigations ?? '—'} investigations</span><span>{result.counts?.verified_runs ?? '—'} verified runs</span><span>{result.latency_ms ?? '—'} ms</span></div>
        {result.resolved_scenario?.scenario_state === 'browse_or_insufficient_input' && <div className="notice-card"><Info size={17}/><div><b>Browse mode</b><p>{result.applicability?.combination_message || 'Add a question or scenario conditions to evaluate applicability. You can still explore runs and sources.'}</p></div></div>}
        {result.joint_match && <div className="joint-card"><div><p className="eyebrow">JOINT SCENARIO COVERAGE</p><h3>{result.joint_match.matching_verified_run_ids?.length ? 'Verified run match found' : 'No verified joint match'}</h3><p>{result.joint_match.message}</p></div><StatusPill value={result.joint_match.matching_verified_run_ids?.length ? 'verified' : 'unknown'}/></div>}
        <div className="section-head"><div><p className="eyebrow">CATALOG RESULTS</p><h2>Ranked investigations</h2></div><span>Study relevance · not a safety rating</span></div>
        {ranked.map((item: AnyRecord, index: number) => <article className="investigation-card" key={item.investigation_id}><div className="investigation-top"><div><small>0{index + 1} / {item.investigation_id}</small><h3>{item.title}</h3></div><div className="relevance-score"><b>{Number(item.study_relevance_score).toFixed(1)}</b><small>/ 100</small></div></div><p>{item.research_lead?.finding}</p><div className="investigation-meta"><StatusPill value={item.data_depth}/><span>{item.reviewed_run_count} reviewed runs</span><span>{item.published_run_count ?? 'Unreported'} published runs</span></div><details><summary>Why this study is relevant <ChevronDown size={14}/></summary><p>{item.research_lead?.limitation}</p><ul>{(item.matching_conditions || []).map((v: string, i: number) => <li key={i}>{v}</li>)}{(item.missing_or_mismatched_conditions || []).map((v: string, i: number) => <li key={`m${i}`}>{v}</li>)}</ul></details></article>)}
        <div className="section-head"><div><p className="eyebrow">EXPLANATION</p><h2>What the evidence says</h2></div>{explainLoading && <span className="muted"><LoaderCircle className="spin" size={14}/> Preparing explanation</span>}</div>
        {explanation?.explanation?.evidence_gap_warning && <div className="warning-card"><CircleAlert size={17}/><p>{explanation.explanation.evidence_gap_warning}</p></div>}
        {explanation?.mode && <div className="mode-line"><span className="mode-dot"/> {explanation.mode.replaceAll('_',' ')} · {explanation.provider_mode_detail?.replaceAll('_',' ')}</div>}
        {(['observed_findings','applicability_limits','missing_evidence'] as const).map((key) => { const claims = explanation?.explanation?.[key] || []; return claims.length ? <div className="claim-section" key={key}><h3>{({observed_findings:'Observed findings',applicability_limits:'Applicability limits',missing_evidence:'Missing evidence'} as AnyRecord)[key]}</h3>{claims.map((claim: AnyRecord, i: number) => <ClaimCard key={i} claim={claim} citations={citations} onEvidence={evidence.open}/>)}</div> : null; })}
        {explainLoading && !explanation && <div className="loading-inline"><LoaderCircle className="spin"/> The deterministic evaluation is ready. The explanation is still loading.</div>}
        {result.applicability?.rows?.length > 0 && <div className="panel applicability-panel"><div className="section-head"><div><p className="eyebrow">CONDITION-BY-CONDITION</p><h2>Applicability</h2></div></div>{result.applicability.rows.map((row: AnyRecord) => <div className="applicability-row" key={row.parameter}><b>{row.parameter.replaceAll('_',' ')}</b><span>{row.target_display}</span><small>{row.measurement_basis}</small><div>{row.study_comparisons?.slice(0,3).map((c: AnyRecord) => <p key={c.investigation_id}><StatusPill value={c.status}/> {c.study_value_display} — {c.reason}</p>)}</div></div>)}</div>}
      </>}
    </section></div>
    <EvidenceDrawer item={evidence.active} onClose={evidence.close}/>
  </main>;
}

function Runs() {
  const [data,setData] = useState<Evaluation|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [investigation,setInvestigation]=useState(''); const [platform,setPlatform]=useState(''); const [outcome,setOutcome]=useState(''); const [includeProvisional,setIncludeProvisional]=useState(false); const [pins,setPins]=useState<string[]>([]);
  const evidence=useEvidence();
  const load=useCallback(async (selected=pins) => {setLoading(true);setError('');try{const run_filters:AnyRecord={...(investigation?{investigation_id:investigation}:{}),...(platform?{facility_platform:platform}:{}),...(outcome?{observed_outcome:outcome}:{}),...(includeProvisional?{include_provisional:true}:{})};const result=await api<Evaluation>('/api/evaluate',{method:'POST',body:JSON.stringify({run_filters,selected_run_ids:selected})});setData(result);}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[investigation,platform,outcome,includeProvisional,pins]);
  useEffect(()=>{void load([]);},[]);
  const runs=data?.filtered_runs||[];
  const toggle=(id:string)=>{const next=pins.includes(id)?pins.filter(x=>x!==id):pins.length<2?[...pins,id]:[pins[1],id];setPins(next);void load(next);};
  return <main className="page-wrap"><PageTitle index="02 / 05" eyebrow="RESEARCH WORKSPACE / 02" title="Explore reviewed runs." subtitle="Filter the catalog, inspect reviewed measurements, and pin two distinct runs for comparison."/>
    <div className="filter-bar panel"><label>Investigation<select value={investigation} onChange={e=>setInvestigation(e.target.value)}><option value="">All investigations</option>{(data?.ranked_investigations||[]).map((x:AnyRecord)=><option key={x.investigation_id} value={x.investigation_id}>{x.title}</option>)}</select></label><label>Facility<select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">All platforms</option><option value="ISS_MGBX">ISS MGBX</option><option value="Drop_Tower">Drop Tower</option><option value="Sounding_Rocket_New_Shepard">Sounding Rocket</option><option value="ISS_CIR">ISS CIR</option><option value="Cygnus_Spacecraft">Cygnus spacecraft</option></select></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="">All outcomes</option><option value="quenching">Quenching</option><option value="blowoff">Blowoff</option><option value="sustained_burning">Sustained burning</option><option value="failed_sustained_ignition">Failed sustained ignition</option><option value="unclassified_test_end">Unclassified test end</option></select></label><label className="check-label"><input type="checkbox" checked={includeProvisional} onChange={e=>setIncludeProvisional(e.target.checked)}/> Include provisional</label><button className="primary-button" onClick={()=>void load()}>Apply filters</button></div>
    {error&&<div className="error-banner"><CircleAlert/>{error}<button onClick={()=>void load()}>Retry</button></div>}
    <div className="runs-toolbar"><div><p className="eyebrow">CATALOG RUNS</p><h2>{runs.length} runs found</h2></div><span>{pins.length}/2 pinned for comparison</span></div>
    {loading?<div className="loading-state panel"><LoaderCircle className="spin"/>Loading reviewed runs…</div>:runs.length===0?<div className="empty-state panel"><h2>No runs match these filters.</h2><p>Change or clear the filters to see the catalog again.</p><button className="secondary-button" onClick={()=>{setInvestigation('');setPlatform('');setOutcome('');setIncludeProvisional(false);setPins([]);}}>Clear filters</button></div>:<div className="run-grid">{runs.map((run:AnyRecord)=><article className="run-card panel" key={run.run_id}><div className="run-card-head"><span className="run-id">{run.original_run_id || run.run_id}</span><StatusPill value={run.review_status}/></div><h3>{run.material_variant}</h3><p>{run.facility_platform?.replaceAll('_',' ')} · {run.geometry_shape}</p><div className="run-values"><div><small>Gravity</small><b>{run.gravity_regime?.replaceAll('_',' ')}</b></div><div><small>Oxygen · initial</small><b>{run.initial_oxygen_pct == null ? 'Unreported' : `${run.initial_oxygen_pct}%`}</b></div><div><small>Oxygen · final</small><b>{run.final_oxygen_pct == null ? 'Unreported' : `${run.final_oxygen_pct}%`}</b></div><div><small>Pressure</small><b>{run.pressure_kpa == null ? 'Unreported' : `${run.pressure_kpa} kPa`}</b></div></div><div className="run-card-actions"><button className={pins.includes(run.run_id)?'pin-button selected':'pin-button'} onClick={()=>toggle(run.run_id)}>{pins.includes(run.run_id)?<Check size={14}/>:<GitCompareArrows size={14}/>} {pins.includes(run.run_id)?'Pinned':'Pin to compare'}</button><button className="text-button" onClick={()=>evidence.open(data?.evidence_drawers?.[run.run_id]?.[0])}>View evidence <ArrowUpRight size={13}/></button></div></article>)}</div>}
    <div className="sequence-panel panel"><div><p className="eyebrow">FIGURE 6.4 / EXPERIMENTAL SEQUENCE</p><h2>Flow and oxygen sequence</h2><p>This figure sequence is separate from the O15 run records. Approximate flow labels and unreported intermediate readings are preserved.</p></div><button className="secondary-button" onClick={()=>evidence.open(data?.evidence_drawers?.FIG_6_4?.[0])}>Open sequence evidence <BookOpen size={14}/></button>{(data?.phases||[]).length>0&&<div className="phase-list">{[...(data?.phases||[])].sort((a:AnyRecord,b:AnyRecord)=>a.ordinal-b.ordinal).map((phase:AnyRecord)=><div key={phase.phase_id}><b>Phase {phase.ordinal}</b><span>{phase.elapsed_time_s == null?'Time unreported':`${phase.elapsed_time_s} s`}</span><span>{phase.oxygen_pct == null?'O₂ unreported':`${phase.oxygen_pct}% O₂`}</span><span>{phase.raw_flow_display || 'Flow unreported'}</span><small>{phase.observation}</small></div>)}</div>}</div>
    <EvidenceDrawer item={evidence.active} onClose={evidence.close}/>
  </main>;
}

function Compare() {
  const [data,setData]=useState<Evaluation|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [a,setA]=useState('');const [b,setB]=useState('');const evidence=useEvidence();
  const load=useCallback(async (first=a,second=b)=>{setLoading(true);setError('');try{const selected=[first,second].filter(Boolean);setData(await api<Evaluation>('/api/evaluate',{method:'POST',body:JSON.stringify({selected_run_ids:selected})}));}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[a,b]);
  useEffect(()=>{void load('','');},[]);
  const runs=data?.filtered_runs||[];const comparison=data?.run_comparison;
  const setRun=(which:'a'|'b',value:string)=>{if(which==='a'){setA(value);void load(value,b);}else{setB(value);void load(a,value);}};
  return <main className="page-wrap"><PageTitle index="03 / 05" eyebrow="RESEARCH WORKSPACE / 03" title="Compare reviewed runs." subtitle="Compare two reviewed experiments across apparatus, conditions, measured quantities, and outcomes."/>
    <div className="compare-selectors"><label className="panel">RUN A<select value={a} onChange={e=>setRun('a',e.target.value)}><option value="">Choose first run</option>{runs.map((r:AnyRecord)=><option key={r.run_id} value={r.run_id}>{r.original_run_id} · {r.material_variant}</option>)}</select></label><div className="versus">VS</div><label className="panel">RUN B<select value={b} onChange={e=>setRun('b',e.target.value)}><option value="">Choose second run</option>{runs.filter((r:AnyRecord)=>r.run_id!==a).map((r:AnyRecord)=><option key={r.run_id} value={r.run_id}>{r.original_run_id} · {r.material_variant}</option>)}</select></label></div>
    {error&&<div className="error-banner"><CircleAlert/>{error}</div>}{loading?<div className="loading-state panel"><LoaderCircle className="spin"/>Preparing comparison…</div>:comparison?.status==='compared'?<>
      <div className="comparison-summary panel"><p className="eyebrow">COMPARISON SUMMARY</p><h2>{comparison.run_a_id} <span>↔</span> {comparison.run_b_id}</h2>{(comparison.summary_differences||[]).map((s:string,i:number)=><p key={i}>{s}</p>)}</div>
      {(comparison.confounders||[]).length>0&&<div className="confounders"><p className="eyebrow">INTERPRET WITH CARE</p><h2>Confounders and limitations</h2>{comparison.confounders.map((c:AnyRecord,i:number)=><div className="warning-card" key={i}><CircleAlert size={16}/><div><StatusPill value={c.severity}/><p>{c.message}</p></div></div>)}</div>}
      {Object.entries(comparison.sections||{}).map(([section,rows]:[string,any])=><section className="comparison-section panel" key={section}><h3>{section.replaceAll('_',' ')}</h3><div className="comparison-table-wrap"><table><thead><tr><th>Parameter</th><th>{comparison.run_a_id}</th><th>{comparison.run_b_id}</th><th>Status</th></tr></thead><tbody>{rows.map((row:AnyRecord,i:number)=><tr key={i}><td>{row.label}</td><td>{row.display_a}</td><td>{row.display_b}</td><td><StatusPill value={row.status}/></td></tr>)}</tbody></table></div></section>)}
    </>:<div className="empty-state panel"><GitCompareArrows/><h2>{comparison?.reason || 'Choose two different runs to compare.'}</h2><p>The comparison needs two valid run IDs. Unknown measurements will remain clearly marked.</p></div>}
    <EvidenceDrawer item={evidence.active} onClose={evidence.close}/>
  </main>;
}

function Sources() {
  const [manifest,setManifest]=useState<Manifest|null>(null);const [data,setData]=useState<Evaluation|null>(null);const [query,setQuery]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');const evidence=useEvidence();
  useEffect(()=>{Promise.all([api<Manifest>('/api/export/manifest'),api<Evaluation>('/api/evaluate',{method:'POST',body:JSON.stringify({})})]).then(([m,d])=>{setManifest(m);setData(d);}).catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));},[]);
  const sources:Source[] = Object.values(manifest?.sources || {});
  const filtered=sources.filter(s=>`${s.title} ${s.publisher} ${s.doi_or_ntrs_id} ${s.id}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page-wrap"><PageTitle index="04 / 05" eyebrow="RESEARCH WORKSPACE / 04" title="Sources & evidence." subtitle="Trace reviewed claims to source publications, evidence records, and page-level locators."/>
    <div className="source-search panel"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search source title, publisher, DOI, or ID…"/><span>{filtered.length} sources</span></div>
    {error&&<div className="error-banner"><CircleAlert/>{error}</div>}{loading?<div className="loading-state panel"><LoaderCircle className="spin"/>Loading source manifest…</div>:<div className="source-list">{filtered.map(source=><article className="source-card panel" key={source.id}><div className="source-icon"><FileText/></div><div className="source-content"><small>{source.id} · {source.publisher}</small><h3>{source.title}</h3><p>{source.doi_or_ntrs_id} · Version {source.version}</p><div className="source-meta"><span>Accessed {source.accessed_date}</span><span>{source.reuse_terms}</span></div>{source.url&&/^https?:\/\//i.test(source.url)&&<a href={source.url} target="_blank" rel="noreferrer">Open publication <ExternalLink size={13}/></a>}</div></article>)}</div>}
    {data&&<section className="panel evidence-index"><p className="eyebrow">EVIDENCE INDEX</p><h2>Evidence records in the active catalog</h2><p>Open evidence from the records returned by the backend. Each record retains its original scope and quality flag.</p><div className="evidence-buttons">{Object.entries(data.evidence_drawers||{}).slice(0,30).map(([key,items]:[string,any])=>(items||[]).slice(0,2).map((item:AnyRecord,i:number)=><button key={`${key}-${i}`} onClick={()=>evidence.open(item)}><BookOpen size={13}/>{item.evidence_id} <small>{key}</small></button>))}</div></section>}
    <EvidenceDrawer item={evidence.active} onClose={evidence.close}/>
  </main>;
}

function About() {
  const {health,error,refresh}=useHealth();const [manifest,setManifest]=useState<Manifest|null>(null);
  useEffect(()=>{api<Manifest>('/api/export/manifest').then(setManifest).catch(()=>undefined);},[]);
  const exclusionCount=manifest ? manifest.exclusions.length : 0;
  const counts=health?.counts||{};const exports=[['runs_csv','Runs · CSV'],['phases_csv','Phases · CSV'],['data_dictionary_json','Data dictionary · JSON'],['manifest_json','Source manifest · JSON']];
  return <main className="page-wrap"><PageTitle index="05 / 05" eyebrow="RESEARCH WORKSPACE / 05" title="About this collection." subtitle="Understand what the catalog contains, how records are reviewed, and where its coverage ends."/>
    <section className="health-card panel"><div><p className="eyebrow">LIVE BACKEND STATUS</p><h2>{health?.status==='ok'?'Catalog online':'Catalog status unavailable'}</h2><p>{health?.catalog_version ? `Catalog version ${health.catalog_version} · ${health.ai_mode_configured.replaceAll('_',' ')}` : error || 'Waiting for the API health endpoint.'}</p></div><button className="secondary-button" onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh status</button></section>
    <div className="metric-grid">{[['Sources',counts.sources],['Investigations',counts.investigations],['Verified runs',counts.verified_runs],['Provisional runs',counts.provisional_runs],['Published PMMA cohort',counts.published_pmma_cohort_runs],['Figure phases',counts.phases],['Evidence records',counts.evidence],['Exclusions',counts.exclusions]].map(([label,value])=><div className="metric-card panel" key={String(label)}><small>{label}</small><b>{value ?? '—'}</b></div>)}</div>
    <div className="notice-card"><ShieldCheck size={18}/><div><b>Review status is not the same as experimental coverage.</b><p>Verified run records, published cohort counts, and figure phases describe different evidence units. They must not be combined into one total.</p></div></div>
    <section className="panel exports-panel"><p className="eyebrow">CATALOG EXPORTS</p><h2>Download the source data</h2><p>Exports are generated by the backend and identify the catalog version used for the download.</p><div className="export-links">{exports.map(([key,label])=>{const path=health?.exports?.[key];return <a key={key} href={path?`${API_BASE}${path}`:'#'} onClick={e=>{if(!path)e.preventDefault();}} className={!path?'disabled':''}><ArrowDownToLine size={15}/>{label}<ArrowUpRight size={13}/></a>;})}</div></section>
    <section className="panel provenance-panel"><p className="eyebrow">PROVENANCE & LIMITATIONS</p><h2>Read the evidence in context.</h2><ul><li>Verified, provisional, approximate, assumed, and published-reference measurements are distinct.</li><li>Missing pressure or airflow values remain unreported; a proxy measurement must not be relabeled as a direct measurement.</li><li>LUCI shared-chamber observations cannot be attributed to one material independently.</li><li>Study relevance is a catalog ranking, not a prediction or operational safety rating.</li><li>Figure 6.4 phases are a separate experimental sequence, not additional O15 run records.</li></ul>{exclusionCount>0&&<p className="muted">The manifest includes {exclusionCount} exclusion and review records.</p>}</section>
  </main>;
}

function PageTitle({index,eyebrow,title,subtitle}:{index:string;eyebrow:string;title:string;subtitle:string}){return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div><span className="page-index">{index}</span></div>;}
function Footer(){return <footer className="footer"><span>FLAME FALL · SPACE COMBUSTION RESEARCH</span><span>Research evidence, not operational guidance.</span></footer>;}

export default function App(){return <div className="app-shell"><Header/><Routes><Route path="/" element={<Landing/>}/><Route path="/explore" element={<Explore/>}/><Route path="/runs" element={<Runs/>}/><Route path="/compare" element={<Compare/>}/><Route path="/sources" element={<Sources/>}/><Route path="/about" element={<About/>}/><Route path="*" element={<main className="page-wrap"><PageTitle index="404" eyebrow="NOT FOUND" title="This page isn't here." subtitle="Return to the research workspace."/><NavLink className="text-link" to="/">Back home <ArrowLeft size={14}/></NavLink></main>}/></Routes><Footer/></div>;}
